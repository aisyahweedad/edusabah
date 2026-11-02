export interface LoggerLike {
  warn(obj: unknown, msg?: string): void;
  error(obj: unknown, msg?: string): void;
  info?(obj: unknown, msg?: string): void;
}
import { and, desc, eq, inArray, ne, sql } from "drizzle-orm";
import { getDb } from "@k-aecs/database";
import {
  auditEvents,
  citizens,
  complaints,
  complaintStatusHistory,
  districts,
  notifications,
  officers,
} from "@k-aecs/database/schema";
import { classifyComplaint, heuristicAnalysis, textSimilarity } from "@k-aecs/ai";
import type { ComplaintAiAnalysis, Severity } from "@k-aecs/shared";

/**
 * UC-02 post-intake pipeline, executed inline after a complaint row exists:
 *
 *   1. AI classification (severity / sentiment / priority / safety flag)
 *   2. Duplicate detection against the citizen's open tickets
 *   3. Audit log entry (who/what/when + classification metadata)
 *   4. Officer notification records routed by category + district
 *   5. Automatic escalation for urgent / sensitive cases
 *
 * Every step is best-effort: intake must never fail because enrichment did.
 */

const SEVERITY_RANK: Record<Severity, number> = { low: 1, medium: 2, high: 3, urgent: 4 };

/** Categories considered sensitive enough to involve the Political Secretary. */
const SENSITIVE_CATEGORIES = new Set(["bullying", "welfare"]);

/** Map a complaint category to the officer unit that owns it. */
const CATEGORY_UNIT: Record<string, string> = {
  facility: "Facilities & Infrastructure",
  teacher: "Human Resources",
  bullying: "Student Affairs / Safety",
  transport: "Operations",
  canteen: "Operations",
  admission: "School Management",
  funding: "Welfare & Assistance",
  welfare: "Welfare & Assistance",
  curriculum: "Academic",
  other: "Triage",
};

export interface IntakeInput {
  complaintId: string;
  referenceNumber: string;
  telegramUserId: string;
  category: string;
  title: string;
  description: string;
  location?: string | null;
  districtCode?: string | null;
}

export interface IntakeOutcome {
  analysis: ComplaintAiAnalysis;
  duplicateOfId?: string;
  duplicateRef?: string;
  escalated: boolean;
  notifiedOfficerIds: string[];
}

async function writeAudit(
  db: ReturnType<typeof getDb>,
  entry: {
    actorKind: string;
    actorId: string;
    action: string;
    entityType?: string;
    entityId?: string;
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  try {
    await db.insert(auditEvents).values({
      actorKind: entry.actorKind,
      actorId: entry.actorId,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId,
      metadata: entry.metadata ?? {},
    });
  } catch (error) {
    console.error("[intake] audit write failed", error);
  }
}

async function recordNotification(
  db: ReturnType<typeof getDb>,
  entry: {
    complaintId: string;
    recipientType: string;
    recipientId: string;
    templateKey: string;
    payload: Record<string, unknown>;
  },
): Promise<void> {
  await db.insert(notifications).values({
    complaintId: entry.complaintId,
    channel: "in_app",
    recipientType: entry.recipientType,
    recipientId: entry.recipientId,
    templateKey: entry.templateKey,
    payload: entry.payload,
    status: "pending",
  });
}

/** Duplicate detection: same citizen's open tickets with similar content. */
async function detectDuplicate(
  db: ReturnType<typeof getDb>,
  input: IntakeInput,
  citizenId: string,
): Promise<{ id: string; referenceNumber: string; similarity: number } | undefined> {
  const openStatuses = ["submitted", "in_review", "assigned", "in_progress", "pending_info", "awaiting_ministry", "escalated"];
  const candidates = await db
    .select({
      id: complaints.id,
      referenceNumber: complaints.referenceNumber,
      title: complaints.title,
      description: complaints.description,
    })
    .from(complaints)
    .where(
      and(
        eq(complaints.citizenId, citizenId),
        ne(complaints.id, input.complaintId),
        inArray(complaints.status, openStatuses),
      ),
    )
    .orderBy(desc(complaints.createdAt))
    .limit(10);

  const newText = `${input.title} ${input.description}`;
  let best: { id: string; referenceNumber: string; similarity: number } | undefined;
  for (const candidate of candidates) {
    const similarity = textSimilarity(newText, `${candidate.title} ${candidate.description}`);
    if (similarity >= 0.55 && (!best || similarity > best.similarity)) {
      best = { id: candidate.id, referenceNumber: candidate.referenceNumber, similarity };
    }
  }
  return best;
}

/**
 * Officer routing: officers in the complaint's district first, then any
 * active kpsti_officer/system_admin as fallback. Recipients get an in-app
 * notification row (the admin panel polls /api/v1/notifications).
 */
async function routeOfficers(
  db: ReturnType<typeof getDb>,
  input: IntakeInput,
  districtName?: string,
): Promise<string[]> {
  const activeOfficers = await db
    .select({ id: officers.id, role: officers.role })
    .from(officers)
    .where(eq(officers.isActive, true));

  let districtId: string | undefined;
  if (input.districtCode) {
    const [row] = await db
      .select({ id: districts.id })
      .from(districts)
      .where(eq(districts.id, input.districtCode))
      .limit(1);
    districtId = row?.id;
  }
  if (!districtId && districtName) {
    const [row] = await db
      .select({ id: districts.id })
      .from(districts)
      .where(sql`lower(${districts.name}) = ${districtName.toLowerCase()}`)
      .limit(1);
    districtId = row?.id;
  }

  const eligible = activeOfficers.filter((o) => o.role === "kpsti_officer" || o.role === "supervisor" || o.role === "system_admin");
  const routed = eligible.filter((o) => o.role !== "system_admin");
  const targets = routed.length ? routed : eligible;

  const payload = {
    referenceNumber: input.referenceNumber,
    title: input.title,
    category: input.category,
    district: districtName ?? districtId ?? undefined,
    unit: CATEGORY_UNIT[input.category] ?? "Triage",
  };

  const notified: string[] = [];
  for (const officer of targets.slice(0, 10)) {
    await recordNotification(db, {
      complaintId: input.complaintId,
      recipientType: "officer",
      recipientId: officer.id,
      templateKey: "complaint.new",
      payload,
    });
    notified.push(officer.id);
  }
  return notified;
}

/** Political Secretary escalation for urgent/sensitive intake. */
async function escalateToSecretary(
  db: ReturnType<typeof getDb>,
  input: IntakeInput,
  analysis: ComplaintAiAnalysis,
): Promise<{ officerId?: string; notified: boolean }> {
  const secretaries = await db
    .select({ id: officers.id })
    .from(officers)
    .where(and(eq(officers.role, "political_secretary"), eq(officers.isActive, true)));
  if (!secretaries.length) return { notified: false };

  for (const secretary of secretaries) {
    await recordNotification(db, {
      complaintId: input.complaintId,
      recipientType: "political_secretary",
      recipientId: secretary.id,
      templateKey: "complaint.escalated",
      payload: {
        referenceNumber: input.referenceNumber,
        title: input.title,
        severity: analysis.severity,
        reason: analysis.sensitive ? "sensitive content" : "high severity",
      },
    });
  }
  return { officerId: secretaries[0]?.id, notified: true };
}

/** Persist AI analysis + severity onto the complaint row. */
async function persistAnalysis(
  db: ReturnType<typeof getDb>,
  complaintId: string,
  analysis: ComplaintAiAnalysis,
): Promise<void> {
  await db
    .update(complaints)
    .set({
      severity: analysis.severity,
      priorityScore: analysis.priorityScore,
      sentiment: analysis.sentiment,
      sensitive: analysis.sensitive,
      aiAnalysis: analysis as unknown as Record<string, unknown>,
      updatedAt: new Date(),
    })
    .where(eq(complaints.id, complaintId));
}

/** Move an urgent/sensitive complaint into the escalated state. */
async function applyEscalation(
  db: ReturnType<typeof getDb>,
  input: IntakeInput,
  currentStatus: string,
  analysis: ComplaintAiAnalysis,
): Promise<boolean> {
  const shouldEscalate =
    analysis.severity === "urgent" ||
    (analysis.severity === "high" && (analysis.sensitive || SENSITIVE_CATEGORIES.has(input.category)));
  if (!shouldEscalate || currentStatus === "escalated") return false;

  await db
    .update(complaints)
    .set({ status: "escalated", updatedAt: new Date() })
    .where(eq(complaints.id, input.complaintId));
  await db.insert(complaintStatusHistory).values({
    complaintId: input.complaintId,
    fromStatus: currentStatus,
    toStatus: "escalated",
    actorType: "system",
    actorId: "intake-pipeline",
    note: `Auto-escalated: severity=${analysis.severity}${analysis.sensitive ? ", sensitive content" : ""}`,
    metadata: { severity: analysis.severity, sensitive: analysis.sensitive },
  });
  return true;
}

/**
 * Run the full intake pipeline. Never throws — failures are logged and the
 * complaint keeps deterministic defaults (severity=medium etc).
 */
export async function runIntakePipeline(
  input: IntakeInput,
  citizenId: string,
  log?: LoggerLike,
): Promise<IntakeOutcome> {
  const db = getDb();
  const outcome: IntakeOutcome = {
    analysis: heuristicAnalysis(input as unknown as Parameters<typeof heuristicAnalysis>[0]),
    escalated: false,
    notifiedOfficerIds: [],
  };

  // 1) Classification — AI first, heuristics as fallback.
  try {
    outcome.analysis = await classifyComplaint({
      category: input.category as never,
      title: input.title,
      description: input.description,
      location: input.location ?? undefined,
      districtCode: input.districtCode ?? undefined,
    });
  } catch (error) {
    log?.warn({ err: error }, "AI classification failed; using heuristics");
  }

  // 2) Duplicate detection against the citizen's open tickets.
  try {
    const dup = await detectDuplicate(db, input, citizenId);
    if (dup) {
      outcome.duplicateOfId = dup.id;
      outcome.duplicateRef = dup.referenceNumber;
      outcome.analysis.duplicateOf = dup;
      await db
        .update(complaints)
        .set({ duplicateOf: dup.id, updatedAt: new Date() })
        .where(eq(complaints.id, input.complaintId));
    }
  } catch (error) {
    log?.warn({ err: error }, "duplicate detection failed");
  }

  // 3) Persist analysis onto the ticket.
  try {
    await persistAnalysis(db, input.complaintId, outcome.analysis);
  } catch (error) {
    log?.warn({ err: error }, "failed to persist AI analysis");
  }

  // 4) Audit trail.
  await writeAudit(db, {
    actorKind: "system",
    actorId: "intake-pipeline",
    action: "complaint.classified",
    entityType: "complaint",
    entityId: input.complaintId,
    metadata: {
      referenceNumber: input.referenceNumber,
      severity: outcome.analysis.severity,
      sentiment: outcome.analysis.sentiment,
      priorityScore: outcome.analysis.priorityScore,
      sensitive: outcome.analysis.sensitive,
      duplicateOf: outcome.duplicateRef,
      model: outcome.analysis.model,
    },
  });
  await writeAudit(db, {
    actorKind: "citizen",
    actorId: input.telegramUserId,
    action: "complaint.submitted",
    entityType: "complaint",
    entityId: input.complaintId,
    metadata: { referenceNumber: input.referenceNumber, category: input.category },
  });

  // 5) Officer notification (category + district routing).
  try {
    outcome.notifiedOfficerIds = await routeOfficers(db, input, outcome.analysis.district);
  } catch (error) {
    log?.warn({ err: error }, "officer routing failed");
  }

  // 6) Automatic escalation for urgent/sensitive cases.
  try {
    const [row] = await db
      .select({ status: complaints.status })
      .from(complaints)
      .where(eq(complaints.id, input.complaintId))
      .limit(1);
    if (row) {
      outcome.escalated = await applyEscalation(db, input, row.status, outcome.analysis);
      if (outcome.escalated) {
        await escalateToSecretary(db, input, outcome.analysis);
        await writeAudit(db, {
          actorKind: "system",
          actorId: "intake-pipeline",
          action: "complaint.escalated",
          entityType: "complaint",
          entityId: input.complaintId,
          metadata: { referenceNumber: input.referenceNumber, severity: outcome.analysis.severity },
        });
      }
    }
  } catch (error) {
    log?.warn({ err: error }, "escalation step failed");
  }

  return outcome;
}

/** Citizen-facing acknowledgement text including AI-derived expectations. */
export function acknowledgeText(referenceNumber: string, analysis: ComplaintAiAnalysis): string {
  const sla: Record<Severity, string> = {
    urgent: "1 hari bekerja",
    high: "3 hari bekerja",
    medium: "7 hari bekerja",
    low: "14 hari bekerja",
  };
  return sla[analysis.severity];
}

export { SEVERITY_RANK, SENSITIVE_CATEGORIES, CATEGORY_UNIT };

import { eq, sql } from "drizzle-orm";
import { getDb } from "@k-aecs/database";
import {
  citizens,
  complaints,
  complaintStatusHistory,
} from "@k-aecs/database/schema";
import { COMPLAINT_CATEGORIES, type ComplaintCategory } from "@k-aecs/shared";
import { runIntakePipeline } from "@k-aecs/intake";
import type { ToolContext } from "./registry.js";

/**
 * UC-02 via the AI harness: file a complaint ticket on the citizen's behalf
 * once they confirm in free-form chat. Runs the same pipeline as the REST
 * intake route (classify → dedupe → audit → notify → escalate) so both paths
 * produce identical records.
 */
export async function createComplaintTicket(
  params: Record<string, unknown>,
  ctx: ToolContext,
): Promise<string> {
  if (ctx.actorKind !== "citizen") {
    return "error: create_complaint may only be used by citizens on the official channel";
  }
  const telegramUserId = ctx.telegramChatId ?? ctx.actorId;
  if (!telegramUserId) {
    return "error: unable to identify the Telegram account submitting this complaint";
  }

  const category = String(params.category ?? "").trim().toLowerCase();
  if (!COMPLAINT_CATEGORIES.includes(category as ComplaintCategory)) {
    return `error: unknown category '${category}'. Valid: ${COMPLAINT_CATEGORIES.join(", ")}`;
  }
  const title = String(params.title ?? "").trim();
  const description = String(params.description ?? "").trim();
  if (title.length < 5) return "error: title must be at least 5 characters";
  if (description.length < 20) return "error: description must be at least 20 characters";
  const location = typeof params.location === "string" && params.location.trim()
    ? params.location.trim().slice(0, 200)
    : undefined;

  const db = getDb();

  // Resolve / create the citizen record.
  const [existing] = await db
    .select({ id: citizens.id })
    .from(citizens)
    .where(sql`${citizens.createdBy} = ${`tg:${telegramUserId}`}`)
    .limit(1);
  const citizenId = existing?.id ?? (await ensureCitizen(db, telegramUserId));

  // Generate the reference number (max-sequence, same as REST intake).
  const year = new Date().getFullYear();
  const prefix = `KPSTI-${year}-%`;
  const [seq] = await db
    .select({
      maxSeq: sql<number>`coalesce(max(cast(substr(${complaints.referenceNumber}, -6) as integer)), 0)`,
    })
    .from(complaints)
    .where(sql`${complaints.referenceNumber} like ${prefix}`);
  const referenceNumber = `KPSTI-${year}-${String((seq?.maxSeq ?? 0) + 1).padStart(6, "0")}`;

  const [created] = await db
    .insert(complaints)
    .values({
      referenceNumber,
      citizenId,
      telegramUserId,
      category: category as ComplaintCategory,
      title,
      description,
      location,
    })
    .returning();
  if (!created) return "error: complaint could not be created";

  await db.insert(complaintStatusHistory).values({
    complaintId: created.id,
    toStatus: created.status,
    actorType: "citizen",
    actorId: telegramUserId,
  });

  // Enrichment pipeline (classification, duplicates, audit, notifications,
  // escalation). Best-effort — the ticket exists either way.
  await runIntakePipeline(
    {
      complaintId: created.id,
      referenceNumber: created.referenceNumber,
      telegramUserId,
      category: created.category,
      title: created.title,
      description: created.description,
      location: created.location,
      districtCode: created.districtCode,
    },
    citizenId,
  );

  return [
    "OK — complaint ticket created.",
    `referenceNumber: ${created.referenceNumber}`,
    `status: ${created.status}`,
    "Tell the citizen their reference number and that they can check status via /menu → Semak Aduan.",
  ].join("\n");
}

async function ensureCitizen(db: ReturnType<typeof getDb>, telegramUserId: string): Promise<string> {
  const [created] = await db
    .insert(citizens)
    .values({ createdBy: `tg:${telegramUserId}`, name: `Telegram ${telegramUserId}` })
    .returning({ id: citizens.id });
  if (!created) throw new Error("failed to create citizen");
  return created.id;
}

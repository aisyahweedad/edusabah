/**
 * Shared role/permission + complaint-domain types. These are the source of
 * truth for RBAC across the API, the harness, and the admin UI.
 */

export const ROLES = ["kpsti_officer", "supervisor", "political_secretary", "system_admin"] as const;
export type Role = (typeof ROLES)[number];

/** Display aliases; "superadmin" is the user-facing name for system_admin. */
export const ROLE_LABELS: Record<Role, string> = {
  kpsti_officer: "Pegawai KPSTI",
  supervisor: "Penyelia",
  political_secretary: "Setiausaha Politik",
  system_admin: "Superadmin",
};

export const SUPERADMIN_ROLE: Role = "system_admin";

export const PERMISSIONS = [
  "complaint:view",
  "complaint:create",
  "complaint:assign",
  "complaint:update_status",
  "complaint:escalate",
  "complaint:close",
  "complaint:note",
  "citizen:view",
  "knowledge:manage",
  "analytics:view",
  "intelligence:research",
  "users:manage",
  "system:settings",
  "audit:view",
] as const;
export type Permission = (typeof PERMISSIONS)[number];

export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  kpsti_officer: [
    "complaint:view",
    "complaint:update_status",
    "complaint:note",
    "citizen:view",
    "analytics:view",
  ],
  supervisor: [
    "complaint:view",
    "complaint:assign",
    "complaint:update_status",
    "complaint:escalate",
    "complaint:close",
    "complaint:note",
    "citizen:view",
    "analytics:view",
  ],
  political_secretary: [
    "complaint:view",
    "complaint:note",
    "complaint:escalate",
    "citizen:view",
    "analytics:view",
    "intelligence:research",
  ],
  system_admin: [
    "complaint:view",
    "complaint:create",
    "complaint:assign",
    "complaint:update_status",
    "complaint:escalate",
    "complaint:close",
    "complaint:note",
    "citizen:view",
    "knowledge:manage",
    "analytics:view",
    "intelligence:research",
    "users:manage",
    "system:settings",
    "audit:view",
  ],
};

export function hasPermission(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}

export const MDY2019_REF_PREFIX = {
  institution: "SEK",
  districtOffice: "PPD",
  stateOffice: "JPN",
} as const;

export type ComplaintCategory =
  | "facility"
  | "teacher"
  | "bullying"
  | "transport"
  | "canteen"
  | "admission"
  | "funding"
  | "welfare"
  | "curriculum"
  | "other";

export const COMPLAINT_CATEGORIES: readonly ComplaintCategory[] = [
  "facility",
  "teacher",
  "bullying",
  "transport",
  "canteen",
  "admission",
  "funding",
  "welfare",
  "curriculum",
  "other",
];

export const COMPLAINT_STATUSES = [
  "submitted",
  "in_review",
  "assigned",
  "in_progress",
  "pending_info",
  "awaiting_ministry",
  "resolved",
  "closed",
  "escalated",
  "rejected",
] as const;
export type ComplaintStatus = (typeof COMPLAINT_STATUSES)[number];

/** Harness-assessed severity for a complaint (officer override supported). */
export const SEVERITIES = ["low", "medium", "high", "urgent"] as const;
export type Severity = (typeof SEVERITIES)[number];

/** AI intake analysis persisted onto a complaint. */
export interface ComplaintAiAnalysis {
  /** Severity proposed by the classifier (0-100 confidence). */
  severity: Severity;
  sentiment: "positive" | "neutral" | "negative";
  priorityScore: number;
  /** True when safety/profanity filter flagged the content. */
  sensitive: boolean;
  /** True when the classifier auto-categorised (vs citizen-selected). */
  autoCategory: boolean;
  /** Suggested category when it differs from the citizen selection. */
  suggestedCategory?: ComplaintCategory;
  /** Extracted district name, if any. */
  district?: string;
  summary: string;
  /** Duplicate candidate detected at intake. */
  duplicateOf?: { id: string; referenceNumber: string; similarity: number };
  model: string;
  analyzedAt: string;
}

/** Expected handling time per severity (UC-03 overdue evaluation). */
export const SEVERITY_SLA_HOURS: Record<Severity, number> = {
  urgent: 24,
  high: 72,
  medium: 168,
  low: 336,
};

export function slaHoursFor(severity: string | undefined): number {
  return SEVERITY_SLA_HOURS[(severity ?? "medium") as Severity] ?? SEVERITY_SLA_HOURS.medium;
}

/** A complaint is overdue when the SLA window has elapsed and it is still open. */
export function isOverdue(
  createdAt: Date | string | number,
  severity: string | undefined,
  status: string,
  now: Date = new Date(),
): boolean {
  const terminal = status === "resolved" || status === "closed" || status === "rejected";
  if (terminal) return false;
  const created = new Date(createdAt).getTime();
  if (Number.isNaN(created)) return false;
  return now.getTime() - created > slaHoursFor(severity) * 3_600_000;
}

/** States a post-ownership-verification complainant may still change. */
export const CITIZEN_EDITABLE_STATUSES: readonly ComplaintStatus[] = [
  "submitted",
  "in_review",
  "pending_info",
] as const;

export interface ComplaintRefInfo {
  code: string;
  seq: number;
  year: number;
}

export type MessageRole = "user" | "assistant" | "system" | "tool";

export type SourcePriority = 1 | 2 | 3 | 4;

export interface Citation {
  id: string;
  kind: "knowledge" | "government" | "approved" | "web";
  priority: SourcePriority;
  title: string;
  url?: string;
  source?: string;
  snippet: string;
  chunk?: string;
}

export interface ConversationMemory {
  conversationId: string;
  messages: ConversationMessage[];
}

export interface ConversationMessage {
  id: string;
  role: MessageRole;
  content: string;
  createdAt: string;
  toolCalls?: string[];
}

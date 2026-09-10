/**
 * Shared role/permission + complaint-domain types. These are the source of
 * truth for RBAC across the API, the harness, and the admin UI.
 */

export const ROLES = ["kpsti_officer", "supervisor", "political_secretary", "system_admin"] as const;
export type Role = (typeof ROLES)[number];

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

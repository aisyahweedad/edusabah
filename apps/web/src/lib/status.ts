export const STATUS_LABELS: Record<string, string> = {
  submitted: "Diterima",
  in_review: "Dalam Semakan",
  assigned: "Ditugaskan",
  in_progress: "Sedang Diproses",
  pending_info: "Menunggu Maklumat",
  awaiting_ministry: "Menunggu Kementerian",
  resolved: "Diselesaikan",
  closed: "Ditutup",
  escalated: "Dinaikkan Tahap",
  rejected: "Ditolak",
};

/** Semantic colour per status — mirrored in globals.css `--st-*` tokens. */
export const STATUS_COLORS: Record<string, string> = {
  submitted: "var(--st-submitted)",
  in_review: "var(--st-in_review)",
  assigned: "var(--st-assigned)",
  in_progress: "var(--st-in_progress)",
  pending_info: "var(--st-pending_info)",
  awaiting_ministry: "var(--st-awaiting_ministry)",
  resolved: "var(--st-resolved)",
  closed: "var(--st-closed)",
  escalated: "var(--st-escalated)",
  rejected: "var(--st-rejected)",
};

export function statusLabel(status: string): string {
  return STATUS_LABELS[status] ?? status.replace(/_/g, " ");
}

export function statusColor(status: string): string {
  return STATUS_COLORS[status] ?? "var(--st-assigned)";
}

/** Ordered statuses for the dashboard legend/axis. */
export const STATUS_ORDER = [
  "submitted",
  "in_review",
  "assigned",
  "in_progress",
  "pending_info",
  "awaiting_ministry",
  "escalated",
  "resolved",
  "closed",
  "rejected",
];

/** Badge class pair (solid dot + soft background) for a status. */
export function statusBadgeClasses(status: string): string {
  const base: Record<string, string> = {
    submitted: "color:#2563eb;background:#eff6ff;border-color:#bfdbfe",
    in_review: "color:#0284c7;background:#f0f9ff;border-color:#bae6fd",
    assigned: "color:#7c3aed;background:#f5f3ff;border-color:#ddd6fe",
    in_progress: "color:#b45309;background:#fffbeb;border-color:#fde68a",
    pending_info: "color:#0369a1;background:#f0f9ff;border-color:#bae6fd",
    awaiting_ministry: "color:#6b21a8;background:#faf5ff;border-color:#e9d5ff",
    resolved: "color:#047857;background:#ecfdf5;border-color:#a7f3d0",
    closed: "color:#475569;background:#f8fafc;border-color:#e2e8f0",
    escalated: "color:#c2410c;background:#fff7ed;border-color:#fed7aa",
    rejected: "color:#b91c1c;background:#fef2f2;border-color:#fecaca",
  };
  return base[status] ?? "color:#475569;background:#f8fafc;border-color:#e2e8f0";
}

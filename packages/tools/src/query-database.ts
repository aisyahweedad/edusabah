import { and, desc, gte, inArray, like, lte, or, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@k-aecs/database";
import { complaints } from "@k-aecs/database/schema";
import type { ToolContext } from "./registry.js";

export const queryComplaintsSchema = z.object({
  metric: z.enum(["count", "avg_resolution_hours", "avg_priority"]).default("count"),
  group_by: z
    .enum(["district", "category", "status", "severity", "month", "day", "officer", "none"])
    .default("none"),
  from: z.string().optional(),
  to: z.string().optional(),
  status: z.array(z.string()).optional(),
  category: z.array(z.string()).optional(),
  severity: z.array(z.string()).optional(),
  district_code: z.array(z.string()).optional(),
  search: z.string().max(200).optional(),
  limit: z.number().int().min(1).max(50).default(10),
});

export type QueryComplaintsInput = z.infer<typeof queryComplaintsSchema>;

export interface ComplaintInsightRow {
  key: string;
  label: string;
  value: number;
}

export interface ComplaintInsightData {
  metric: QueryComplaintsInput["metric"];
  groupBy: QueryComplaintsInput["group_by"];
  filters: {
    from?: string;
    to?: string;
    status?: string[];
    category?: string[];
    severity?: string[];
    districtCode?: string[];
    search?: string;
  };
  rows: ComplaintInsightRow[];
  chart: {
    type: "bar" | "donut" | "line";
    title: string;
    xKey: "label";
    yKey: "value";
  };
  total: number;
  generatedAt: string;
}

const METRIC_LABELS: Record<QueryComplaintsInput["metric"], string> = {
  count: "Bilangan aduan",
  avg_resolution_hours: "Purata masa penyelesaian (jam)",
  avg_priority: "Purata skor keutamaan",
};

const GROUP_LABELS: Record<QueryComplaintsInput["group_by"], string> = {
  district: "Daerah",
  category: "Kategori",
  status: "Status",
  severity: "Keutamaan",
  month: "Bulan",
  day: "Hari",
  officer: "Pegawai",
  none: "Semua aduan",
};

const CATEGORY_LABELS: Record<string, string> = {
  facility: "Fasiliti Sekolah",
  teacher: "Guru & Pengajaran",
  bullying: "Buli & Disiplin",
  transport: "Pengangkut Pelajar",
  canteen: "Kantin & Makanan",
  admission: "Kemasukan & Pendaftaran",
  funding: "Kewangan & Bantuan",
  welfare: "Kebajikan Pelajar",
  curriculum: "Kurikulum & Kokurikulum",
  other: "Lain-lain",
};

const STATUS_LABELS: Record<string, string> = {
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

const SEVERITY_LABELS: Record<string, string> = {
  low: "Rendah",
  medium: "Sederhana",
  high: "Tinggi",
  urgent: "Mendesak",
};

function parseDate(value: string | undefined, endOfDay = false): Date | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;
  if (endOfDay) date.setHours(23, 59, 59, 999);
  return date;
}

function labelFor(
  groupBy: QueryComplaintsInput["group_by"],
  key: string,
  rawLabel: string,
): string {
  if (!key) {
    if (groupBy === "officer") return "Belum ditugaskan";
    if (groupBy === "none") return "Semua aduan";
  }
  switch (groupBy) {
    case "category":
      return CATEGORY_LABELS[key] ?? key;
    case "status":
      return STATUS_LABELS[key] ?? key;
    case "severity":
      return SEVERITY_LABELS[key] ?? key;
    case "none":
      return "Semua aduan";
    default:
      return rawLabel || key;
  }
}

export async function queryComplaints(
  params: Record<string, unknown>,
  ctx: ToolContext,
): Promise<string> {
  if (ctx.actorKind !== "officer") {
    return "error: query_complaints is only available to ministry officers";
  }

  const parsed = queryComplaintsSchema.safeParse(params);
  if (!parsed.success) {
    return `error: invalid query: ${parsed.error.issues.map((i) => i.message).join("; ")}`;
  }
  const input = parsed.data;
  const from = parseDate(input.from);
  const to = parseDate(input.to, true);
  if (input.from && !from) return "error: 'from' must be an ISO date (YYYY-MM-DD)";
  if (input.to && !to) return "error: 'to' must be an ISO date (YYYY-MM-DD)";

  const conditions: SQL[] = [];
  if (input.status?.length) conditions.push(inArray(complaints.status, input.status));
  if (input.category?.length) conditions.push(inArray(complaints.category, input.category));
  if (input.severity?.length) conditions.push(inArray(complaints.severity, input.severity));
  if (input.district_code?.length) {
    conditions.push(inArray(complaints.districtCode, input.district_code));
  }
  if (from) conditions.push(gte(complaints.createdAt, from));
  if (to) conditions.push(lte(complaints.createdAt, to));
  if (input.search?.trim()) {
    const term = `%${input.search.trim()}%`;
    const search = or(
      like(complaints.referenceNumber, term),
      like(complaints.title, term),
      like(complaints.description, term),
    );
    if (search) conditions.push(search);
  }
  const where = conditions.length ? and(...conditions) : undefined;

  let groupExpr: SQL;
  let labelExpr: SQL<string>;
  switch (input.group_by) {
    case "district":
      groupExpr = sql`${complaints.districtCode}`;
      labelExpr = sql<string>`coalesce((select name from districts where districts.id = ${complaints.districtCode}), ${complaints.districtCode}, 'Tidak dinyatakan')`;
      break;
    case "category":
      groupExpr = sql`${complaints.category}`;
      labelExpr = sql<string>`${complaints.category}`;
      break;
    case "status":
      groupExpr = sql`${complaints.status}`;
      labelExpr = sql<string>`${complaints.status}`;
      break;
    case "severity":
      groupExpr = sql`${complaints.severity}`;
      labelExpr = sql<string>`${complaints.severity}`;
      break;
    case "month":
      groupExpr = sql`strftime('%Y-%m', ${complaints.createdAt} / 1000, 'unixepoch')`;
      labelExpr = sql<string>`strftime('%Y-%m', ${complaints.createdAt} / 1000, 'unixepoch')`;
      break;
    case "day":
      groupExpr = sql`strftime('%Y-%m-%d', ${complaints.createdAt} / 1000, 'unixepoch')`;
      labelExpr = sql<string>`strftime('%Y-%m-%d', ${complaints.createdAt} / 1000, 'unixepoch')`;
      break;
    case "officer":
      groupExpr = sql`${complaints.assignedTo}`;
      labelExpr = sql<string>`coalesce((select name from officers where officers.id = ${complaints.assignedTo}), 'Belum ditugaskan')`;
      break;
    default:
      groupExpr = sql`1`;
      labelExpr = sql<string>`'Semua aduan'`;
  }

  let valueExpr: SQL<number>;
  switch (input.metric) {
    case "avg_resolution_hours":
      valueExpr = sql<number>`round(coalesce(avg(case
        when ${complaints.resolvedAt} is not null then (${complaints.resolvedAt} - ${complaints.createdAt}) / 3600000.0
        when ${complaints.closedAt} is not null then (${complaints.closedAt} - ${complaints.createdAt}) / 3600000.0
        end), 0), 1)`;
      break;
    case "avg_priority":
      valueExpr = sql<number>`round(coalesce(avg(${complaints.priorityScore}), 0), 1)`;
      break;
    default:
      valueExpr = sql<number>`count(*)`;
  }

  const db = getDb();
  const rawRows = await db
    .select({
      key: sql<string>`${groupExpr}`,
      label: labelExpr,
      value: sql<number>`${valueExpr}`,
    })
    .from(complaints)
    .where(where)
    .groupBy(groupExpr)
    .orderBy(desc(valueExpr))
    .limit(input.limit);

  const rows: ComplaintInsightRow[] = rawRows.map((row) => {
    const key = row.key == null ? "" : String(row.key);
    return {
      key,
      label: labelFor(input.group_by, key, String(row.label ?? "")),
      value: Number(row.value ?? 0),
    };
  });

  const chartType: ComplaintInsightData["chart"]["type"] =
    input.group_by === "month" || input.group_by === "day"
      ? "line"
      : input.metric === "count" &&
          rows.length > 0 &&
          rows.length <= 6 &&
          ["category", "status", "severity"].includes(input.group_by)
        ? "donut"
        : "bar";

  const data: ComplaintInsightData = {
    metric: input.metric,
    groupBy: input.group_by,
    filters: {
      from: input.from,
      to: input.to,
      status: input.status,
      category: input.category,
      severity: input.severity,
      districtCode: input.district_code,
      search: input.search,
    },
    rows,
    chart: {
      type: chartType,
      title: `${METRIC_LABELS[input.metric]} mengikut ${GROUP_LABELS[input.group_by]}`,
      xKey: "label",
      yKey: "value",
    },
    total: rows.reduce((sum, row) => sum + row.value, 0),
    generatedAt: new Date().toISOString(),
  };

  ctx.capture?.("query_complaints", data);
  return JSON.stringify(data);
}

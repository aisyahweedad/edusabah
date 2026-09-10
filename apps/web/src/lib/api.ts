import { loadEnv } from "@k-aecs/config";
import { cookies } from "next/headers";
import { SESSION_COOKIE } from "./constants";

export { SESSION_COOKIE };

export interface SessionClaims {
  sub: string;
  kind: "officer";
  role: string;
  permissions: string[];
}

function apiBase(): string {
  return loadEnv().PUBLIC_API_URL.replace(/\/+$/, "");
}

export class ApiError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

/** Optional error marker merged into fetch results that fall back to zero-data. */
export type WithError<T> = T & { __error?: string };

/** Server-side fetch bearer helper; redirects-through-403 are the caller's job. */
async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const res = await fetch(`${apiBase()}${path}`, {
    cache: "no-store",
    ...init,
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(init.headers ?? {}),
    },
  });
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown> & T;
  if (!res.ok) {
    throw new ApiError(
      typeof body.message === "string" ? (body.message as string) : `HTTP ${res.status}`,
      res.status,
    );
  }
  return body;
}

export async function getSession(): Promise<SessionClaims | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  try {
    const payload = JSON.parse(
      Buffer.from(token.split(".")[1] ?? "", "base64url").toString("utf8"),
    ) as Partial<SessionClaims>;
    if (!payload?.sub || !payload.role) return null;
    return {
      sub: payload.sub,
      kind: payload.kind ?? "officer",
      role: payload.role,
      permissions: Array.isArray(payload.permissions) ? payload.permissions : [],
    };
  } catch {
    return null;
  }
}

export async function fetchMe(): Promise<unknown> {
  return apiFetch("/api/v1/auth/me");
}

export async function fetchAnalyticsDashboard(): Promise<{
  totals: { total: number; open: number; resolved: number };
  byStatus: Array<{ status: string; count: number }>;
  byCategory: Array<{ category: string; count: number }>;
  byDay: Array<{ day: string; count: number }>;
  ai: { runs: number; costUsdMicros: number };
}> {
  return apiFetch("/api/v1/analytics/dashboard");
}

export async function fetchComplaints(query: Record<string, string> = {}): Promise<{
  complaints: Array<{
    id: string;
    referenceNumber: string;
    category: string;
    title: string;
    status: string;
    districtCode: string | null;
    createdAt: string;
  }>;
  page: number;
  pageSize: number;
}> {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) if (v) qs.set(k, v);
  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  return apiFetch(`/api/v1/complaints${suffix}`);
}

export async function fetchComplaint(id: string): Promise<{
  complaint: Record<string, unknown>;
  notes: Array<{ id: string; content: string; isInternal: boolean; createdAt: string }>;
  history: Array<{ id: string; fromStatus: string | null; toStatus: string; createdAt: string }>;
}> {
  return apiFetch(`/api/v1/complaints/${encodeURIComponent(id)}`);
}

export async function fetchAiUsage(): Promise<{
  rows: Array<{ day: string; runs: number; tokensInput: number; tokensOutput: number; costUsdMicros: number }>;
}> {
  return apiFetch("/api/v1/analytics/ai-usage");
}

export async function fetchRuns(query: Record<string, string> = {}): Promise<{
  runs: Array<Record<string, unknown>>;
}> {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) if (v) qs.set(k, v);
  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  return apiFetch(`/api/v1/harness/runs${suffix}`);
}

export async function fetchOfficers(): Promise<{
  officers: Array<Record<string, unknown>>;
}> {
  return apiFetch("/api/v1/auth/officers");
}

/** Server action: update a complaint's status through the API. */
export async function updateComplaintStatus(id: string, status: string, note?: string): Promise<void> {
  await apiFetch(`/api/v1/complaints/${encodeURIComponent(id)}/status`, {
    method: "PATCH",
    body: JSON.stringify({ status, note: note || undefined }),
  });
}

/** Server action: append a note to a complaint. */
export async function addComplaintNote(id: string, content: string): Promise<void> {
  await apiFetch(`/api/v1/complaints/${encodeURIComponent(id)}/notes`, {
    method: "POST",
    body: JSON.stringify({ content }),
  });
}

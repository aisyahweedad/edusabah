import { loadEnv } from "@k-aecs/config";
import type { ComplaintCategory } from "@k-aecs/shared";

export interface HarnessChatResult {
  status: "ok" | "error";
  text: string;
  runId: string;
  toolCalls: Array<{ toolName: string; ok: boolean }>;
  error?: string;
}

export interface ComplaintStatusUpdate {
  toStatus: string;
  createdAt: string;
}

export interface CitizenComplaint {
  referenceNumber: string;
  category: ComplaintCategory;
  title: string;
  description: string;
  status: string;
  severity?: string;
  createdAt: string;
}

export class BotApiError extends Error {
  readonly code: string | undefined;
  constructor(message: string, code?: string) {
    super(message);
    this.name = "BotApiError";
    this.code = code;
  }
}

function baseUrl(): string {
  return loadEnv().PUBLIC_API_URL.replace(/\/+$/, "");
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${baseUrl()}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown> & T;
  if (!res.ok) {
    throw new BotApiError(
      typeof body.message === "string" ? (body.message as string) : `HTTP ${res.status}`,
      typeof body.error === "string" ? (body.error as string) : undefined,
    );
  }
  return body;
}

/** Free-form chat via the Pi harness (citizen actor). */
export function harnessChat(telegramUserId: string, channelId: string, message: string): Promise<HarnessChatResult> {
  return request<HarnessChatResult>("/api/v1/harness/run", {
    method: "POST",
    body: JSON.stringify({
      actor: { kind: "citizen", telegramUserId },
      channelId,
      message,
    }),
  });
}

/** Submit a complaint as the citizen identified by x-telegram-user-id. */
export function createComplaint(
  telegramUserId: string,
  input: {
    category: ComplaintCategory;
    title: string;
    description: string;
    districtCode?: string;
    location?: string;
  },
): Promise<{ complaint: CitizenComplaint }> {
  return request<{ complaint: CitizenComplaint }>("/api/v1/complaints", {
    method: "POST",
    headers: { "x-telegram-user-id": telegramUserId },
    body: JSON.stringify({
      category: input.category,
      title: input.title,
      description: input.description,
      districtCode: input.districtCode,
      location: input.location,
    }),
  });
}

/** Citizen-triggered escalation for an overdue complaint (UC-03). */
export async function escalateOwnComplaint(
  telegramUserId: string,
  referenceNumber: string,
): Promise<void> {
  await request(`/api/v1/complaints/by-ref/${encodeURIComponent(referenceNumber)}/escalate`, {
    method: "POST",
    headers: { "x-telegram-user-id": telegramUserId },
    body: JSON.stringify({ source: "citizen_overdue" }),
  });
}

/** Citizen-owned compliance lookup by reference number (UC-03). */
export interface ComplaintTracking {
  overdue: boolean;
  slaHours: number;
  offerEscalation: boolean;
  responsibleUnit?: string;
  responsibleOfficer?: string;
  resolutionSummary?: string;
}

export async function lookupComplaint(
  telegramUserId: string,
  referenceNumber: string,
): Promise<{
  complaint: CitizenComplaint & { resolutionSummary?: string | null };
  notes: Array<{ content: string; createdAt: string }>;
  tracking?: ComplaintTracking;
}> {
  return request(`/api/v1/complaints/by-ref/${encodeURIComponent(referenceNumber)}`, {
    headers: { "x-telegram-user-id": telegramUserId },
  });
}

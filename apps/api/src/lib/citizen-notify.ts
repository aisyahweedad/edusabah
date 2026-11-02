import { eq } from "drizzle-orm";
import { loadEnv } from "@k-aecs/config";
import { getDb } from "@k-aecs/database";
import { notifications } from "@k-aecs/database/schema";

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

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

function statusLabel(status: string): string {
  return STATUS_LABELS[status] ?? status.replace(/_/g, " ");
}

export interface CitizenComplaintUpdate {
  complaintId: string;
  telegramUserId: string;
  referenceNumber: string;
  title: string;
  status: string;
  note?: string | null;
  templateKey: string;
  headline?: string;
}

/** Best-effort Telegram push; never blocks or fails the officer's request. */
export function notifyCitizenOfComplaintUpdate(update: CitizenComplaintUpdate): void {
  void deliver(update).catch((error) => {
    console.error("[citizen-notify] delivery failed", error);
  });
}

async function deliver(update: CitizenComplaintUpdate): Promise<void> {
  const db = getDb();
  const [record] = await db
    .insert(notifications)
    .values({
      complaintId: update.complaintId,
      channel: "telegram",
      recipientType: "citizen",
      recipientId: update.telegramUserId,
      templateKey: update.templateKey,
      payload: {
        referenceNumber: update.referenceNumber,
        status: update.status,
      },
      status: "pending",
    })
    .returning({ id: notifications.id });

  const markFailed = async (message: string): Promise<void> => {
    if (!record) return;
    await db
      .update(notifications)
      .set({ status: "failed", error: message })
      .where(eq(notifications.id, record.id));
  };

  const env = loadEnv();
  if (!env.TELEGRAM_BOT_TOKEN) {
    await markFailed("TELEGRAM_BOT_TOKEN is not configured");
    return;
  }

  const lines = [
    update.headline ?? "🔔 <b>Kemaskini Aduan</b>",
    "",
    `No. rujukan: <b>${escapeHtml(update.referenceNumber)}</b>`,
    `Tajuk: ${escapeHtml(truncate(update.title, 200))}`,
    `Status: <b>${escapeHtml(statusLabel(update.status))}</b>`,
  ];
  const note = update.note?.trim();
  if (note) lines.push(`Nota: ${escapeHtml(truncate(note, 1000))}`);
  lines.push("", "Semak butiran melalui /menu → Semak Aduan.");
  const text = lines.join("\n");

  try {
    const res = await fetch(
      `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          chat_id: update.telegramUserId,
          text,
          parse_mode: "HTML",
        }),
        signal: AbortSignal.timeout(8000),
      },
    );
    const body = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      description?: string;
    };
    if (!res.ok || !body.ok) {
      throw new Error(body.description ?? `Telegram HTTP ${res.status}`);
    }
    if (record) {
      await db
        .update(notifications)
        .set({ status: "sent", sentAt: new Date() })
        .where(eq(notifications.id, record.id));
    }
  } catch (error) {
    await markFailed(error instanceof Error ? error.message : String(error));
    throw error;
  }
}

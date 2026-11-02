"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2Icon, Trash2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  clearActiveInsightConversation,
  readActiveInsightConversation,
} from "@/lib/insights-session";

export function DeleteChatButton({
  chatId,
  title,
  redirectTo,
}: {
  chatId: string;
  title: string;
  redirectTo?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function onDelete() {
    if (!window.confirm(`Padam sesi "${title}"? Tindakan ini tidak boleh dibatalkan.`)) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/insights/chats/${encodeURIComponent(chatId)}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { message?: string };
        throw new Error(body.message ?? "Gagal memadam sesi.");
      }
      if (readActiveInsightConversation() === chatId) {
        clearActiveInsightConversation();
      }
      if (redirectTo) {
        router.push(redirectTo);
      }
      router.refresh();
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "Gagal memadam sesi.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="text-rose-600 hover:border-rose-300 hover:bg-rose-50"
      onClick={() => void onDelete()}
      disabled={busy}
    >
      {busy ? <Loader2Icon className="size-3.5 animate-spin" /> : <Trash2Icon className="size-3.5" />}
      Padam
    </Button>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  HistoryIcon,
  Loader2Icon,
  PlusIcon,
  SendIcon,
  SparklesIcon,
} from "lucide-react";
import { Banner } from "@/components/banner";
import { EmptyState } from "@/components/empty-state";
import { InsightTurnCard, type InsightTurn } from "@/components/insights/insight-turn";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import type {
  InsightChatDetail,
  InsightData,
  InsightSuggestion,
} from "@/lib/api";
import {
  clearActiveInsightConversation,
  readActiveInsightConversation,
  saveActiveInsightConversation,
} from "@/lib/insights-session";

interface AskResponse {
  status: string;
  answer: string;
  data: InsightData | null;
  suggestions: InsightSuggestion[];
  conversationId?: string;
  runId: string;
  error?: string;
}

const EXAMPLES = [
  "Daerah mana paling banyak aduan fasiliti sekolah suku tahun ini?",
  "Tunjukkan trend aduan bulanan tahun ini.",
  "Kategori apa yang paling banyak di Kota Kinabalu?",
  "Berapa purata masa penyelesaian aduan mengikut keutamaan?",
];

export function InsightsClient({ initialChat }: { initialChat?: InsightChatDetail | null }) {
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [turns, setTurns] = useState<InsightTurn[]>([]);
  const [continued, setContinued] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const hydratedRef = useRef(false);
  const endRef = useRef<HTMLDivElement | null>(null);

  function applyChat(chat: InsightChatDetail, fromHistory: boolean) {
    const message = chat.messages[chat.messages.length - 1];
    const nextTurns: InsightTurn[] = message
      ? [
          {
            id: message.id,
            question: message.question,
            answer: message.answer ?? "",
            data: message.payload?.data ?? null,
            suggestions: message.payload?.suggestions ?? [],
            createdAt: message.createdAt,
          },
        ]
      : [];
    setTurns(nextTurns);
    setConversationId(chat.chat.id);
    setQuestion("");
    setContinued(fromHistory && nextTurns.length > 0);
    saveActiveInsightConversation(chat.chat.id);
  }

  // Restore a continued session from the URL or the last active conversation.
  useEffect(() => {
    if (hydratedRef.current) return;
    hydratedRef.current = true;

    if (initialChat) {
      applyChat(initialChat, true);
      return;
    }

    const storedId = readActiveInsightConversation();
    if (!storedId) return;

    setRestoring(true);
    fetch(`/api/insights/chats/${encodeURIComponent(storedId)}`)
      .then((res) => {
        if (!res.ok) throw new Error("Sesi tidak dapat dimuatkan.");
        return res.json() as Promise<InsightChatDetail>;
      })
      .then((chat) => applyChat(chat, false))
      .catch(() => {
        clearActiveInsightConversation();
      })
      .finally(() => setRestoring(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialChat]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [turns, loading]);

  async function ask(event: React.FormEvent) {
    event.preventDefault();
    const text = question.trim();
    if (text.length < 3) return;
    setLoading(true);
    setError(null);
    setActionError(null);
    setActionMessage(null);
    try {
      const res = await fetch("/api/insights/ask", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question: text, conversationId: conversationId ?? undefined }),
      });
      const body = (await res.json().catch(() => ({}))) as AskResponse & { message?: string };
      if (!res.ok) throw new Error(body.message ?? "AI tidak dapat memproses soalan ini.");
      const nextId = body.conversationId ?? conversationId ?? null;
      if (nextId) {
        setConversationId(nextId);
        saveActiveInsightConversation(nextId);
      }
      setTurns([
        {
          id: body.runId || crypto.randomUUID(),
          question: text,
          answer: body.answer ?? "",
          data: body.data,
          suggestions: body.suggestions ?? [],
          createdAt: new Date().toISOString(),
        },
      ]);
      setQuestion("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ralat tidak dijangka.");
    } finally {
      setLoading(false);
    }
  }

  function newChat() {
    setTurns([]);
    setConversationId(null);
    setQuestion("");
    setContinued(false);
    setError(null);
    setActionError(null);
    setActionMessage(null);
    clearActiveInsightConversation();
    window.history.replaceState(null, "", "/insights");
  }

  async function exportData(format: "csv" | "xlsx" | "pdf", data: InsightData) {
    setActionError(null);
    try {
      const res = await fetch("/api/insights/export", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          format,
          title: data.chart.title,
          columns: [
            { key: "label", label: "Kumpulan" },
            { key: "value", label: "Nilai" },
          ],
          rows: data.rows.map((row) => ({ label: row.label, value: row.value })),
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { message?: string };
        throw new Error(body.message ?? "Eksport gagal.");
      }
      const blob = await res.blob();
      const disposition = res.headers.get("content-disposition") ?? "";
      const match = /filename="?([^";]+)"?/.exec(disposition);
      const filename = match?.[1] ?? `edusabah-insights.${format}`;
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Eksport gagal.");
    }
  }

  async function runAction(suggestion: InsightSuggestion) {
    if (suggestion.action.type !== "escalate") return;
    const target = suggestion.action.label ?? "tapisan ini";
    if (!window.confirm(`Eskalasi aduan tertunggak untuk ${target}?`)) return;
    setBusyAction(suggestion.id);
    setActionError(null);
    setActionMessage(null);
    try {
      const res = await fetch("/api/insights/actions/escalate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          filters: suggestion.action.filters,
          groupBy: suggestion.action.groupBy,
          key: suggestion.action.key,
          label: suggestion.action.label,
        }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        escalated?: number;
        message?: string;
      };
      if (!res.ok) throw new Error(body.message ?? "Tindakan gagal.");
      setActionMessage(
        body.escalated && body.escalated > 0
          ? `${body.escalated} aduan tertunggak telah dinaikkan tahap ke Setiausaha Politik.`
          : "Tiada aduan tertunggak yang sepadan untuk dieskalasi.",
      );
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Tindakan gagal.");
    } finally {
      setBusyAction(null);
    }
  }

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <SparklesIcon className="size-4 text-[color:var(--primary)]" />
              Tanya pangkalan data aduan
            </CardTitle>
            <CardDescription>
              AI menterjemah soalan kepada query pangkalan data, melaksanakan query dan menerangkan
              hasilnya dengan carta.
            </CardDescription>
          </div>
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
            <Button asChild variant="outline" size="sm">
              <Link href="/insights/history">
                <HistoryIcon className="size-3.5" /> Sejarah
              </Link>
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={newChat} disabled={loading}>
              <PlusIcon className="size-3.5" /> Chat baharu
            </Button>
          </div>
        </CardHeader>
      </Card>

      {continued && (
        <Banner tone="info">
          Menyambung sesi terdahulu. Tanya soalan susulan di bawah untuk meneruskan perbualan.
        </Banner>
      )}
      {error && <Banner tone="error">{error}</Banner>}
      {actionError && <Banner tone="error">{actionError}</Banner>}
      {actionMessage && <Banner tone="success">{actionMessage}</Banner>}

      {restoring && (
        <Card>
          <CardContent className="flex items-center gap-3 py-10 text-sm text-muted-foreground">
            <Loader2Icon className="size-5 animate-spin text-[color:var(--primary)]" />
            Memuatkan sesi terdahulu…
          </CardContent>
        </Card>
      )}

      {!restoring && turns.length === 0 && (
        <Card>
          <CardContent className="py-8">
            <EmptyState
              icon={SparklesIcon}
              title="Mulakan sesi Tanya Data"
              description="Tanya soalan analitik pertama anda. Contoh soalan tersedia di ruang tanya di bawah."
            />
          </CardContent>
        </Card>
      )}

      <div className="space-y-4 pb-2">
        {turns.map((turn, index) => (
          <InsightTurnCard
            key={turn.id}
            turn={turn}
            index={index}
            onExport={exportData}
            onAction={index === turns.length - 1 ? runAction : undefined}
            busyAction={busyAction}
          />
        ))}

        {loading && (
          <Card>
            <CardContent className="flex items-center gap-3 py-6 text-sm text-muted-foreground">
              <Loader2Icon className="size-5 animate-spin text-[color:var(--primary)]" />
              AI sedang menganalisis soalan anda…
            </CardContent>
          </Card>
        )}
        <div ref={endRef} />
      </div>

      <div className="sticky bottom-4 z-20">
        <Card className="border-[color:var(--border)] bg-white/95 shadow-lg backdrop-blur">
          <CardContent className="pt-5">
            <form onSubmit={ask} className="space-y-3">
              <Textarea
                value={question}
                onChange={(event) => setQuestion(event.target.value)}
                placeholder={
                  turns.length > 0
                    ? "Tanya soalan susulan…"
                    : "Contoh: Daerah mana paling banyak aduan fasiliti sekolah suku tahun ini?"
                }
                className="min-h-20"
                maxLength={500}
              />
              {turns.length === 0 && (
                <div className="flex flex-wrap gap-2">
                  {EXAMPLES.map((example) => (
                    <button
                      key={example}
                      type="button"
                      onClick={() => setQuestion(example)}
                      className="rounded-full border border-[color:var(--border)] bg-white px-3 py-1 text-xs text-muted-foreground transition-colors hover:border-[color:var(--primary)]/40 hover:text-[color:var(--fg)]"
                    >
                      {example}
                    </button>
                  ))}
                </div>
              )}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-xs text-muted-foreground">
                  {conversationId
                    ? "Sesi ini disimpan secara automatik dalam Sejarah."
                    : "Sesi baharu — soalan pertama akan memulakan chat."}
                </p>
                <Button type="submit" disabled={loading || question.trim().length < 3} className="h-9">
                  {loading ? (
                    <>
                      <Loader2Icon className="size-4 animate-spin" /> Menganalisis…
                    </>
                  ) : (
                    <>
                      <SendIcon className="size-4" /> Tanya AI
                    </>
                  )}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

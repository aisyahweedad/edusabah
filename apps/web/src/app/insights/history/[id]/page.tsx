import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeftIcon, MessageSquareIcon, SparklesIcon } from "lucide-react";
import { AppShell } from "@/components/app/app-shell";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { InsightTurnCard } from "@/components/insights/insight-turn";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { fetchInsightChat, getSession, type InsightChatDetail } from "@/lib/api";
import { DeleteChatButton } from "../delete-chat-button";

export const dynamic = "force-dynamic";

export default async function InsightChatDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!session.permissions.includes("analytics:view")) redirect("/dashboard");

  const { id } = await params;
  const chatId = decodeURIComponent(id);
  let data: InsightChatDetail | null = null;
  let error: string | null = null;
  try {
    data = await fetchInsightChat(chatId);
  } catch (err) {
    error = err instanceof Error ? err.message : "Chat tidak dapat dimuatkan.";
  }

  return (
    <AppShell session={session}>
      <PageHeader
        eyebrow="AI & Data"
        title={data?.chat.title || "Butiran Chat AI"}
        description={data ? `${data.messages.length} soalan dalam sesi ini` : "Sejarah Tanya Data"}
        actions={
          <div className="flex items-center gap-2">
            <Button asChild variant="outline" size="sm">
              <Link href="/insights/history">
                <ArrowLeftIcon className="size-3.5" /> Kembali
              </Link>
            </Button>
            {data && (
              <>
                <Button asChild size="sm">
                  <Link href={`/insights?chat=${encodeURIComponent(data.chat.id)}`}>
                    <MessageSquareIcon className="size-3.5" /> Sambung chat
                  </Link>
                </Button>
                <DeleteChatButton
                  chatId={data.chat.id}
                  title={data.chat.title || "Sesi tanpa tajuk"}
                  redirectTo="/insights/history"
                />
              </>
            )}
          </div>
        }
      />

      {error && (
        <Card>
          <CardContent className="py-8">
            <EmptyState icon={MessageSquareIcon} title="Chat tidak ditemui" description={error} />
          </CardContent>
        </Card>
      )}

      {data && (
        <div className="space-y-4">
          {data.messages.map((message, index) => (
            <InsightTurnCard
              key={message.id}
              index={index}
              readOnly
              turn={{
                id: message.id,
                question: message.question,
                answer: message.answer ?? "",
                data: message.payload?.data ?? null,
                suggestions: message.payload?.suggestions ?? [],
                createdAt: message.createdAt,
              }}
            />
          ))}
          {data.messages.length === 0 && (
            <Card>
              <CardContent className="py-8">
                <EmptyState
                  icon={SparklesIcon}
                  title="Tiada mesej"
                  description="Sesi ini belum mempunyai soalan."
                />
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </AppShell>
  );
}

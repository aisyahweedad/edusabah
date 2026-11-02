import { redirect } from "next/navigation";
import { AppShell } from "@/components/app/app-shell";
import { PageHeader } from "@/components/page-header";
import { fetchInsightChat, getSession, type InsightChatDetail } from "@/lib/api";
import { InsightsClient } from "./insights-client";

export const dynamic = "force-dynamic";

export default async function InsightsPage({
  searchParams,
}: {
  searchParams: Promise<{ chat?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!session.permissions.includes("analytics:view")) redirect("/dashboard");

  const { chat } = await searchParams;
  let initialChat: InsightChatDetail | null = null;
  if (chat) {
    try {
      initialChat = await fetchInsightChat(chat);
    } catch {
      initialChat = null;
    }
  }

  return (
    <AppShell session={session}>
      <PageHeader
        eyebrow="AI & Data"
        title="Tanya Data"
        description="Tanya soalan analitik dalam bahasa biasa. AI menterjemah kepada query pangkalan data, memaparkan carta, dan mencadangkan tindakan."
      />
      <InsightsClient initialChat={initialChat} />
    </AppShell>
  );
}

import { redirect } from "next/navigation";
import Link from "next/link";
import { HistoryIcon, MessageSquareIcon, PlusIcon } from "lucide-react";
import { AppShell } from "@/components/app/app-shell";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { fetchInsightChats, getSession, type WithError } from "@/lib/api";
import { DeleteChatButton } from "./delete-chat-button";

export const dynamic = "force-dynamic";

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString("ms-MY", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Kuching",
  });
}

export default async function InsightsHistoryPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!session.permissions.includes("analytics:view")) redirect("/dashboard");

  const data: WithError<Awaited<ReturnType<typeof fetchInsightChats>>> =
    await fetchInsightChats().catch((error) => ({
      chats: [],
      __error: String((error as Error).message),
    }));

  return (
    <AppShell session={session}>
      <PageHeader
        eyebrow="AI & Data"
        title="Sejarah Tanya Data"
        description="Semua sesi soal-jawab AI yang disimpan untuk akaun anda."
        actions={
          <Button asChild size="sm">
            <Link href="/insights">
              <PlusIcon className="size-3.5" /> Chat baharu
            </Link>
          </Button>
        }
      />

      {data.__error && (
        <p className="mb-4 text-sm font-medium text-rose-600">API tidak dapat dijangkau: {data.__error}</p>
      )}

      <Card>
        <CardHeader className="border-b">
          <CardTitle className="flex items-center gap-2 text-base">
            <HistoryIcon className="size-4 text-[color:var(--primary)]" />
            Sesi terdahulu
          </CardTitle>
          <CardDescription>
            {data.chats.length} sesi disimpan · klik untuk melihat soalan, carta dan penjelasan.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {data.chats.length === 0 && !data.__error ? (
            <EmptyState
              icon={MessageSquareIcon}
              title="Belum ada sejarah"
              description="Mulakan sesi Tanya Data pertama anda; ia akan muncul di sini secara automatik."
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="bg-[color:var(--bg)]">
                  <TableHead className="pl-4 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                    Sesi
                  </TableHead>
                  <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                    Soalan
                  </TableHead>
                  <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                    Aktiviti terakhir
                  </TableHead>
                  <TableHead className="pr-4 text-right text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                    Tindakan
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.chats.map((chat) => (
                  <TableRow key={chat.id} className="group hover:bg-[color:var(--muted)]/60">
                    <TableCell className="pl-4">
                      <Link
                        href={`/insights/history/${encodeURIComponent(chat.id)}`}
                        className="block max-w-xl"
                      >
                        <span className="block truncate text-sm font-medium text-[color:var(--primary)] group-hover:underline">
                          {chat.title || "Sesi tanpa tajuk"}
                        </span>
                        <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                          {chat.lastQuestion}
                        </span>
                      </Link>
                    </TableCell>
                    <TableCell className="tabular-nums text-muted-foreground">{chat.questions}</TableCell>
                    <TableCell className="text-right text-xs text-muted-foreground">
                      {formatDateTime(chat.lastActivityAt)}
                    </TableCell>
                    <TableCell className="pr-4 text-right">
                      <div className="flex justify-end gap-2">
                        <Button asChild variant="outline" size="sm">
                          <Link href={`/insights?chat=${encodeURIComponent(chat.id)}`}>Sambung</Link>
                        </Button>
                        <DeleteChatButton chatId={chat.id} title={chat.title || "Sesi tanpa tajuk"} />
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </AppShell>
  );
}

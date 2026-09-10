import { redirect } from "next/navigation";
import { BrainCircuitIcon, CoinsIcon, CpuIcon, DatabaseIcon, ActivityIcon } from "lucide-react";
import { AppShell } from "@/components/app/app-shell";
import { PageHeader } from "@/components/page-header";
import { Banner } from "@/components/banner";
import { StatCard } from "@/components/stat-card";
import { EmptyState } from "@/components/empty-state";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { fetchAiUsage, getSession, type WithError } from "@/lib/api";

export const dynamic = "force-dynamic";

export default async function RunsPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const usage: WithError<Awaited<ReturnType<typeof fetchAiUsage>>> =
    await fetchAiUsage().catch((e) => ({
      rows: [],
      __error: String((e as Error).message),
    }));

  const totalRuns = usage.rows.reduce((acc, r) => acc + r.runs, 0);
  const totalTokens = usage.rows.reduce((acc, r) => acc + r.tokensInput + r.tokensOutput, 0);
  const totalCost = usage.rows.reduce((acc, r) => acc + r.costUsdMicros, 0) / 1_000_000;
  const maxTokens = Math.max(1, ...usage.rows.map((r) => r.tokensInput + r.tokensOutput));
  const avgCostPerRun = totalRuns > 0 ? (totalCost / totalRuns).toFixed(4) : "0.0000";

  return (
    <AppShell session={session}>
      {usage.__error && <Banner tone="error">{usage.__error}</Banner>}

      <PageHeader
        eyebrow="AI & Data"
        title="AI & Carian Web"
        description="Penggunaan Pi AgentHarness: penjanaan jawapan dan carian web (web_search / fetch_url)."
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Jumlah Run" value={totalRuns.toLocaleString()} hint="Permintaan AI diproses" icon={BrainCircuitIcon} tone="blue" />
        <StatCard label="Token" value={totalTokens.toLocaleString()} hint="Input + output digabung" icon={CpuIcon} tone="violet" />
        <StatCard label="Kos Keseluruhan" value={`$${totalCost.toFixed(2)}`} hint="Sepanjang 30 hari" icon={CoinsIcon} tone="amber" />
        <StatCard label="Kos Purata / Run" value={`$${avgCostPerRun}`} hint="Kecekapan per permintaan" icon={ActivityIcon} tone="green" />
      </div>

      <Card>
        <CardHeader className="border-b">
          <CardTitle className="flex items-center gap-2 text-base">
            <DatabaseIcon className="size-4 text-[color:var(--primary)]" />
            Penggunaan harian (30 hari)
          </CardTitle>
          <CardDescription>Rekod run, token dan kos mengikut tarikh</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {usage.rows.length === 0 && !usage.__error ? (
            <EmptyState
              icon={BrainCircuitIcon}
              title="Belum ada penggunaan AI"
              description="Apabila warganegara berinteraksi dengan bot Telegram, kos penggunaan akan direkodkan di sini."
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="bg-[color:var(--bg)]">
                  <TableHead className="pl-4 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                    Tarikh
                  </TableHead>
                  <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                    Run
                  </TableHead>
                  <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                    Token
                  </TableHead>
                  <TableHead className="pr-4 text-right text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                    Kos (USD)
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {[...usage.rows].reverse().slice(0, 14).map((r) => {
                  const tokens = r.tokensInput + r.tokensOutput;
                  return (
                    <TableRow key={r.day} className="hover:bg-[color:var(--muted)]/60">
                      <TableCell className="pl-4 font-medium text-[color:var(--fg)]">{r.day}</TableCell>
                      <TableCell className="font-semibold tabular-nums text-[color:var(--fg)]">{r.runs}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <div className="h-1.5 w-32 max-w-36 overflow-hidden rounded-full bg-[color:var(--muted)]">
                            <div
                              className="h-full rounded-full"
                              style={{
                                width: `${Math.max((tokens / maxTokens) * 100, tokens > 0 ? 4 : 0)}%`,
                                background: "linear-gradient(90deg, var(--chart-1), var(--chart-2))",
                              }}
                            />
                          </div>
                          <span className="text-xs tabular-nums text-muted-foreground">
                            {tokens.toLocaleString()}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="pr-4 text-right tabular-nums text-[color:var(--fg)]">
                        {(r.costUsdMicros / 1_000_000).toFixed(4)}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </AppShell>
  );
}

import { redirect } from "next/navigation";
import {
  InboxIcon,
  AlertCircleIcon,
  BadgeCheckIcon,
  BrainCircuitIcon,
  BanknoteIcon,
  ArrowRightIcon,
} from "lucide-react";
import Link from "next/link";
import { AppShell } from "@/components/app/app-shell";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { EmptyState } from "@/components/empty-state";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { fetchAnalyticsDashboard, getSession, type WithError } from "@/lib/api";
import { STATUS_ORDER, statusColor, statusLabel } from "@/lib/status";
import { DonutChart } from "@/components/charts/donut-chart";
import { HBarChart } from "@/components/charts/hbar-chart";
import { TrendChart, type TrendPoint } from "@/components/charts/trend-chart";

export const dynamic = "force-dynamic";

const CHART_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
  "var(--chart-6)",
];

export default async function DashboardPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const data: WithError<Awaited<ReturnType<typeof fetchAnalyticsDashboard>>> =
    await fetchAnalyticsDashboard().catch((e) => ({
      totals: { total: 0, open: 0, resolved: 0 },
      byStatus: [],
      byCategory: [],
      byDay: [],
      ai: { runs: 0, costUsdMicros: 0 },
      __error: String((e as Error).message),
    }));

  const { total, open, resolved } = data.totals;
  const openPct = total > 0 ? Math.round((open / total) * 100) : 0;
  const resolvedPct = total > 0 ? Math.round((resolved / total) * 100) : 0;
  const aiCost = (data.ai.costUsdMicros / 1_000_000).toFixed(2);

  const byStatusMap = new Map(data.byStatus.map((r) => [r.status, r.count] as const));
  const statusSlices = STATUS_ORDER.filter((s) => (byStatusMap.get(s) ?? 0) > 0).map((s) => ({
    label: statusLabel(s),
    value: byStatusMap.get(s) ?? 0,
    color: statusColor(s),
  }));

  const categoryItems = [...data.byCategory]
    .sort((a, b) => b.count - a.count)
    .slice(0, 8)
    .map((row, i) => ({
      label: row.category,
      value: row.count,
      color: CHART_COLORS[i % CHART_COLORS.length],
    }));

  const trend: TrendPoint[] = [...data.byDay]
    .sort((a, b) => a.day.localeCompare(b.day))
    .slice(-14)
    .map((d) => ({ label: d.day, value: d.count }));

  const today = new Date().toLocaleDateString("ms-MY", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Asia/Kuching",
  });

  return (
    <AppShell session={session}>
      {data.__error && (
        <p className="mb-4 text-sm font-medium text-rose-600">
          API tidak dapat dijangkau: {data.__error}
        </p>
      )}

      <PageHeader
        eyebrow="Panel Pentadbir"
        title={data.__error ? "Carta Ringkasan" : `Ringkasan · ${today}`}
        description="Gambaran keseluruhan aduan warganegara dan penggunaan AI."
        actions={
          <Link
            href="/complaints"
            className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-[color:var(--primary)] px-3 text-sm font-medium text-white transition-colors hover:bg-[color:var(--primary-hover)]"
          >
            Buka Aduan
            <ArrowRightIcon className="size-4" />
          </Link>
        }
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Jumlah Aduan"
          value={total.toLocaleString()}
          hint="Keseluruhan aduan diterima"
          icon={InboxIcon}
          tone="blue"
        />
        <StatCard
          label="Terbuka"
          value={open.toLocaleString()}
          hint={`${openPct}% daripada semua aduan`}
          icon={AlertCircleIcon}
          tone="amber"
        />
        <StatCard
          label="Diselesaikan"
          value={resolved.toLocaleString()}
          delta={`${resolvedPct}% kadar`}
          deltaDirection="neutral"
          icon={BadgeCheckIcon}
          tone="green"
        />
        <StatCard
          label="Run AI"
          value={data.ai.runs.toLocaleString()}
          hint={`Kos ${aiCost} USD terakru`}
          icon={BrainCircuitIcon}
          tone="violet"
        />
      </div>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-base">Aliran aduan mengikut hari</CardTitle>
          <CardDescription>14 hari terakhir</CardDescription>
        </CardHeader>
        <CardContent>
          <TrendChart data={trend} />
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Agihan mengikut status</CardTitle>
            <CardDescription>
              {total > 0 ? `${total} aduan · mengikut peratusan` : "Belum ada aduan direkodkan"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {statusSlices.length === 0 ? (
              <EmptyState
                icon={InboxIcon}
                title="Tiada data status"
                description="Apabila aduan diterima, agihan status akan dipaparkan di sini."
              />
            ) : (
              <DonutChart slices={statusSlices} centerValue={total} centerLabel="Aduan" />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Aduan mengikut kategori</CardTitle>
            <CardDescription>Lapan kategori teratas</CardDescription>
          </CardHeader>
          <CardContent>
            {categoryItems.length === 0 ? (
              <EmptyState
                icon={InboxIcon}
                title="Tiada data kategori"
                description="Kategori aduan akan dipaparkan selepas aduan direkodkan."
              />
            ) : (
              <HBarChart items={categoryItems} />
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <BanknoteIcon className="size-4 text-[color:var(--primary)]" />
            Pendedahan operasi AI
          </CardTitle>
          <CardDescription>
            Kos berhubung dengan permintaan AI warganegara melalui bot Telegram
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-center gap-x-10 gap-y-4">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Jumlah run</p>
              <p className="mt-0.5 text-2xl font-semibold text-[color:var(--fg)]">{data.ai.runs.toLocaleString()}</p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Kos keseluruhan</p>
              <p className="mt-0.5 text-2xl font-semibold text-[color:var(--fg)]">
                {aiCost} <span className="text-sm font-normal text-muted-foreground">USD</span>
              </p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Kos purata / run</p>
              <p className="mt-0.5 text-2xl font-semibold text-[color:var(--fg)]">
                {data.ai.runs > 0 ? ((data.ai.costUsdMicros / 1e6) / data.ai.runs).toFixed(4) : "0.0000"}
                <span className="text-sm font-normal text-muted-foreground"> USD</span>
              </p>
            </div>
            <Link
              href="/runs"
              className="ml-auto inline-flex items-center gap-1 text-sm font-medium text-[color:var(--primary)] hover:underline"
            >
              Lihat butiran penggunaan
              <ArrowRightIcon className="size-4" />
            </Link>
          </div>
        </CardContent>
      </Card>
    </AppShell>
  );
}

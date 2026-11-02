import { redirect } from "next/navigation";
import Link from "next/link";
import { SearchIcon, InboxIcon, ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { AppShell } from "@/components/app/app-shell";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { StatusBadge } from "@/components/status-badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { fetchAnalyticsDashboard, fetchComplaints, getSession, type WithError } from "@/lib/api";
import { COMPLAINT_STATUSES } from "@k-aecs/shared";
import { statusLabel } from "@/lib/status";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function ComplaintsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string; page?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");

  const sp = await searchParams;
  const status = sp.status ?? "";
  const rawQuery = sp.q ?? "";
  // A dropped link can land in the search box; treat it as empty instead of
  // filtering out every complaint.
  const q = /^https?:\/\//i.test(rawQuery.trim()) ? "" : rawQuery;
  const pageNum = Math.max(1, Number(sp.page ?? "1") || 1);

  const query: Record<string, string> = {};
  if (status) query.status = status;
  if (q) query.q = q;
  if (pageNum > 1) query.page = String(pageNum);

  const [data, counts] = await Promise.all([
    fetchComplaints(query).then(
      (d): WithError<Awaited<ReturnType<typeof fetchComplaints>>> => ({ ...d }),
      (e): WithError<Awaited<ReturnType<typeof fetchComplaints>>> => ({
        complaints: [],
        page: 1,
        pageSize: 25,
        __error: String((e as Error).message),
      }),
    ),
    fetchAnalyticsDashboard().catch((e) => ({
      totals: { total: 0, open: 0, resolved: 0 },
      byStatus: [],
      byCategory: [],
      byDay: [],
      ai: { runs: 0, costUsdMicros: 0 },
      __error: String((e as Error).message),
    })),
  ]);

  const statusCount = (s: string) => counts.byStatus.find((r) => r.status === s)?.count ?? 0;
  const totalCount = counts.totals.total;
  const hasNext = data.complaints.length === data.pageSize;
  const hasPrev = pageNum > 1;
  const visible = data.complaints;
  const labelOf = (s: string) => statusLabel(s);

  const chip = (href: string, label: string, count: number, active: boolean) => (
    <Link
      key={href}
      href={href}
      draggable={false}
      aria-current={active ? "page" : undefined}
      className={cn(
        "inline-flex h-7 shrink-0 select-none items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors [-webkit-user-drag:none]",
        active
          ? "border-transparent bg-[color:var(--primary)] text-white"
          : "border-[color:var(--border)] bg-white text-muted-foreground hover:border-[color:var(--primary)]/40 hover:text-[color:var(--fg)]",
      )}
    >
      {label}
      {!active && <span className="text-[10.5px] font-semibold text-muted-foreground/70">{count}</span>}
    </Link>
  );

  const filterBase = (value: string) => {
    const p = new URLSearchParams();
    if (value) p.set("status", value);
    if (q) p.set("q", q);
    return `/complaints${p.toString() ? `?${p.toString()}` : ""}`;
  };

  const pageHref = (n: number) => {
    const p = new URLSearchParams();
    if (status) p.set("status", status);
    if (q) p.set("q", q);
    p.set("page", String(n));
    return `/complaints?${p.toString()}`;
  };

  return (
    <AppShell session={session}>
      {data.__error && (
        <p className="mb-4 text-sm font-medium text-rose-600">
          API tidak dapat dijangkau: {data.__error}
        </p>
      )}

      <PageHeader
        eyebrow="Pengurusan"
        title="Aduan Warganegara"
        description={`${totalCount} aduan direkodkan dalam sistem secara keseluruhan.`}
      />

      {/* Status chips */}
      <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
        {chip(filterBase(""), "Semua", totalCount, !status)}
        {COMPLAINT_STATUSES.map((s) => chip(filterBase(s), labelOf(s), statusCount(s), status === s))}
      </div>

      <Card className="mb-6">
        <CardContent className="pt-2.5">
          <form method="GET" className="flex flex-wrap items-center gap-2">
            <input type="hidden" name="status" value={status} />
            <div className="relative min-w-56 flex-1">
              <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                name="q"
                defaultValue={q}
                placeholder="Cari no. rujukan atau tajuk aduan…"
                className="h-9 pl-8.5"
              />
            </div>
            <Button type="submit" variant="outline" className="h-9">
              Cari
            </Button>
            {q && (
              <Button asChild variant="ghost" className="h-9 text-muted-foreground">
                <Link href={status ? `/complaints?status=${encodeURIComponent(status)}` : "/complaints"}>
                  Reset
                </Link>
              </Button>
            )}
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="bg-[color:var(--bg)]">
                <TableHead className="pl-4 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                  No. Rujukan
                </TableHead>
                <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                  Kategori
                </TableHead>
                <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                  Tajuk
                </TableHead>
                <TableHead className="hidden text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground md:table-cell">
                  Daerah
                </TableHead>
                <TableHead className="hidden text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground lg:table-cell">
                  Keutamaan
                </TableHead>
                <TableHead className="hidden text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground lg:table-cell">
                  Tarikh
                </TableHead>
                <TableHead className="pr-4 text-right text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                  Status
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.map((c) => (
                <TableRow key={c.id} className="group hover:bg-[color:var(--muted)]/60">
                  <TableCell className="pl-4">
                    <Link
                      href={`/complaints/${c.id}`}
                      className="font-mono text-[13px] font-semibold text-[color:var(--primary)] hover:underline"
                    >
                      {c.referenceNumber}
                    </Link>
                  </TableCell>
                  <TableCell className="max-w-40 truncate text-muted-foreground">{c.category}</TableCell>
                  <TableCell className="max-w-64 truncate font-medium text-[color:var(--fg)]">
                    {c.title}
                  </TableCell>
                  <TableCell className="hidden text-muted-foreground md:table-cell">
                    {c.districtCode ?? "—"}
                  </TableCell>
                  <TableCell className="hidden lg:table-cell">
                    {c.severity ? (
                      <span
                        className={`rounded-md px-1.5 py-0.5 text-[10.5px] font-semibold uppercase ring-1 ${
                          c.severity === "urgent"
                            ? "bg-red-50 text-red-700 ring-red-200"
                            : c.severity === "high"
                              ? "bg-orange-50 text-orange-700 ring-orange-200"
                              : c.severity === "low"
                                ? "bg-slate-100 text-slate-600 ring-slate-200"
                                : "bg-blue-50 text-blue-700 ring-blue-200"
                        }`}
                      >
                        {c.severity}
                      </span>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell className="hidden text-muted-foreground lg:table-cell">
                    {new Date(c.createdAt).toLocaleDateString("ms-MY", {
                      day: "2-digit",
                      month: "short",
                      year: "numeric",
                      timeZone: "Asia/Kuching",
                    })}
                  </TableCell>
                  <TableCell className="pr-4 text-right">
                    <span className="inline-flex justify-end">
                      <StatusBadge status={c.status} />
                    </span>
                  </TableCell>
                </TableRow>
              ))}
              {visible.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="p-0">
                    <EmptyState
                      icon={InboxIcon}
                      title={q || status ? "Tiada hasil padan" : "Belum ada aduan"}
                      description={
                        q || status
                          ? "Cuba ubah carian atau status yang dipilih."
                          : "Apabila warganegara menghantar aduan melalui Telegram, ia akan muncul di sini."
                      }
                    />
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {visible.length > 0 && (
        <div className="mt-4 flex items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">
            Halaman {pageNum} · {visible.length} aduan dipaparkan
          </p>
          <div className="flex items-center gap-2">
            <Button
              asChild
              variant="outline"
              size="sm"
              className={cn(!hasPrev && "pointer-events-none opacity-40")}
              aria-disabled={!hasPrev}
            >
              <Link href={hasPrev ? pageHref(pageNum - 1) : "#"}>
                <ChevronLeftIcon className="size-4" aria-hidden />
                Sebelum
              </Link>
            </Button>
            <Button
              asChild
              variant="outline"
              size="sm"
              className={cn(!hasNext && "pointer-events-none opacity-40")}
              aria-disabled={!hasNext}
            >
              <Link href={hasNext ? pageHref(pageNum + 1) : "#"}>
                Seterusnya
                <ChevronRightIcon className="size-4" aria-hidden />
              </Link>
            </Button>
          </div>
        </div>
      )}
    </AppShell>
  );
}

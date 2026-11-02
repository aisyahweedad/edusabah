import { redirect } from "next/navigation";
import { ScrollTextIcon, ShieldAlertIcon } from "lucide-react";
import { AppShell } from "@/components/app/app-shell";
import { PageHeader } from "@/components/page-header";
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
import { fetchAuditEvents, getSession, type WithError } from "@/lib/api";

export const dynamic = "force-dynamic";

const ACTION_LABELS: Record<string, string> = {
  "complaint.submitted": "Aduan dihantar",
  "complaint.classified": "Analisis AI",
  "complaint.escalated": "Eskalasi",
  "complaint.assigned": "Penugasan",
  "complaint.severity_override": "Ubah keutamaan",
};

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");

  // Server-side double check: only superadmin (system_admin) reaches this page.
  if (!session.permissions.includes("audit:view")) redirect("/dashboard");

  const sp = await searchParams;
  const page = sp.page ?? "1";
  const data: WithError<Awaited<ReturnType<typeof fetchAuditEvents>>> =
    await fetchAuditEvents({ page }).catch((e) => ({
      events: [],
      page: 1,
      pageSize: 25,
      total: 0,
      __error: String((e as Error).message),
    }));

  const totalPages = Math.max(1, Math.ceil(data.total / data.pageSize));

  return (
    <AppShell session={session}>
      <PageHeader
        title="Audit Log"
        description={`Rekod tindakan sistem, warganegara dan pegawai — ${data.total} rekod`}
      />

      {data.__error && (
        <Card className="mb-4 border-amber-200 bg-amber-50">
          <CardContent className="text-sm text-amber-800">{data.__error}</CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ScrollTextIcon className="size-4" /> Jejak audit
          </CardTitle>
          <CardDescription>
            Setiap interaksi aduan direkod untuk akauntabiliti dan pematuhan PDPA.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {data.events.length === 0 ? (
            <EmptyState
              icon={ShieldAlertIcon}
              title="Tiada rekod audit"
              description="Rekod audit akan terbina apabila aduan diproses."
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tarikh</TableHead>
                  <TableHead>Tindakan</TableHead>
                  <TableHead>Aktor</TableHead>
                  <TableHead>Entiti</TableHead>
                  <TableHead>Metadata</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.events.map((event) => (
                  <TableRow key={event.id}>
                    <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                      {new Date(event.createdAt).toLocaleString("ms-MY", { timeZone: "Asia/Kuching" })}
                    </TableCell>
                    <TableCell className="font-medium">
                      {ACTION_LABELS[event.action] ?? event.action}
                    </TableCell>
                    <TableCell className="text-xs">
                      <span className="rounded-md bg-slate-100 px-1.5 py-0.5 font-mono">
                        {event.actorKind}
                      </span>
                      <span className="ml-1.5 text-muted-foreground">{event.actorId.slice(0, 12)}…</span>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {event.entityType ?? "—"}
                      {event.entityId ? ` · ${event.entityId.slice(0, 8)}…` : ""}
                    </TableCell>
                    <TableCell className="max-w-[360px] truncate font-mono text-[11px] text-muted-foreground">
                      {JSON.stringify(event.metadata)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}

          {totalPages > 1 && (
            <div className="mt-4 flex items-center justify-end gap-2 text-sm">
              {Array.from({ length: totalPages }, (_, i) => i + 1).slice(0, 10).map((p) => (
                <a
                  key={p}
                  href={`/audit?page=${p}`}
                  className={
                    p === data.page
                      ? "rounded-md bg-[color:var(--primary)] px-2.5 py-1 text-white"
                      : "rounded-md border px-2.5 py-1 hover:bg-muted"
                  }
                >
                  {p}
                </a>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </AppShell>
  );
}

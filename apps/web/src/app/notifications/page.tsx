import { redirect } from "next/navigation";
import Link from "next/link";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { BellIcon, CheckCheckIcon, InboxIcon } from "lucide-react";
import { AppShell } from "@/components/app/app-shell";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { fetchNotifications, getSession, markNotificationRead, SESSION_COOKIE, type WithError } from "@/lib/api";
import { loadEnv } from "@k-aecs/config";
import { statusLabel } from "@/lib/status";

export const dynamic = "force-dynamic";

const TEMPLATE_TITLES: Record<string, string> = {
  "complaint.new": "Aduan baharu",
  "complaint.escalated": "Aduan dinaikkan tahap",
  "complaint.assigned": "Aduan ditugaskan kepada anda",
};

async function markReadAction(formData: FormData) {
  "use server";
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const base = loadEnv().PUBLIC_API_URL.replace(/\/+$/, "");
  await fetch(`${base}/api/v1/notifications/${encodeURIComponent(id)}/read`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
  }).catch(() => undefined);
  revalidatePath("/notifications");
}

export default async function NotificationsPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const data: WithError<Awaited<ReturnType<typeof fetchNotifications>>> =
    await fetchNotifications().catch((e) => ({
      notifications: [],
      unread: 0,
      __error: String((e as Error).message),
    }));

  return (
    <AppShell session={session}>
      <PageHeader
        title="Pemberitahuan"
        description={`Kotak masuk pegawai — ${data.unread} belum dibaca`}
      />
      {data.__error && (
        <Card className="mb-4 border-amber-200 bg-amber-50">
          <CardContent className="text-sm text-amber-800">{data.__error}</CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <BellIcon className="size-4" /> Pemberitahuan sistem
          </CardTitle>
          <CardDescription>
            Amaran aduan baharu, penugasan dan eskalasi yang diluluskan mengikut kategori & daerah.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {data.notifications.length === 0 ? (
            <EmptyState
              icon={InboxIcon}
              title="Tiada pemberitahuan"
              description="Pemberitahuan akan muncul di sini apabila aduan baharu diterima atau ditugaskan kepada anda."
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Jenis</TableHead>
                  <TableHead>Rujukan</TableHead>
                  <TableHead>Butiran</TableHead>
                  <TableHead>Tarikh</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Tindakan</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.notifications.map((n) => {
                  const ref = String(n.payload?.referenceNumber ?? "—");
                  const title = String(n.payload?.title ?? "");
                  const severity = n.payload?.severity ? String(n.payload.severity) : undefined;
                  return (
                    <TableRow key={n.id} className={n.status === "pending" ? "bg-blue-50/40" : undefined}>
                      <TableCell className="font-medium">
                        {TEMPLATE_TITLES[n.templateKey] ?? n.templateKey}
                      </TableCell>
                      <TableCell>
                        <Link
                          href={n.complaintId ? `/complaints/${n.complaintId}` : "/complaints"}
                          className="font-mono text-xs text-blue-700 hover:underline"
                        >
                          {ref}
                        </Link>
                      </TableCell>
                      <TableCell className="max-w-[320px] truncate text-sm text-muted-foreground">
                        {title}
                        {severity ? ` · ${severity}` : ""}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {new Date(n.createdAt).toLocaleString("ms-MY", { timeZone: "Asia/Kuching" })}
                      </TableCell>
                      <TableCell>
                        {n.status === "pending" ? (
                          <span className="rounded-md bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-blue-700 ring-1 ring-blue-200">
                            Baharu
                          </span>
                        ) : (
                          <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600">
                            Dibaca
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {n.status === "pending" && (
                          <form action={markReadAction}>
                            <input type="hidden" name="id" value={n.id} />
                            <Button variant="outline" size="sm" type="submit">
                              <CheckCheckIcon className="size-3.5" /> Tanda dibaca
                            </Button>
                          </form>
                        )}
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

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import Link from "next/link";
import {
  ArrowLeftIcon,
  MapPinIcon,
  LandPlotIcon,
  Building2Icon,
  CalendarDaysIcon,
  FolderOpenIcon,
  MessageSquareTextIcon,
  HistoryIcon,
  LockIcon,
  GlobeIcon,
  CheckCheckIcon,
  PenLineIcon,
  SendIcon,
} from "lucide-react";
import { AppShell } from "@/components/app/app-shell";
import { Banner } from "@/components/banner";
import { StatusBadge } from "@/components/status-badge";
import { EmptyState } from "@/components/empty-state";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardAction } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  addComplaintNote,
  fetchComplaint,
  getSession,
  updateComplaintStatus,
  type WithError,
} from "@/lib/api";
import { COMPLAINT_STATUSES } from "@k-aecs/shared";
import { statusLabel } from "@/lib/status";

export const dynamic = "force-dynamic";

async function handleStatus(formData: FormData) {
  "use server";
  const id = String(formData.get("id") ?? "");
  const status = String(formData.get("status") ?? "");
  const closes = String(formData.get("close") ?? "");
  const note = String(formData.get("note") ?? "").trim();
  if (!id || !status) return;
  const finalStatus = closes === "1" ? "closed" : status;
  try {
    await updateComplaintStatus(id, finalStatus, note || undefined);
  } catch (e) {
    redirect(`/complaints/${id}?error=${encodeURIComponent(e instanceof Error ? e.message : "Gagal kemaskini status")}`);
  }
  revalidatePath(`/complaints/${id}`);
  revalidatePath("/complaints");
  redirect(`/complaints/${id}?ok=${finalStatus === "closed" ? "closed" : "status"}`);
}

async function handleNote(formData: FormData) {
  "use server";
  const id = String(formData.get("id") ?? "");
  const content = String(formData.get("content") ?? "").trim();
  if (!id || !content) return;
  try {
    await addComplaintNote(id, content);
  } catch (e) {
    redirect(`/complaints/${id}?error=${encodeURIComponent(e instanceof Error ? e.message : "Gagal tambah nota")}`);
  }
  revalidatePath(`/complaints/${id}`);
  redirect(`/complaints/${id}?ok=note`);
}

const META = [
  { icon: FolderOpenIcon, key: "Kategori", value: (c: { category: string }) => c.category },
  { icon: LandPlotIcon, key: "Daerah", value: (c: { districtCode: string | null }) => c.districtCode },
  { icon: Building2Icon, key: "Institusi", value: (c: { institutionCode: string | null }) => c.institutionCode },
  { icon: MapPinIcon, key: "Lokasi", value: (c: { location: string | null }) => c.location },
];

export default async function ComplaintDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  const { id } = await params;
  const sp = await searchParams;

  const data: WithError<Awaited<ReturnType<typeof fetchComplaint>>> =
    await fetchComplaint(id).catch((e) => ({
      complaint: {} as Record<string, unknown>,
      notes: [],
      history: [],
      __error: String((e as Error).message),
    }));

  const complaint = data.complaint as
    | (Record<string, unknown> & {
        id: string;
        referenceNumber: string;
        category: string;
        title: string;
        description: string;
        status: string;
        location: string | null;
        districtCode: string | null;
        institutionCode: string | null;
        citizenName?: string | null;
        citizenId?: string | null;
        createdAt: string;
        attachments: string[];
      })
    | undefined;

  const toStatusName = complaint ? statusLabel(complaint.status) : "";

  return (
    <AppShell session={session}>
      <Link
        href="/complaints"
        className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-[color:var(--fg)]"
      >
        <ArrowLeftIcon className="size-4" />
        Kembali ke senarai aduan
      </Link>

      {data.__error && (
        <Banner tone="error">{data.__error}</Banner>
      )}
      {sp.ok === "status" && <Banner tone="success" autoHideMs={5000}>Status aduan telah dikemas kini.</Banner>}
      {sp.ok === "closed" && <Banner tone="success" autoHideMs={5000}>Aduan telah ditutup.</Banner>}
      {sp.ok === "note" && <Banner tone="success" autoHideMs={5000}>Nota telah dihantar.</Banner>}
      {sp.error && <Banner tone="error">{sp.error}</Banner>}

      {complaint && (
        <>
          <div className="mb-6 overflow-hidden rounded-xl ring-1 ring-[color:var(--border)]">
            <div className="gov-weave relative bg-[color:var(--sidebar)] px-5 py-5 sm:px-7">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-3.5">
                  <div className="flex size-12 shrink-0 items-center justify-center rounded-lg bg-white/10 text-white ring-1 ring-white/15">
                    <MessageSquareTextIcon className="size-6" />
                  </div>
                  <div>
                    <p className="font-mono text-lg font-semibold text-white">
                      {complaint.referenceNumber}
                    </p>
                    <p className="text-xs text-slate-300/80">
                      {complaint.citizenName ? `Diadu oleh ${complaint.citizenName}` : "Nama pengadu tidak didedahkan"}
                    </p>
                  </div>
                </div>
                <StatusBadge status={complaint.status} />
              </div>
              <h1 className="mt-4 text-xl font-semibold text-white sm:text-2xl">{complaint.title}</h1>
              <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5">
                {META.map((m) => (
                  <span key={m.key} className="inline-flex items-center gap-1.5 text-xs text-slate-300/85">
                    <m.icon className="size-3.5 text-slate-400" />
                    <span className="capitalize text-slate-400">{m.key}:</span>
                    <span className="font-medium text-slate-100">{m.value(complaint) ?? "—"}</span>
                  </span>
                ))}
                <span className="inline-flex items-center gap-1.5 text-xs text-slate-300/85">
                  <CalendarDaysIcon className="size-3.5 text-slate-400" />
                  <span className="text-slate-400">Dihantar:</span>
                  <span className="font-medium text-slate-100">
                    {new Date(complaint.createdAt).toLocaleString("ms-MY", {
                      day: "2-digit",
                      month: "long",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                      timeZone: "Asia/Kuching",
                    })}
                  </span>
                </span>
              </div>
            </div>
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            <div className="space-y-6 lg:col-span-2">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Penerangan aduan</CardTitle>
                  <CardDescription>Kandungan asal yang dihantar oleh warganegara</CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="whitespace-pre-wrap leading-relaxed text-[color:var(--fg)]">
                    {complaint.description}
                  </p>
                  {complaint.attachments.length > 0 && (
                    <p className="mt-4 text-xs text-muted-foreground">
                      {complaint.attachments.length} lampiran direkodkan
                    </p>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="border-b">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <MessageSquareTextIcon className="size-4 text-[color:var(--primary)]" />
                    Nota
                  </CardTitle>
                  <CardDescription>
                    {data.notes.filter((n) => !n.isInternal).length} notis awam ·{" "}
                    {data.notes.filter((n) => n.isInternal).length} dalaman
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-0">
                  {data.notes.length === 0 ? (
                    <EmptyState
                      icon={MessageSquareTextIcon}
                      title="Tiada nota lagi"
                      description="Nota dalaman dan makluman awam akan dipaparkan di sini."
                    />
                  ) : (
                    <ul className="divide-y divide-[color:var(--border)]">
                      {data.notes.map((n) => (
                        <li key={n.id} className="flex gap-3 px-5 py-4">
                          <span className="mt-0.5 flex flex-col items-center">
                            <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-[color:var(--primary-soft)]">
                              {n.isInternal ? (
                                <LockIcon className="size-3 text-[#1e40af]" />
                              ) : (
                                <GlobeIcon className="size-3 text-emerald-600" />
                              )}
                            </span>
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-semibold text-muted-foreground">
                                {new Date(n.createdAt).toLocaleString("ms-MY", {
                                  day: "2-digit",
                                  month: "short",
                                  year: "numeric",
                                  hour: "2-digit",
                                  minute: "2-digit",
                                  timeZone: "Asia/Kuching",
                                })}
                              </span>
                              <span className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                                {n.isInternal ? "Dalam" : "Awam"}
                              </span>
                            </div>
                            <p className="mt-1 text-sm leading-relaxed text-[color:var(--fg)]">
                              {n.content}
                            </p>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>
            </div>

            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Kemaskini status</CardTitle>
                  <CardDescription>
                    Status semasa: <span className="font-semibold text-[color:var(--fg)]">{toStatusName}</span>
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <form action={handleStatus} className="space-y-4">
                    <input type="hidden" name="id" value={complaint.id} />
                    <div className="space-y-2">
                      <Label htmlFor="status">Status baru</Label>
                      <select
                        id="status"
                        name="status"
                        defaultValue={complaint.status}
                        className="h-9 w-full rounded-lg border border-[color:var(--border)] bg-white px-2.5 text-sm text-[color:var(--fg)] outline-none focus:border-[color:var(--ring)] focus:ring-2 focus:ring-[color:var(--ring)]/40"
                      >
                        {COMPLAINT_STATUSES.map((s) => (
                          <option key={s} value={s}>
                            {statusLabel(s)}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="note">Nota perubahan (pilihan)</Label>
                      <Textarea id="note" name="note" placeholder="Penerangan ringkas perubahan status…" />
                    </div>
                    <div className="grid gap-2">
                      <Button type="submit" className="h-9 w-full">
                        <CheckCheckIcon className="size-4" />
                        Simpan status
                      </Button>
                      <Button
                        type="submit"
                        name="close"
                        value="1"
                        variant="outline"
                        className="h-9 w-full text-rose-600 hover:border-rose-300 hover:bg-rose-50"
                      >
                        Tutup aduan
                      </Button>
                    </div>
                  </form>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <PenLineIcon className="size-4 text-[color:var(--primary)]" />
                    Tambah Nota
                  </CardTitle>
                  <CardDescription>Nota kepada warganegara atau rekod dalaman</CardDescription>
                </CardHeader>
                <CardContent>
                  <form action={handleNote} className="space-y-3">
                    <input type="hidden" name="id" value={complaint.id} />
                    <Textarea name="content" required placeholder="Tulis nota ringkas…" className="min-h-24" />
                    <Button type="submit" className="h-9 w-full">
                      <SendIcon className="size-4" />
                      Hantar nota
                    </Button>
                  </form>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="border-b">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <HistoryIcon className="size-4 text-[color:var(--primary)]" />
                    Sejarah status
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  {data.history.length === 0 ? (
                    <EmptyState
                      icon={HistoryIcon}
                      title="Tiada pergerakan status"
                      description="Perubahan status akan dijejaki di sini."
                    />
                  ) : (
                    <ol className="px-5 py-2">
                      {[...data.history].reverse().map((h) => (
                        <li key={h.id} className="relative flex gap-3 py-3">
                          <span className="flex h-2 w-2 shrink-0 translate-y-1.5 rounded-full bg-[color:var(--primary)] ring-4 ring-[color:var(--primary-soft)]" />
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium text-[color:var(--fg)]">
                              {statusLabel(h.toStatus)}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {new Date(h.createdAt).toLocaleString("ms-MY", {
                                day: "2-digit",
                                month: "short",
                                hour: "2-digit",
                                minute: "2-digit",
                                timeZone: "Asia/Kuching",
                              })}
                            </p>
                          </div>
                        </li>
                      ))}
                    </ol>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </>
      )}
    </AppShell>
  );
}

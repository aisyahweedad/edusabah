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
  BrainCircuitIcon,
  AlertTriangleIcon,
  CopyIcon,
  UserPlusIcon,
  ArrowUpCircleIcon,
  GaugeIcon,
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
  assignComplaint,
  escalateComplaint,
  fetchComplaint,
  fetchOfficers,
  getSession,
  setComplaintSeverity,
  updateComplaintStatus,
  type WithError,
} from "@/lib/api";
import { COMPLAINT_STATUSES, SEVERITIES } from "@k-aecs/shared";
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
  const isInternal = formData.get("isInternal") === "1";
  if (!id || !content) return;
  try {
    await addComplaintNote(id, content, isInternal);
  } catch (e) {
    redirect(`/complaints/${id}?error=${encodeURIComponent(e instanceof Error ? e.message : "Gagal tambah nota")}`);
  }
  revalidatePath(`/complaints/${id}`);
  redirect(`/complaints/${id}?ok=note`);
}

async function handleSeverity(formData: FormData) {
  "use server";
  const id = String(formData.get("id") ?? "");
  const severity = String(formData.get("severity") ?? "");
  if (!id || !severity) return;
  try {
    await setComplaintSeverity(id, severity);
  } catch (e) {
    redirect(`/complaints/${id}?error=${encodeURIComponent(e instanceof Error ? e.message : "Gagal ubah keutamaan")}`);
  }
  revalidatePath(`/complaints/${id}`);
  redirect(`/complaints/${id}?ok=severity`);
}

async function handleAssign(formData: FormData) {
  "use server";
  const id = String(formData.get("id") ?? "");
  const assigneeId = String(formData.get("assigneeId") ?? "").trim();
  if (!id) return;
  try {
    await assignComplaint(id, assigneeId || undefined);
  } catch (e) {
    redirect(`/complaints/${id}?error=${encodeURIComponent(e instanceof Error ? e.message : "Gagal menugaskan")}`);
  }
  revalidatePath(`/complaints/${id}`);
  redirect(`/complaints/${id}?ok=assign`);
}

async function handleEscalate(formData: FormData) {
  "use server";
  const id = String(formData.get("id") ?? "");
  const note = String(formData.get("note") ?? "").trim();
  if (!id) return;
  try {
    await escalateComplaint(id, note || undefined);
  } catch (e) {
    redirect(`/complaints/${id}?error=${encodeURIComponent(e instanceof Error ? e.message : "Gagal eskalasi")}`);
  }
  revalidatePath(`/complaints/${id}`);
  redirect(`/complaints/${id}?ok=escalate`);
}

const SEVERITY_STYLES: Record<string, string> = {
  urgent: "bg-red-50 text-red-700 ring-red-200",
  high: "bg-orange-50 text-orange-700 ring-orange-200",
  medium: "bg-blue-50 text-blue-700 ring-blue-200",
  low: "bg-slate-100 text-slate-600 ring-slate-200",
};

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
        severity?: string;
        sentiment?: string;
        priorityScore?: number;
        sensitive?: boolean;
        duplicateOf?: string | null;
        assignedTo?: string | null;
        aiAnalysis?: {
          summary?: string;
          suggestedCategory?: string;
          duplicateOf?: { referenceNumber: string; similarity: number };
          model?: string;
          autoCategory?: boolean;
        } | null;
      })
    | undefined;

  const canAssign = session.permissions.includes("complaint:assign");
  const canEscalate = session.permissions.includes("complaint:escalate");
  const canUpdate = session.permissions.includes("complaint:update_status");

  const officersList = canAssign
    ? await fetchOfficers().catch(() => ({ officers: [] }))
    : { officers: [] };

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
  {sp.ok === "severity" && <Banner tone="success" autoHideMs={5000}>Keutamaan dikemas kini.</Banner>}
  {sp.ok === "assign" && <Banner tone="success" autoHideMs={5000}>Aduan telah ditugaskan.</Banner>}
  {sp.ok === "escalate" && <Banner tone="success" autoHideMs={5000}>Aduan dinaikkan tahap ke Setiausaha Politik.</Banner>}
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
              {complaint.severity && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base">
                      <BrainCircuitIcon className="size-4 text-[color:var(--primary)]" />
                      Analisis AI
                    </CardTitle>
                    <CardDescription>
                      {complaint.aiAnalysis?.model === "heuristic"
                        ? "Analisis kata kunci (AI tidak tersedia)"
                        : `Model: ${complaint.aiAnalysis?.model ?? "—"}`}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-semibold uppercase ring-1 ${SEVERITY_STYLES[complaint.severity] ?? "bg-slate-100 text-slate-600 ring-slate-200"}`}
                      >
                        <AlertTriangleIcon className="size-3" />
                        {complaint.severity}
                      </span>
                      {complaint.sensitive && (
                        <span className="rounded-md bg-rose-50 px-2 py-0.5 text-[11px] font-semibold text-rose-700 ring-1 ring-rose-200">
                          Kandungan sensitif
                        </span>
                      )}
                      {complaint.duplicateOf && (
                        <span className="inline-flex items-center gap-1 rounded-md bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700 ring-1 ring-amber-200">
                          <CopyIcon className="size-3" /> Duplikat
                        </span>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <p className="text-xs text-muted-foreground">Skor keutamaan</p>
                        <p className="font-semibold text-[color:var(--fg)]">{complaint.priorityScore ?? 50}/100</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Sentimen</p>
                        <p className="font-semibold capitalize text-[color:var(--fg)]">{complaint.sentiment ?? "neutral"}</p>
                      </div>
                    </div>
                    {complaint.aiAnalysis?.summary && (
                      <p className="rounded-lg bg-muted px-3 py-2 text-sm text-[color:var(--fg)]">
                        {complaint.aiAnalysis.summary}
                      </p>
                    )}
                    {complaint.aiAnalysis?.duplicateOf && (
                      <p className="text-xs text-amber-700">
                        Calon duplikat: {complaint.aiAnalysis.duplicateOf.referenceNumber} ·{" "}
                        {(complaint.aiAnalysis.duplicateOf.similarity * 100).toFixed(0)}% serupa
                      </p>
                    )}

                    {canUpdate && (
                      <form action={handleSeverity} className="flex items-end gap-2 border-t pt-3">
                        <input type="hidden" name="id" value={complaint.id} />
                        <div className="flex-1 space-y-1">
                          <Label htmlFor="severity" className="text-xs">
                            Ubah keutamaan (override pegawai)
                          </Label>
                          <select
                            id="severity"
                            name="severity"
                            defaultValue={complaint.severity}
                            className="h-9 w-full rounded-lg border border-[color:var(--border)] bg-white px-2.5 text-sm"
                          >
                            {SEVERITIES.map((s) => (
                              <option key={s} value={s}>
                                {s}
                              </option>
                            ))}
                          </select>
                        </div>
                        <Button type="submit" variant="outline" size="sm" className="h-9">
                          <GaugeIcon className="size-3.5" /> Simpan
                        </Button>
                      </form>
                    )}
                  </CardContent>
                </Card>
              )}

              {canAssign && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Penugasan</CardTitle>
                    <CardDescription>
                      {complaint.assignedTo ? "Aduan telah ditugaskan" : "Belum ditugaskan"}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <form action={handleAssign} className="space-y-3">
                      <input type="hidden" name="id" value={complaint.id} />
                      <select
                        name="assigneeId"
                        defaultValue={complaint.assignedTo ?? ""}
                        className="h-9 w-full rounded-lg border border-[color:var(--border)] bg-white px-2.5 text-sm"
                      >
                        <option value="">— Pilih pegawai —</option>
                        {officersList.officers.map((o) => (
                          <option key={String(o.id)} value={String(o.id)}>
                            {String(o.name)} ({String(o.role)})
                          </option>
                        ))}
                      </select>
                      <Button type="submit" className="h-9 w-full">
                        <UserPlusIcon className="size-4" /> Tugaskan
                      </Button>
                    </form>
                  </CardContent>
                </Card>
              )}

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
                  {canEscalate && complaint.status !== "escalated" && (
                    <form action={handleEscalate} className="mt-3 border-t pt-3">
                      <input type="hidden" name="id" value={complaint.id} />
                      <Textarea name="note" placeholder="Sebab eskalasi (pilihan)…" className="min-h-16" />
                      <Button
                        type="submit"
                        variant="outline"
                        className="mt-2 h-9 w-full text-amber-700 hover:border-amber-300 hover:bg-amber-50"
                      >
                        <ArrowUpCircleIcon className="size-4" /> Eskalasi ke Setiausaha Politik
                      </Button>
                    </form>
                  )}
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
                    <label className="flex items-center gap-2 text-xs text-muted-foreground">
                      <input
                        type="checkbox"
                        name="isInternal"
                        value="1"
                        className="size-3.5 rounded border-[color:var(--border)]"
                      />
                      Nota dalaman (tidak dihantar kepada warganegara)
                    </label>
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

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { UserPlusIcon, UsersIcon, BadgeCheckIcon, MailIcon, ShieldCheckIcon } from "lucide-react";
import { AppShell } from "@/components/app/app-shell";
import { PageHeader } from "@/components/page-header";
import { Banner } from "@/components/banner";
import { EmptyState } from "@/components/empty-state";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { fetchOfficers, getSession, SESSION_COOKIE, type WithError } from "@/lib/api";
import { ROLES } from "@k-aecs/shared";
import { loadEnv } from "@k-aecs/config";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const ROLE_LABELS: Record<string, string> = {
  kpsti_officer: "Pegawai KPSTI",
  supervisor: "Penyelia",
  political_secretary: "Setiausaha Politik",
  system_admin: "Pentadbir Sistem",
};

const ROLE_CLASSES: Record<string, string> = {
  kpsti_officer: "bg-blue-50 text-blue-700 ring-blue-200",
  supervisor: "bg-violet-50 text-violet-700 ring-violet-200",
  political_secretary: "bg-amber-50 text-amber-700 ring-amber-200",
  system_admin: "bg-slate-100 text-slate-700 ring-slate-300",
};

async function createOfficer(body: {
  email: string;
  name: string;
  role: string;
  password: string;
}): Promise<{ ok: boolean; message: string }> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const base = loadEnv().PUBLIC_API_URL.replace(/\/+$/, "");
  const res = await fetch(`${base}/api/v1/auth/officers`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as { message?: string };
  if (!res.ok) return { ok: false, message: json.message ?? "Gagal cipta pengguna" };
  revalidatePath("/users");
  return { ok: true, message: "" };
}

async function handleCreate(formData: FormData) {
  "use server";
  const email = String(formData.get("email") ?? "").toLowerCase().trim();
  const name = String(formData.get("name") ?? "").trim();
  const role = String(formData.get("role") ?? "");
  const password = String(formData.get("password") ?? "");
  if (!email || !name || !role || !password) return;
  const result = await createOfficer({ email, name, role, password });
  redirect(result.ok ? "/users?ok=created" : `/users?error=${encodeURIComponent(result.message)}`);
}

export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!session.permissions.includes("users:manage")) redirect("/dashboard");
  const sp = await searchParams;

  const data: WithError<Awaited<ReturnType<typeof fetchOfficers>>> =
    await fetchOfficers().catch((e) => ({
      officers: [],
      __error: String((e as Error).message),
    }));

  const nameOf = (o: Record<string, unknown>) => String(o.name ?? o.email ?? "—");
  const initialsOf = (o: Record<string, unknown>) =>
    String(o.name ?? "—")
      .split(" ")
      .slice(0, 2)
      .map((w) => w[0])
      .join("")
      .toUpperCase() || "?";

  return (
    <AppShell session={session}>
      {data.__error && <Banner tone="error">{data.__error}</Banner>}
      {sp.ok === "created" && <Banner tone="success" autoHideMs={5000}>Pegawai baharu telah dicipta.</Banner>}
      {sp.error && <Banner tone="error">{sp.error}</Banner>}

      <PageHeader
        eyebrow="Pentadbiran"
        title="Pengurusan Pengguna"
        description={`${data.officers.length} pegawai berdaftar dalam sistem.`}
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-1">
          <Card>
            <CardHeader className="border-[color:var(--border)] border-b">
              <CardTitle className="flex items-center gap-2 text-base">
                <UserPlusIcon className="size-4 text-[color:var(--primary)]" />
                Cipta Pegawai
              </CardTitle>
              <CardDescription>Tambahkan akses panel untuk pegawai baharu</CardDescription>
            </CardHeader>
            <CardContent>
              <form action={handleCreate} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="name">Nama penuh</Label>
                  <Input id="name" name="name" placeholder="cth. Ahmad Faiz bin Omar" required />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="email">E-mel pejabat</Label>
                  <Input id="email" name="email" type="email" placeholder="nama@kpsti.sabah.gov.my" required />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="password">Kata laluan</Label>
                  <Input id="password" name="password" type="password" minLength={8} placeholder="Minimum 8 aksara" required />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="role">Peranan</Label>
                  <select
                    id="role"
                    name="role"
                    defaultValue="kpsti_officer"
                    className="h-9 w-full rounded-lg border border-[color:var(--border)] bg-white px-2.5 text-sm text-[color:var(--fg)] outline-none focus:border-[color:var(--ring)] focus:ring-2 focus:ring-[color:var(--ring)]/40"
                  >
                    {ROLES.map((r) => (
                      <option key={r} value={r}>
                        {ROLE_LABELS[r] ?? r}
                      </option>
                    ))}
                  </select>
                </div>
                <Button type="submit" className="h-9 w-full">
                  <UserPlusIcon className="size-4" />
                  Cipta pengguna
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>

        <div className="lg:col-span-2">
          <Card>
            <CardHeader className="border-[color:var(--border)] border-b">
              <CardTitle className="flex items-center gap-2 text-base">
                <UsersIcon className="size-4 text-[color:var(--primary)]" />
                Senarai Pegawai
              </CardTitle>
              <CardDescription>Semua akaun yang berdaftar dengan panel</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="bg-[color:var(--bg)]">
                    <TableHead className="pl-4 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                      Pegawai
                    </TableHead>
                    <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                      Peranan
                    </TableHead>
                    <TableHead className="pr-4 text-right text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                      Status
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.officers.map((o) => {
                    const role = String(o.role ?? "kpsti_officer");
                    const active = String(o.isActive) === "true";
                    return (
                      <TableRow key={String(o.id)}>
                        <TableCell className="pl-4">
                          <div className="flex items-center gap-3">
                            <Avatar>
                              <AvatarFallback className="bg-[color:var(--primary-soft)] text-[12px] font-semibold text-[#1e40af]">
                                {initialsOf(o)}
                              </AvatarFallback>
                            </Avatar>
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold text-[color:var(--fg)]">{nameOf(o)}</p>
                              <p className="flex items-center gap-1 truncate text-xs text-muted-foreground">
                                <MailIcon className="size-3" />
                                {String(o.email ?? "—")}
                              </p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <span
                            className={cn(
                              "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1",
                              ROLE_CLASSES[role] ?? "bg-slate-100 text-slate-700 ring-slate-300",
                            )}
                          >
                            {ROLE_LABELS[role] ?? role}
                          </span>
                        </TableCell>
                        <TableCell className="pr-4">
                          <span
                            className={cn(
                              "inline-flex w-full items-center justify-end gap-1 text-xs font-semibold",
                              active ? "text-emerald-600" : "text-muted-foreground",
                            )}
                          >
                            <BadgeCheckIcon className="size-3.5" />
                            {active ? "Aktif" : "Tidak aktif"}
                          </span>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {data.officers.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={3} className="p-0">
                        <EmptyState
                          icon={ShieldCheckIcon}
                          title="Belum ada pegawai"
                          description="Cipta pegawai pertama untuk mula menggunakan panel."
                        />
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      </div>
    </AppShell>
  );
}

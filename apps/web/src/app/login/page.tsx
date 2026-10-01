"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { BotIcon, BrainCircuitIcon, BarChart3Icon, ShieldCheckIcon, LockKeyholeIcon } from "lucide-react";
import { clientApiBase, SESSION_COOKIE } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BrandMark } from "@/components/brand";

const FEATURES = [
  { icon: BotIcon, title: "Aduan melalui Telegram", desc: "Warganegara melapor & bertanya 24/7 tanpa aplikasi tambahan." },
  { icon: BrainCircuitIcon, title: "Bantuan AI berharness", desc: "Ringkasan pintar, carian web dan tugasan analitikal teraudit." },
  { icon: BarChart3Icon, title: "Analitis keputusan", desc: "Patuhi status aduan dan kos operasi AI dalam satu panel." },
];

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const apiBase = clientApiBase();

  async function onLogin(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`${apiBase}/api/v1/auth/login`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const body = (await res.json()) as { token?: string; message?: string };
      if (!res.ok || !body.token) throw new Error(body.message ?? "Login gagal");
      document.cookie = `${SESSION_COOKIE}=${body.token}; path=/; max-age=86400; SameSite=Lax`;
      router.push("/dashboard");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login gagal");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid min-h-svh lg:grid-cols-[1.05fr_1fr]">
      {/* Brand panel */}
      <section className="gov-weave relative hidden overflow-hidden bg-[color:var(--sidebar)] lg:flex lg:flex-col lg:justify-between lg:px-12 lg:py-10">
        <div className="absolute -top-24 -right-32 size-96 rounded-full bg-[#1d4ed8]/25 blur-3xl" />
        <div className="absolute -bottom-40 -left-24 size-[28rem] rounded-full bg-[#0e47b8]/30 blur-3xl" />

        <div className="relative flex items-center gap-3">
          <BrandMark className="size-11" />
          <div className="leading-tight">
            <p className="text-xl font-semibold tracking-[0.12em] text-white">EduSabah</p>
            <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-slate-300">
              Sistem Aduan KPSTI
            </p>
          </div>
        </div>

        <div className="relative max-w-md">
          <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-[#2f6be0]/60 bg-[#1d4ed8]/20 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#a8c6ff]">
            <ShieldCheckIcon className="size-3.5" />
            Panel rasmi kerajaan
          </p>
          <h1 className="text-balance text-[34px] leading-[1.15] font-semibold text-white">
            Aduan warganegara, diurus dengan bijak.
          </h1>
          <p className="mt-4 text-[15px] leading-relaxed text-slate-300/90">
            Pusat pengurusan aduan untuk pendidikan Negeri Sabah di bawah Kementerian
            Pendidikan, Sains dan Inovasi — disokong AI dan dipacu data.
          </p>
          <ul className="mt-9 space-y-5">
            {FEATURES.map((f) => (
              <li key={f.title} className="flex items-start gap-3.5">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-white/10 text-[#8fc1ff] ring-1 ring-white/10">
                  <f.icon className="size-[18px]" />
                </span>
                <span>
                  <p className="text-sm font-semibold text-white">{f.title}</p>
                  <p className="mt-0.5 text-[13px] leading-relaxed text-slate-300/80">{f.desc}</p>
                </span>
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-xs text-slate-400">
          Kerajaan Negeri Sabah · Kementerian Pendidikan, Sains dan Inovasi Negeri Sabah
        </p>
      </section>

      {/* Form panel */}
      <section className="gov-grid-light flex items-center justify-center bg-background px-4 py-12 sm:px-8">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <BrandMark className="size-10" />
            <div className="leading-tight">
              <p className="text-lg font-semibold text-[color:var(--fg)]">EduSabah</p>
              <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                Sistem Aduan KPSTI
              </p>
            </div>
          </div>

          <h2 className="text-2xl font-semibold text-[color:var(--fg)]">Log Masuk Pegawai</h2>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Masukkan kelayakan akaun pejabat anda untuk mengakses panel.
          </p>

          <form onSubmit={onLogin} className="mt-8 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">E-mel pejabat</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="nama@kpsti.sabah.gov.my"
                required
                autoComplete="username"
                className="h-10"
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">Kata laluan</Label>
                <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                  <LockKeyholeIcon className="size-3" /> Disulitkan JWT
                </span>
              </div>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                className="h-10"
              />
            </div>

            {error && (
              <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700">
                {error}
              </p>
            )}

            <Button type="submit" disabled={busy} className="h-10 w-full">
              {busy ? "Memproses…" : "Log Masuk"}
            </Button>
          </form>

          <div className="mt-8 flex items-center justify-center gap-2 border-t border-[color:var(--border)] pt-6 text-xs text-muted-foreground">
            <ShieldCheckIcon className="size-3.5 text-emerald-600" />
            Akses terhadap data kerajaan adalah diaudit dan dikawal.
          </div>
        </div>
      </section>
    </div>
  );
}

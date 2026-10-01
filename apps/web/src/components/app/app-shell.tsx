"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { MenuIcon, LogOutIcon, ShieldCheckIcon } from "lucide-react";
import type { SessionClaims } from "@/lib/api";
import { SidebarNav } from "./sidebar-nav";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

const TITLES: Record<string, { crumb: string; title: string }> = {
  "/dashboard": { crumb: "Carta", title: "Carta Ringkasan" },
  "/complaints": { crumb: "Aduan", title: "Aduan Warganegara" },
  "/runs": { crumb: "AI & Carian", title: "AI & Carian Web" },
  "/users": { crumb: "Pengguna", title: "Pengurusan Pengguna" },
};

const ROLE_LABELS: Record<string, string> = {
  kpsti_officer: "Pegawai KPSTI",
  supervisor: "Penyelia",
  political_secretary: "Setiausaha Politik",
  system_admin: "Pentadbir Sistem",
};

function pageMeta(pathname: string): { crumb: string; title: string } {
  const detail = pathname.startsWith("/complaints/");
  if (detail) return { crumb: "Aduan / Butiran", title: "Butiran Aduan" };
  return TITLES[pathname] ?? { crumb: pathname.replace(/^\//, "") || "Utama", title: "EduSabah" };
}

export function AppShell({
  session,
  children,
}: {
  session: SessionClaims;
  children: React.ReactNode;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();
  const meta = pageMeta(pathname);
  const initials =
    ROLE_LABELS[session.role]?.split(" ")
      .slice(0, 2)
      .map((w) => w[0])
      .join("") ?? session.role.slice(0, 2).toUpperCase();

  return (
    <div className="min-h-svh bg-background">
      <a href="#content" className="skip-link">
        Lompat ke kandungan
      </a>

      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 border-r border-[color:var(--sidebar-border)] bg-[color:var(--sidebar)] lg:block">
        <div className="gov-weave h-full">
          <SidebarNav role={session.role} permissions={session.permissions} />
        </div>
      </aside>

      {/* Mobile sheet */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" showCloseButton={false} className="w-72 border-0 bg-[color:var(--sidebar)] p-0 sm:max-w-72">
          <SheetTitle className="sr-only">Navigasi</SheetTitle>
          <div className="gov-weave h-full">
            <SidebarNav
              role={session.role}
              permissions={session.permissions}
              onNavigate={() => setMobileOpen(false)}
            />
          </div>
        </SheetContent>
      </Sheet>

      <div className="lg:pl-64">
        <header className="sticky top-0 z-30 h-16 border-b border-[color:var(--border)] bg-white/85 backdrop-blur">
          <div className="flex h-full items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
            <div className="flex min-w-0 items-center gap-3">
              <button
                type="button"
                aria-label="Buka navigasi"
                onClick={() => setMobileOpen(true)}
                className="flex size-9 items-center justify-center rounded-lg border border-[color:var(--border)] bg-white text-[color:var(--fg)] transition-colors hover:bg-muted lg:hidden"
              >
                <MenuIcon className="size-5" />
              </button>
              <div className="min-w-0 leading-tight">
                <p className="hidden truncate text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground sm:block">
                  Kementerian Pendidikan, Sains & Inovasi Sabah
                </p>
                <h2 className="truncate text-[15px] font-semibold text-[color:var(--fg)]">
                  {meta.title}
                </h2>
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-2.5">
              <span className="hidden items-center gap-1.5 rounded-md bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-700 ring-1 ring-emerald-200 sm:inline-flex">
                <span className="size-1.5 rounded-full bg-emerald-500" />
                Sistem beroperasi
              </span>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    aria-label="Menu akaun"
                    className="flex size-9 items-center justify-center rounded-full bg-[color:var(--primary)] text-[12px] font-semibold text-white ring-1 ring-white/40 transition-opacity hover:opacity-90"
                  >
                    {initials}
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-60 p-1.5">
                  <DropdownMenuLabel className="px-2 py-1.5">
                    <div className="flex items-center gap-2.5">
                      <div className="flex size-9 items-center justify-center rounded-full bg-[color:var(--primary)] text-[12px] font-semibold text-white">
                        {initials}
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-[color:var(--fg)]">
                          {ROLE_LABELS[session.role] ?? session.role}
                        </p>
                        <p className="flex items-center gap-1 text-xs text-muted-foreground">
                          <ShieldCheckIcon className="size-3" /> Tangkapan sesi pejabat
                        </p>
                      </div>
                    </div>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild>
                    <Link href="/logout" className="text-rose-600 focus:text-rose-600">
                      <LogOutIcon />
                      Log keluar
                    </Link>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </header>

        <main id="content" className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          {children}
        </main>

        <footer className="mx-auto w-full max-w-7xl px-4 pb-8 sm:px-6 lg:px-8">
          <div className="flex flex-col items-start justify-between gap-1 border-t border-[color:var(--border)] pt-4 text-xs text-muted-foreground sm:flex-row sm:items-center">
            <p>
              EduSabah · Sistem Aduan &amp; Penglibatan Warganegara — KPSTI Negeri Sabah
            </p>
            <p>Hak cipta © {new Date().getFullYear()} Kerajaan Negeri Sabah</p>
          </div>
        </footer>
      </div>
    </div>
  );
}

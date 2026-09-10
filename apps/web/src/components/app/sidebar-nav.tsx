"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOutIcon, ShieldCheckIcon } from "lucide-react";
import { Brand } from "@/components/brand";
import { visibleNavGroups } from "./nav-links";
import { cn } from "@/lib/utils";

const ROLE_LABELS: Record<string, string> = {
  kpsti_officer: "Pegawai KPSTI",
  supervisor: "Penyelia",
  political_secretary: "Setiausaha Politik",
  system_admin: "Pentadbir Sistem",
};

export function SidebarNav({
  role,
  permissions,
  onNavigate,
}: {
  role: string;
  permissions: string[];
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const groups = visibleNavGroups(permissions);

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-16 shrink-0 items-center border-b border-[color:var(--sidebar-border)] px-4">
        <Brand dark />
      </div>

      <div className="flex flex-1 flex-col gap-6 overflow-y-auto px-3 py-5">
        {groups.map((group) => (
          <nav key={group.heading} aria-label={group.heading} className="grid gap-1">
            <p className="mb-1 px-3 text-[10.5px] font-semibold uppercase tracking-[0.16em] text-[color:var(--sidebar-heading)]">
              {group.heading}
            </p>
            {group.items.map((item) => {
              const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onNavigate}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                    active
                      ? "bg-[color:var(--sidebar-accent)] text-[color:var(--sidebar-accent-fg)]"
                      : "text-[color:var(--sidebar-foreground)] hover:bg-white/5 hover:text-white",
                  )}
                >
                  {active && (
                    <span className="absolute inset-y-2 left-0 w-[3px] rounded-full bg-[color:var(--sidebar-active-bar)]" />
                  )}
                  <item.icon
                    className={cn(
                      "size-[18px] shrink-0 transition-colors",
                      active
                        ? "text-[#7fb2ff]"
                        : "text-[color:var(--sidebar-foreground)]/70 group-hover:text-white",
                    )}
                  />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        ))}
      </div>

      <div className="shrink-0 border-t border-[color:var(--sidebar-border)] p-3">
        <div className="flex items-center gap-2.5 rounded-lg px-2 py-2">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-[#1e3a5f] text-[#8fc1ff]">
            <ShieldCheckIcon className="size-4" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-semibold text-white">
              {ROLE_LABELS[role] ?? role}
            </p>
            <p className="truncate text-[11px] text-[color:var(--sidebar-foreground)]/70">
              Kementerian Pendidikan Sabah
            </p>
          </div>
          <Link
            href="/logout"
            title="Log keluar"
            className="flex size-7 shrink-0 items-center justify-center rounded-md text-[color:var(--sidebar-foreground)]/70 transition-colors hover:bg-white/10 hover:text-white"
          >
            <LogOutIcon className="size-4" />
          </Link>
        </div>
      </div>
    </div>
  );
}

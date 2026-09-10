import type { LucideIcon } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = "blue",
  delta,
  deltaDirection = "up",
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
  icon: LucideIcon;
  tone?: "blue" | "green" | "amber" | "violet" | "red" | "slate";
  delta?: string;
  deltaDirection?: "up" | "down" | "neutral";
}) {
  const tones: Record<string, string> = {
    blue: "bg-[color:var(--primary-soft)] text-[#1e40af]",
    green: "bg-emerald-50 text-emerald-600",
    amber: "bg-amber-50 text-amber-600",
    violet: "bg-violet-50 text-violet-600",
    red: "bg-rose-50 text-rose-600",
    slate: "bg-slate-100 text-slate-600",
  };
  const deltaTones = {
    up: "bg-emerald-50 text-emerald-700",
    down: "bg-rose-50 text-rose-700",
    neutral: "bg-slate-100 text-slate-600",
  };

  return (
    <Card className="relative overflow-hidden p-4 shadow-[0_1px_2px_rgba(15,35,64,0.05)] ring-1 ring-[color:var(--border)]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-[11.5px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            {label}
          </p>
          <div className="mt-1.5 text-[26px] leading-none font-semibold text-[color:var(--fg)]">
            {value}
          </div>
          {hint && <p className="mt-2 text-xs text-muted-foreground">{hint}</p>}
          {delta && (
            <span
              className={cn(
                "mt-2 inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-semibold",
                deltaTones[deltaDirection],
              )}
            >
              {delta}
            </span>
          )}
        </div>
        <div className={cn("flex size-10 shrink-0 items-center justify-center rounded-lg", tones[tone])}>
          <Icon className="size-5" />
        </div>
      </div>
    </Card>
  );
}

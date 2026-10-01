import { cn } from "@/lib/utils";

/** EduSabah official mark — shield with ascending books (education). */
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 44 44"
      aria-hidden="true"
      className={cn("size-9 shrink-0", className)}
    >
      <defs>
        <linearGradient id="km-flag" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#2563eb" />
          <stop offset="0.55" stopColor="#1d4ed8" />
          <stop offset="1" stopColor="#0e47b8" />
        </linearGradient>
      </defs>
      <path
        d="M22 2.6 37.4 9v13c0 9.4-6.4 16.4-15.4 19.4C13 38.4 6.6 31.4 6.6 22V9L22 2.6Z"
        fill="url(#km-flag)"
      />
      <path
        d="M22 5.2 35 10.4v11.6c0 7.9-5.3 14.1-13 16.9C14.3 36.1 9 29.9 9 22V10.4L22 5.2Z"
        fill="none"
        stroke="#fff"
        strokeOpacity="0.22"
        strokeWidth="1"
      />
      <path d="M14 14h16M14 18.5h16" stroke="#ffffff" strokeOpacity="0.35" strokeLinecap="round" strokeWidth="1.4" />
      <path
        d="M14.2 22.5 22 15.8l7.8 6.7v1.2l-2-1.6v4.4h-1.6v-3l-4.2-3.5-4.2 3.5v3h-1.6v-4.4l-2 1.6v-1.2Z"
        fill="#ffd76a"
      />
      <circle cx="22" cy="28.4" r="2.6" fill="#ffd76a" stroke="#bf8f00" strokeOpacity="0.4" strokeWidth="0.6" />
    </svg>
  );
}

export function Brand({ compact = false, dark = false }: { compact?: boolean; dark?: boolean }) {
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <BrandMark />
      {!compact && (
        <div className="flex min-w-0 flex-col leading-tight">
          <span
            className={cn(
              "text-[15px] font-semibold tracking-[0.14em]",
              dark ? "text-white" : "text-slate-900",
            )}
          >
            EduSabah
          </span>
          <span
            className={cn(
              "text-[10.5px] font-medium tracking-[0.08em] uppercase",
              dark ? "text-slate-300/80" : "text-slate-500",
            )}
          >
            Sistem Aduan KPSTI
          </span>
        </div>
      )}
    </div>
  );
}

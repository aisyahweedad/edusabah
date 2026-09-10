export interface DonutSlice {
  label: string;
  value: number;
  color: string;
}

export function DonutChart({
  slices,
  centerLabel,
  centerValue,
}: {
  slices: DonutSlice[];
  centerLabel: string;
  centerValue: number;
  className?: string;
}) {
  const total = slices.reduce((acc, s) => acc + s.value, 0);
  const C = 2 * Math.PI * 30;
  let acc = 0;

  return (
    <div className="flex flex-col items-center gap-6 sm:flex-row sm:gap-8">
      <div className="relative size-44 shrink-0">
        <svg viewBox="0 0 100 100" className="size-full -rotate-90">
          {slices.map((s, i) => {
            const frac = total > 0 ? s.value / total : 0;
            const start = acc;
            acc += frac;
            return (
              <circle
                key={`${s.label}-${i}`}
                cx="50"
                cy="50"
                r="30"
                fill="none"
                stroke={s.color}
                strokeWidth="14"
                strokeDasharray={`${Math.max(frac * C - 0.01, 0)} ${C}`}
                strokeDashoffset={-start * C}
                strokeLinecap="butt"
              />
            );
          })}
          {total === 0 && <circle cx="50" cy="50" r="30" fill="none" stroke="#e2e8f2" strokeWidth="14" />}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
          <span className="text-2xl font-semibold text-[color:var(--fg)]">{centerValue}</span>
          <span className="text-[10.5px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
            {centerLabel}
          </span>
        </div>
      </div>

      <div className="grid w-full gap-1.5">
        {slices.map((s) => (
          <div key={s.label} className="flex items-center justify-between gap-2 text-sm">
            <span className="flex min-w-0 items-center gap-2 text-muted-foreground">
              <span className="size-2.5 shrink-0 rounded-[3px]" style={{ background: s.color }} />
              <span className="truncate">{s.label}</span>
            </span>
            <span className="flex shrink-0 items-center gap-3">
              <span className="font-semibold text-[color:var(--fg)]">{s.value}</span>
              <span className="w-10 text-right text-xs text-muted-foreground">
                {total > 0 ? Math.round((s.value / total) * 100) : 0}%
              </span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

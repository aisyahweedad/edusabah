export interface BarItem {
  label: string;
  value: number;
  color?: string;
}

export function HBarChart({ items }: { items: BarItem[] }) {
  const max = Math.max(1, ...items.map((i) => i.value));
  return (
    <div className="space-y-3.5">
      {items.map((item, i) => (
        <div key={item.label} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
          <div className="flex items-center gap-3">
            <span className="w-28 truncate text-sm text-muted-foreground sm:w-40">{item.label}</span>
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-[color:var(--muted)]">
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${Math.max((item.value / max) * 100, item.value > 0 ? 3 : 0)}%`,
                  background: item.color ?? "var(--primary)",
                }}
              />
            </div>
          </div>
          <span className="w-8 text-right text-sm font-semibold text-[color:var(--fg)]">
            {item.value}
          </span>
        </div>
      ))}
    </div>
  );
}

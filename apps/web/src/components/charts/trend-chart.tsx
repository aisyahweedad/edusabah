"use client";

import { useId, useMemo, useState } from "react";

const W = 640;
const H = 200;
const PAD_T = 14;
const PAD_R = 10;
const PAD_B = 30;
const PAD_L = 34;

export interface TrendPoint {
  label: string;
  value: number;
}

export function TrendChart({
  data,
  color = "var(--primary)",
}: {
  data: TrendPoint[];
  color?: string;
}) {
  const uid = useId().replace(/[:]/g, "");
  const [hover, setHover] = useState<number | null>(null);

  const { points, niceMax, xAt, yAt, step } = useMemo(() => {
    if (data.length === 0) return { points: [] as number[], niceMax: 1, xAt: () => 0, yAt: () => 0, step: 0 };
    const vals = data.map((d) => d.value);
    const max = Math.max(1, ...vals);
    const niceMax = max * 1.18;
    const innerW = W - PAD_L - PAD_R;
    const innerH = H - PAD_T - PAD_B;
    const step = data.length > 1 ? innerW / (data.length - 1) : innerW;
    const xAt = (i: number) => PAD_L + (data.length > 1 ? i * step : innerW / 2);
    const yAt = (v: number) => PAD_T + innerH - (v / niceMax) * innerH;
    return { points: data.map((d, i) => xAt(i)), niceMax, xAt, yAt, step };
  }, [data]);

  if (data.length === 0) {
    return <p className="py-10 text-center text-sm text-muted-foreground">Belum ada data untuk ditunjukkan.</p>;
  }

  const linePath = data.map((d, i) => `${i === 0 ? "M" : "L"}${points[i]!.toFixed(1)},${yAt(d.value).toFixed(1)}`).join(" ");
  const areaPath = `${linePath} L${points[data.length - 1]!.toFixed(1)},${(H - PAD_B).toFixed(1)} L${points[0]!.toFixed(1)},${(H - PAD_B).toFixed(1)} Z`;

  const maxVal = Math.max(1, ...data.map((d) => d.value));
  const labelEvery = Math.ceil(data.length / 8);
  const hoverPct = hover !== null ? (points[hover]! / W) * 100 : 0;

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-52 w-full" role="img" aria-label="Graf aliran aduan mengikut hari">
        <defs>
          <linearGradient id={`${uid}-fill`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={color} stopOpacity="0.28" />
            <stop offset="1" stopColor={color} stopOpacity="0.02" />
          </linearGradient>
        </defs>

        {[0, 0.5, 1].map((f) => {
          const y = PAD_T + (H - PAD_T - PAD_B) * f;
          const val = Math.round(niceMax * (1 - f));
          return (
            <g key={f}>
              <line x1={PAD_L} y1={y} x2={W - PAD_R} y2={y} stroke="#e2e8f2" strokeWidth="1" />
              <text x={PAD_L - 6} y={y + 3.5} textAnchor="end" className="fill-slate-400 text-[10px]">
                {val}
              </text>
            </g>
          );
        })}

        <path d={areaPath} fill={`url(#${uid}-fill)`} />
        <path d={linePath} fill="none" stroke={color} strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" />

        {hover !== null && (
          <g>
            <line x1={points[hover]!} y1={PAD_T} x2={points[hover]!} y2={H - PAD_B} stroke="#94a3b8" strokeWidth="1" strokeDasharray="3 3" />
            <circle cx={points[hover]!} cy={yAt(data[hover]!.value)} r="4.5" fill="white" stroke={color} strokeWidth="2.5" />
          </g>
        )}

        {data.map((d, i) =>
          i % labelEvery === 0 || i === data.length - 1 ? (
            <text key={i} x={points[i]!} y={H - 10} textAnchor="middle" className="fill-slate-400 text-[10px]">
              {d.label}
            </text>
          ) : null,
        )}

        {data.map((d, i) => (
          <rect
            key={i}
            x={points[i]! - step / 2}
            y={PAD_T}
            width={step}
            height={H - PAD_T - PAD_B}
            fill="transparent"
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(null)}
          />
        ))}
      </svg>

      {hover !== null && (
        <div
          className="pointer-events-none absolute top-0 z-10 -translate-x-1/2 rounded-md bg-[color:var(--fg)] px-2.5 py-1.5 text-center shadow-lg"
          style={{ left: `${hoverPct}%` }}
        >
          <p className="text-[10.5px] font-medium text-slate-100">{data[hover]!.label}</p>
          <p className="text-sm font-semibold text-white">{maxVal >= 0 ? data[hover]!.value : 0} aduan</p>
        </div>
      )}
    </div>
  );
}

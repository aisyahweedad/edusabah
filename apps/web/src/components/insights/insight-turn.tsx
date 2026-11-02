"use client";

import Link from "next/link";
import { BarChart3Icon, DownloadIcon, Loader2Icon, SparklesIcon, ZapIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { DonutChart } from "@/components/charts/donut-chart";
import { HBarChart } from "@/components/charts/hbar-chart";
import { TrendChart } from "@/components/charts/trend-chart";
import type { InsightData, InsightSuggestion } from "@/lib/api";

export interface InsightTurn {
  id: string;
  question: string;
  answer: string;
  data: InsightData | null;
  suggestions: InsightSuggestion[];
  createdAt?: string;
}

const METRIC_LABELS: Record<string, string> = {
  count: "Bilangan aduan",
  avg_resolution_hours: "Purata masa penyelesaian (jam)",
  avg_priority: "Purata skor keutamaan",
};

const CHART_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
  "var(--chart-6)",
];

function paragraphs(answer: string | null): string[] {
  return (answer || "Tiada penjelasan dijana.")
    .replace(/\*\*/g, "")
    .replace(/^#{1,6}\s+/gm, "")
    .trim()
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
}

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString("ms-MY", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Kuching",
  });
}

function InsightChart({ data }: { data: InsightData }) {
  if (data.rows.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-[color:var(--border)] px-4 py-6 text-center text-sm text-muted-foreground">
        Tiada data untuk dipaparkan.
      </p>
    );
  }
  if (data.chart.type === "donut") {
    return (
      <DonutChart
        slices={data.rows.map((row, index) => ({
          label: row.label,
          value: row.value,
          color: CHART_COLORS[index % CHART_COLORS.length]!,
        }))}
        centerLabel={data.metric === "count" ? "ADUAN" : "NILAI"}
        centerValue={data.total}
      />
    );
  }
  if (data.chart.type === "line") {
    return (
      <TrendChart
        data={[...data.rows]
          .sort((a, b) => a.label.localeCompare(b.label))
          .map((row) => ({ label: row.label, value: row.value }))}
      />
    );
  }
  return (
    <HBarChart
      items={data.rows.map((row, index) => ({
        label: row.label,
        value: row.value,
        color: CHART_COLORS[index % CHART_COLORS.length]!,
      }))}
    />
  );
}

export function InsightTurnCard({
  turn,
  index,
  onExport,
  onAction,
  busyAction,
  readOnly = false,
}: {
  turn: InsightTurn;
  index?: number;
  onExport?: (format: "csv" | "xlsx" | "pdf", data: InsightData) => void;
  onAction?: (suggestion: InsightSuggestion) => void;
  busyAction?: string | null;
  readOnly?: boolean;
}) {
  const data = turn.data;
  const metricLabel = data ? METRIC_LABELS[data.metric] ?? data.metric : "Nilai";

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3 border-b">
        <div className="min-w-0">
          <CardTitle className="flex items-start gap-2 text-base">
            {typeof index === "number" && (
              <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-[color:var(--primary-soft)] text-[11px] font-semibold text-[color:var(--primary)]">
                {index + 1}
              </span>
            )}
            <span className="min-w-0">{turn.question}</span>
          </CardTitle>
          {turn.createdAt && <CardDescription>{formatDateTime(turn.createdAt)}</CardDescription>}
        </div>
        {!readOnly && data && onExport && (
          <div className="flex shrink-0 flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => onExport("csv", data)}>
              <DownloadIcon className="size-3.5" /> CSV
            </Button>
            <Button variant="outline" size="sm" onClick={() => onExport("xlsx", data)}>
              <DownloadIcon className="size-3.5" /> XLSX
            </Button>
            <Button variant="outline" size="sm" onClick={() => onExport("pdf", data)}>
              <DownloadIcon className="size-3.5" /> PDF
            </Button>
          </div>
        )}
      </CardHeader>
      <CardContent className="space-y-5 pt-5">
        <div>
          <div className="flex items-center gap-2">
            <SparklesIcon className="size-4 text-[color:var(--primary)]" />
            <h3 className="text-sm font-semibold text-[color:var(--fg)]">Penjelasan AI</h3>
          </div>
          <div className="mt-2 space-y-3 text-sm leading-relaxed text-[color:var(--fg)]">
            {paragraphs(turn.answer).map((paragraph, paragraphIndex) => (
              <p key={paragraphIndex} className="whitespace-pre-wrap">
                {paragraph}
              </p>
            ))}
          </div>
        </div>

        {data && (
          <>
            <div className="border-t border-[color:var(--border)] pt-5">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <BarChart3Icon className="size-4 text-[color:var(--primary)]" />
                  <h3 className="text-sm font-semibold text-[color:var(--fg)]">
                    {data.chart.title}
                  </h3>
                </div>
                <span className="text-xs text-muted-foreground">
                  {data.rows.length} kumpulan
                </span>
              </div>
              <InsightChart data={data} />
            </div>

            <div className="overflow-hidden rounded-lg border border-[color:var(--border)]">
              <Table>
                <TableHeader>
                  <TableRow className="bg-[color:var(--bg)]">
                    <TableHead className="pl-4 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                      Kumpulan
                    </TableHead>
                    <TableHead className="pr-4 text-right text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                      {metricLabel}
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.rows.map((row) => (
                    <TableRow key={`${row.key}-${row.label}`}>
                      <TableCell className="pl-4 font-medium text-[color:var(--fg)]">
                        {row.label}
                      </TableCell>
                      <TableCell className="pr-4 text-right tabular-nums text-[color:var(--fg)]">
                        {row.value.toLocaleString()}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </>
        )}

        {turn.suggestions.length > 0 && (
          <div className="border-t border-[color:var(--border)] pt-4">
            <p className="mb-2 flex items-center gap-2 text-sm font-semibold text-[color:var(--fg)]">
              <ZapIcon className="size-4 text-amber-500" /> Cadangan tindakan
            </p>
            <ul className="grid gap-2 sm:grid-cols-2">
              {turn.suggestions.map((suggestion) => (
                <li
                  key={suggestion.id}
                  className="rounded-lg border border-[color:var(--border)] bg-white p-3"
                >
                  <p className="text-sm font-medium text-[color:var(--fg)]">{suggestion.title}</p>
                  <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                    {suggestion.description}
                  </p>
                  <div className="mt-2">
                    {suggestion.action.type === "navigate" ? (
                      <Link
                        href={suggestion.action.href}
                        className="text-xs font-medium text-[color:var(--primary)] hover:underline"
                      >
                        Buka senarai aduan
                      </Link>
                    ) : onAction && !readOnly ? (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-amber-700 hover:border-amber-300 hover:bg-amber-50"
                        disabled={busyAction === suggestion.id}
                        onClick={() => onAction(suggestion)}
                      >
                        {busyAction === suggestion.id ? (
                          <>
                            <Loader2Icon className="size-3 animate-spin" /> Memproses…
                          </>
                        ) : (
                          "Terima tindakan"
                        )}
                      </Button>
                    ) : (
                      <span className="text-xs text-muted-foreground">
                        Tindakan eskalasi boleh dilakukan dari sesi aktif.
                      </span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

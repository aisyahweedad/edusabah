"use client";

import { useEffect, useRef, useState } from "react";
import { CheckCircle2Icon, TriangleAlertIcon, InfoIcon, XIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type Tone = "success" | "error" | "info";

const TONES: Record<Tone, { box: string; icon: string; iconEl: React.ReactNode }> = {
  success: {
    box: "border-emerald-200 bg-emerald-50 text-emerald-800",
    icon: "text-emerald-600",
    iconEl: <CheckCircle2Icon className="size-4.5" />,
  },
  error: {
    box: "border-rose-200 bg-rose-50 text-rose-800",
    icon: "text-rose-600",
    iconEl: <TriangleAlertIcon className="size-4.5" />,
  },
  info: {
    box: "border-blue-200 bg-blue-50 text-blue-800",
    icon: "text-blue-600",
    iconEl: <InfoIcon className="size-4.5" />,
  },
};

export function Banner({
  children,
  tone = "info",
  autoHideMs,
}: {
  children: React.ReactNode;
  tone?: Tone;
  autoHideMs?: number;
}) {
  const [show, setShow] = useState(true);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const t = TONES[tone];

  useEffect(() => {
    if (autoHideMs) timer.current = setTimeout(() => setShow(false), autoHideMs);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [autoHideMs]);

  if (!show) return null;
  return (
    <div
      role="status"
      className={cn(
        "mb-4 flex items-start justify-between gap-3 rounded-lg border px-3.5 py-2.5 text-sm shadow-sm",
        t.box,
      )}
    >
      <span className="flex items-start gap-2 font-medium">
        <span className={cn("mt-0.5 shrink-0", t.icon)}>{t.iconEl}</span>
        <span>{children}</span>
      </span>
      <button
        type="button"
        aria-label="Tutup"
        onClick={() => setShow(false)}
        className="shrink-0 rounded-sm opacity-60 transition-opacity hover:opacity-100"
      >
        <XIcon className="size-4" />
      </button>
    </div>
  );
}

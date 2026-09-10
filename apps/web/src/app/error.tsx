"use client";

import { TriangleAlertIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="gov-grid-light flex min-h-svh items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm text-center">
        <div className="mx-auto flex size-12 items-center justify-center rounded-xl bg-rose-50">
          <TriangleAlertIcon className="size-6 text-rose-600" />
        </div>
        <h1 className="mt-4 text-lg font-semibold text-[color:var(--fg)]">
          Ralat memaparkan halaman
        </h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          {error.message || "Terdapat masalah yang tidak dijangka."}
        </p>
        <Button onClick={reset} className="mt-6">
          Cuba semula
        </Button>
      </div>
    </div>
  );
}

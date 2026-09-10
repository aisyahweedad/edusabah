import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="min-h-svh bg-background">
      <div className="fixed inset-y-0 left-0 z-40 hidden w-64 border-r border-slate-800 bg-[#0b1d33] lg:block">
        <div className="flex h-full flex-col">
          <div className="flex h-16 items-center gap-2.5 border-b border-slate-800 px-4">
            <Skeleton className="size-9 rounded-lg bg-slate-800" />
            <div className="space-y-1.5">
              <Skeleton className="h-3 w-24 bg-slate-800" />
              <Skeleton className="h-2 w-28 bg-slate-800" />
            </div>
          </div>
          <div className="space-y-8 px-3 py-5">
            {[0, 1, 2].map((g) => (
              <div key={g} className="space-y-2">
                <Skeleton className="h-2 w-16 bg-slate-800/70" />
                {[0, 1].map((j) => (
                  <div key={j} className="flex items-center gap-3">
                    <Skeleton className="size-5 bg-slate-800/70" />
                    <Skeleton className="h-3.5 w-24 bg-slate-800/70" />
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="lg:pl-64">
        <div className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-[color:var(--border)] bg-white/85 px-4 backdrop-blur sm:px-6 lg:px-8">
          <div className="space-y-1.5">
            <Skeleton className="h-2 w-32" />
            <Skeleton className="h-3.5 w-40" />
          </div>
          <div className="flex items-center gap-2.5">
            <Skeleton className="h-7 w-28 rounded-md" />
            <Skeleton className="size-9 rounded-full" />
          </div>
        </div>

        <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          <div className="mb-6 space-y-2">
            <Skeleton className="h-2.5 w-24" />
            <Skeleton className="h-7 w-72" />
            <Skeleton className="h-3.5 w-96" />
          </div>
          <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-28 rounded-xl" />
            ))}
          </div>
          <Skeleton className="mb-6 h-56 rounded-xl" />
          <div className="grid gap-6 lg:grid-cols-2">
            <Skeleton className="h-72 rounded-xl" />
            <Skeleton className="h-72 rounded-xl" />
          </div>
        </main>
      </div>
    </div>
  );
}

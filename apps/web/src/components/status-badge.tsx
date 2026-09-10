import { statusBadgeClasses, statusLabel } from "@/lib/status";
import { cn } from "@/lib/utils";

export function StatusBadge({
  status,
  className,
  withLabel = true,
}: {
  status: string;
  className?: string;
  withLabel?: boolean;
}) {
  return (
    <span
      className={cn("st-badge", className)}
      style={{ ...(statusBadgeClasses(status).split(";").filter(Boolean)
        .reduce((acc, kv) => {
          const [k, v] = kv.split(":");
          if (k && v) acc[k.trim()] = v.trim();
          return acc;
        }, {} as Record<string, string>)) }}
    >
      <span className="st-dot" />
      {withLabel && statusLabel(status)}
    </span>
  );
}

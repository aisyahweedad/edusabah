import { statusBadgeClasses, statusLabel } from "@/lib/status";
import { cn } from "@/lib/utils";

interface BadgeStyle {
  color: string;
  background: string;
  borderColor: string;
}

/** CSS-string → camelCase React style (React rejects kebab-case keys). */
function parseBadgeStyle(css: string): BadgeStyle {
  const style: Record<string, string> = {};
  for (const kv of css.split(";").filter(Boolean)) {
    const [rawKey, ...rest] = kv.split(":");
    const value = rest.join(":").trim();
    if (!rawKey || !value) continue;
    const key = rawKey.trim().replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
    style[key] = value;
  }
  return style as unknown as BadgeStyle;
}

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
      style={parseBadgeStyle(statusBadgeClasses(status))}
    >
      <span className="st-dot" />
      {withLabel && statusLabel(status)}
    </span>
  );
}

import { cn } from "@/lib/utils";
import { statusLabel, type Status } from "@/content/site";

/**
 * Status is the only thing colour is allowed to mean on this site.
 * aqua = shipped, copper = in progress or planned.
 */
export function StatusPill({
  status,
  className,
  label,
}: {
  status: Status;
  className?: string;
  label?: string;
}) {
  const live = status === "live";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 font-mono text-[0.6875rem] tracking-wide",
        live
          ? "border-signal/25 bg-signal/[0.07] text-signal"
          : "border-ember/25 bg-ember/[0.07] text-ember",
        status === "planned" && "border-line-strong bg-transparent text-faint",
        className,
      )}
    >
      <span
        className={cn(
          "h-1.5 w-1.5 rounded-full",
          live ? "bg-signal" : status === "building" ? "bg-ember" : "bg-faint",
        )}
        aria-hidden
      />
      {label ?? statusLabel[status]}
    </span>
  );
}

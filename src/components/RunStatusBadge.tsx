import { cn } from "@/lib/utils";
import type { RunStatus } from "@/lib/api";

interface Props {
  status: RunStatus;
  showDot?: boolean;
}

const labels: Record<RunStatus, string> = {
  pending: "Pending",
  processing: "Processing",
  done: "Done",
  failed: "Failed",
};

export function RunStatusBadge({ status, showDot = false }: Props) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 px-2 py-0.5 rounded-sm text-[11px] font-medium border",
        `status-${status}`
      )}
    >
      {showDot && status === "processing" && (
        <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse-dot" />
      )}
      {labels[status]}
    </span>
  );
}

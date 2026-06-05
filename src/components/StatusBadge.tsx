import { statusLabels, statusTone } from "@/lib/status";
import type { AttendanceStatus } from "@/lib/types";

export function StatusBadge({ status }: { status: AttendanceStatus }) {
  const tone = statusTone[status];
  const label = statusLabels[status];

  return (
    <span className={`status-badge ${tone}`}>
      <span className="status-dot" />
      {label}
    </span>
  );
}

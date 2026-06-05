import React from "react";

interface Props {
  theme?: "light" | "dark";
}

export function StatusLegend({ theme = "light" }: Props) {
  const isDark = theme === "dark";

  const row = (color: string, label: string, detail: string, dotStyle?: React.CSSProperties) => (
    <span key={label} className="status-legend-item">
      <span className="status-legend-dot" style={{ background: color, ...dotStyle }} />
      <span className="status-legend-label">{label}</span>
      <span className="status-legend-detail">{detail}</span>
    </span>
  );

  return (
    <div className={`status-legend${isDark ? " dark" : ""}`}>
      {row("#22c55e", "Working",        "clocked in · shows time on clock")}
      {row("#fbbf24", "On break/lunch", "live break duration")}
      {row("#ef4444", "Late",           "scheduled now but not clocked in")}
      {row("#d1d5db", "Not in yet",     "shift today, not started")}
      {row("#3b82f6", "Vacation",       "")}
      {row("#ef4444", "Sick",           "", { outline: "2px solid #b91c1c", outlineOffset: "1px" })}

      {/* Separator */}
      <span className="status-legend-sep" />

      {/* Coverage dot explanation */}
      <span className="status-legend-item">
        <span className="status-legend-dot" style={{ background: "#22c55e", boxShadow: "0 0 0 3px #dcfce7" }} />
        <span className="status-legend-label">On Now dot</span>
        <span className="status-legend-detail">green = clocked in · red = not yet punched in</span>
      </span>
    </div>
  );
}

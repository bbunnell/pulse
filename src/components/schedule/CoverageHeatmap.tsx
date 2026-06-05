"use client";

import type { ScheduledShift } from "@/lib/types";

interface Props {
  dayDate: string;      // "2026-06-07"
  allShifts: ScheduledShift[];
}

/**
 * 24-segment coverage bar for a single day.
 * Green = at least one shift covers that hour.
 * Red   = uncovered.
 *
 * Handles overnight shifts from the previous day.
 */
export function CoverageHeatmap({ dayDate, allShifts }: Props) {
  const covered = computeCoverage(dayDate, allShifts);
  const hasGap = covered.some((c) => !c);

  return (
    <div className="coverage-heatmap" title={hasGap ? "Coverage gap detected" : "Full coverage"}>
      {covered.map((c, h) => (
        <div
          key={h}
          className={`coverage-cell ${c ? "covered" : "gap"}`}
          title={`${String(h).padStart(2,"0")}:00 — ${c ? "covered" : "NO COVERAGE"}`}
        />
      ))}
    </div>
  );
}

function prevDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}

function computeCoverage(dayDate: string, shifts: ScheduledShift[]): boolean[] {
  const covered = new Array<boolean>(24).fill(false);
  const prev    = prevDate(dayDate);

  for (const s of shifts) {
    const h  = parseInt(s.startTime.split(":")[0], 10);
    const e  = parseInt(s.endTime.split(":")[0], 10);
    const overnight = s.endTime <= s.startTime;

    if (s.shiftDate === dayDate) {
      if (!overnight) {
        // Normal shift: covers h..e-1
        for (let i = h; i < e; i++) covered[i] = true;
      } else {
        // Starts today, ends tomorrow: covers h..23
        for (let i = h; i < 24; i++) covered[i] = true;
      }
    }

    // Overnight shift that STARTED yesterday covers 0..e on today
    if (s.shiftDate === prev && overnight) {
      for (let i = 0; i < e; i++) covered[i] = true;
    }
  }

  return covered;
}

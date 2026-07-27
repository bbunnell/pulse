"use client";

const MONTHS = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];

function daysInMonth(month: number): number {
  // Use a leap year (2000) so February has 29 days
  return new Date(2000, month, 0).getDate();
}

interface Props {
  id?: string;
  value: string;        // "MM-DD" or ""
  onChange(value: string): void;
  disabled?: boolean;
}

export function MonthDayPicker({ id, value, onChange, disabled }: Props) {
  const [mm, dd] = value ? value.split("-").map(Number) : [0, 0];

  function handleMonth(e: React.ChangeEvent<HTMLSelectElement>) {
    const newMm = Number(e.target.value);
    if (!newMm) { onChange(""); return; }
    const safeDd = dd > daysInMonth(newMm) ? 1 : (dd || 1);
    onChange(`${String(newMm).padStart(2,"0")}-${String(safeDd).padStart(2,"0")}`);
  }

  function handleDay(e: React.ChangeEvent<HTMLSelectElement>) {
    const newDd = Number(e.target.value);
    if (!newDd) { onChange(""); return; }
    const activeMm = mm || 1;
    onChange(`${String(activeMm).padStart(2,"0")}-${String(newDd).padStart(2,"0")}`);
  }

  const days = mm ? daysInMonth(mm) : 31;

  return (
    <div style={{ display:"flex", gap:8 }} id={id}>
      <select className="select" value={mm || ""} onChange={handleMonth} disabled={disabled} style={{ flex:2 }}>
        <option value="">Month</option>
        {MONTHS.map((name, i) => (
          <option key={i+1} value={i+1}>{name}</option>
        ))}
      </select>
      <select className="select" value={dd || ""} onChange={handleDay} disabled={disabled} style={{ flex:1 }}>
        <option value="">Day</option>
        {Array.from({ length: days }, (_, i) => i + 1).map((d) => (
          <option key={d} value={d}>{d}</option>
        ))}
      </select>
    </div>
  );
}

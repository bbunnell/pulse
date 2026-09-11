/**
 * Which decoration, if any, the dashboard should be wearing today.
 *
 * Pure date arithmetic, deliberately separated from the canvas so the calendar
 * can be reasoned about and tested without a browser. Resolution happens in the
 * ORG's timezone, not the viewer's, so the whole team sees the pumpkins on the
 * same day — the same rule the board already follows for punch times.
 */

export type EffectKind = "fall" | "fireworks";

export interface SeasonalEffect {
  /** Stable id, used for the "I've dismissed this one" key. */
  id: string;
  /** Shown in the dismiss control's label. */
  label: string;
  kind: EffectKind;
  /** Drawn as text on the canvas. Empty for fireworks, which draws its own. */
  sprites: string[];
  /** Rough particles on screen at once. Kept small; see SeasonalCanvas. */
  density: number;
}

/** Day-of-year window, inclusive, as [month, day] pairs. Month is 1-based. */
type Window = { from: [number, number]; to: [number, number] };

interface Entry {
  effect: SeasonalEffect;
  /** A fixed window, or a function returning the single date it applies to. */
  window?: Window;
  onDate?: (year: number) => [number, number];
}

/**
 * Ordered by specificity — the FIRST match wins.
 *
 * That ordering is load-bearing: the winter solstice (Dec 21) sits inside
 * Christmas week, and Christmas is the more specific occasion, so it has to come
 * first or the tree-and-Santa week would be overridden by plain snow.
 */
const CALENDAR: Entry[] = [
  {
    effect: { id: "halloween", label: "Halloween", kind: "fall",
              sprites: ["🎃", "👻", "🦇"], density: 26 },
    window: { from: [10, 24], to: [10, 31] },
  },
  {
    effect: { id: "christmas", label: "Christmas", kind: "fall",
              sprites: ["❄️", "🎅", "🎄"], density: 30 },
    window: { from: [12, 19], to: [12, 26] },
  },
  {
    effect: { id: "independence-eve", label: "Independence Day", kind: "fireworks",
              sprites: [], density: 0 },
    onDate: lastWorkdayBeforeJuly4,
  },
  // Season openers. One day each, and last in the list so a named holiday
  // always outranks them.
  {
    effect: { id: "spring", label: "First day of spring", kind: "fall",
              sprites: ["🌸", "🌷", "🌼"], density: 22 },
    window: { from: [3, 20], to: [3, 20] },
  },
  {
    effect: { id: "summer", label: "First day of summer", kind: "fall",
              sprites: ["🌻", "🦋", "🐝"], density: 20 },
    window: { from: [6, 21], to: [6, 21] },
  },
  {
    effect: { id: "autumn", label: "First day of autumn", kind: "fall",
              sprites: ["🍂", "🍁", "🌰"], density: 24 },
    window: { from: [9, 22], to: [9, 22] },
  },
  {
    effect: { id: "winter", label: "First day of winter", kind: "fall",
              sprites: ["❄️", "⛄"], density: 26 },
    window: { from: [12, 21], to: [12, 21] },
  },
];

/**
 * The latest weekday strictly before 4 July.
 *
 * "The last work day before the 4th" is not simply the 3rd: when the 4th falls
 * on a Saturday the last work day is Friday the 3rd, and when it falls on a
 * Sunday it is Friday the 2nd. Walks back from the 3rd until it lands Mon–Fri.
 */
export function lastWorkdayBeforeJuly4(year: number): [number, number] {
  const d = new Date(Date.UTC(year, 6, 3)); // 3 July, months are 0-based
  while (d.getUTCDay() === 0 || d.getUTCDay() === 6) {
    d.setUTCDate(d.getUTCDate() - 1);
  }
  return [d.getUTCMonth() + 1, d.getUTCDate()];
}

function inWindow(month: number, day: number, w: Window): boolean {
  const v = month * 100 + day;
  const a = w.from[0] * 100 + w.from[1];
  const b = w.to[0] * 100 + w.to[1];
  // Windows in this calendar never wrap the year end; if one ever does, it
  // would need the a > b branch.
  return v >= a && v <= b;
}

/** Look one up by id, for the ?fx= preview override. */
export function effectById(id: string): SeasonalEffect | null {
  return CALENDAR.find((e) => e.effect.id === id)?.effect ?? null;
}

/** Every id, for the preview hint. */
export function allEffectIds(): string[] {
  return CALENDAR.map((e) => e.effect.id);
}

/**
 * The effect for a given YYYY-MM-DD, or null on an ordinary day — which is
 * almost every day, and the case the whole thing is tuned for.
 */
export function effectForDate(isoDate: string): SeasonalEffect | null {
  const [y, m, d] = isoDate.split("-").map(Number);
  if (!y || !m || !d) return null;

  for (const entry of CALENDAR) {
    if (entry.window && inWindow(m, d, entry.window)) return entry.effect;
    if (entry.onDate) {
      const [em, ed] = entry.onDate(y);
      if (em === m && ed === d) return entry.effect;
    }
  }
  return null;
}

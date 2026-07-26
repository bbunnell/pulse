/**
 * Creates recurring schedule rules from the imported shift patterns
 * and generates 24 months of shifts for each rule.
 *
 * Usage:
 *   DATABASE_URL=$(grep '^DATABASE_URL=' .env.local | cut -d= -f2-) \
 *   npx tsx --tsconfig tsconfig.json scripts/seed-schedule-rules.ts
 */

import { query } from "@/lib/db";
import { generateShiftsForRule } from "@/lib/schedule-engine";
import { insertGeneratedShifts } from "@/lib/db-store";
import { mapScheduleRule } from "@/lib/supabase/mappers";

const GENERATE_WEEKS = 104; // 24 months
const EFFECTIVE_FROM = "2026-07-26";

// Derived from the imported shift patterns in scheduled_shifts.
// days_of_week: 0=Sun, 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri, 6=Sat
const RULES = [
  {
    profileId:    "1c7d54ec-8254-49a0-a2bf-711cb6af8787",
    daysOfWeek:   [1, 2, 3, 4, 5],
    startTime:    "06:00",
    endTime:      "17:00",
    label:        "Day",
    repeatWeeks:  1,
  },
  {
    profileId:    "4ae7e71a-3768-4c82-93d4-576522b307c0",
    daysOfWeek:   [0, 5, 6],
    startTime:    "10:00",
    endTime:      "19:00",
    label:        "Day",
    repeatWeeks:  1,
  },
  {
    profileId:    "4ae7e71a-3768-4c82-93d4-576522b307c0",
    daysOfWeek:   [3, 4],
    startTime:    "12:00",
    endTime:      "21:00",
    label:        "Day",
    repeatWeeks:  1,
  },
  {
    profileId:    "74682969-22bd-4225-b010-cc21ef4db8c5",
    daysOfWeek:   [0, 1, 2, 6],
    startTime:    "16:00",
    endTime:      "01:00",
    label:        "Evening",
    repeatWeeks:  1,
  },
  {
    profileId:    "74682969-22bd-4225-b010-cc21ef4db8c5",
    daysOfWeek:   [5],
    startTime:    "15:00",
    endTime:      "01:00",
    label:        "Evening",
    repeatWeeks:  1,
  },
  {
    profileId:    "aa8cbf70-d9cc-4ce8-b428-0bc680e73a81",
    daysOfWeek:   [0, 1, 2, 3, 4],
    startTime:    "21:00",
    endTime:      "06:00",
    label:        "Overnight",
    repeatWeeks:  1,
  },
  {
    profileId:    "ca4c5d44-6c72-433d-9c8e-06585add206c",
    daysOfWeek:   [0, 1, 2, 5, 6],
    startTime:    "01:00",
    endTime:      "10:00",
    label:        "Overnight",
    repeatWeeks:  1,
  },
];

async function main() {
  const from = new Date(EFFECTIVE_FROM + "T00:00:00");
  const to   = new Date(from);
  to.setDate(to.getDate() + GENERATE_WEEKS * 7);

  console.log(`Creating ${RULES.length} rules, generating shifts ${EFFECTIVE_FROM} → ${to.toISOString().slice(0, 10)}\n`);

  for (const r of RULES) {
    const res = await query(
      `INSERT INTO schedule_rules
         (profile_id, start_time, end_time, label, days_of_week, repeat_weeks, effective_from, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NULL)
       RETURNING *`,
      [r.profileId, r.startTime, r.endTime, r.label, r.daysOfWeek, r.repeatWeeks, EFFECTIVE_FROM],
    );

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rule = mapScheduleRule(res.rows[0] as any);
    const shifts = generateShiftsForRule(rule, from, to, null);
    const inserted = await insertGeneratedShifts(shifts);

    console.log(`  ✓ ${r.label} [${r.daysOfWeek.join(",")}] ${r.startTime}–${r.endTime} → ${inserted} shifts inserted`);
  }

  console.log("\nDone.");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

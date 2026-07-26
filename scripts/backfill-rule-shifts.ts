/**
 * Backfill schedule rule shifts for 24 months.
 *
 * Deletes all future generated shifts for every rule (from today onward) and
 * re-inserts them covering the next 104 weeks (~24 months).
 *
 * Usage:
 *   npx tsx --tsconfig tsconfig.json scripts/backfill-rule-shifts.ts
 */

import { query } from "@/lib/db";
import { mapScheduleRule } from "@/lib/supabase/mappers";
import { generateShiftsForRule, isoDateStr } from "@/lib/schedule-engine";
import { insertGeneratedShifts } from "@/lib/db-store";

const GENERATE_WEEKS = 104;

async function main() {
  const today = isoDateStr(new Date());

  const rulesResult = await query(
    "SELECT * FROM schedule_rules ORDER BY effective_from, profile_id",
  );
  const rules = rulesResult.rows.map((r) => mapScheduleRule(r as Record<string, unknown>));

  console.log(`Found ${rules.length} rule(s). Backfilling from ${today} for ${GENERATE_WEEKS} weeks...`);

  const from = new Date(today + "T00:00:00");
  const to   = new Date(from);
  to.setDate(to.getDate() + GENERATE_WEEKS * 7);

  let totalDeleted = 0;
  let totalInserted = 0;

  for (const rule of rules) {
    const del = await query(
      "DELETE FROM scheduled_shifts WHERE rule_id = $1 AND shift_date >= $2",
      [rule.id, today],
    );
    const deleted = del.rowCount ?? 0;
    totalDeleted += deleted;

    const shifts = generateShiftsForRule(rule, from, to, null);
    const inserted = await insertGeneratedShifts(shifts);
    totalInserted += inserted;

    console.log(`  rule ${rule.id} (${rule.profileId}): deleted ${deleted}, inserted ${inserted}`);
  }

  console.log(`\nDone. Deleted ${totalDeleted} old shifts, inserted ${totalInserted} new shifts.`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

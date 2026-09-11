import { cookies } from "next/headers";
import { TeamDashboard } from "@/components/TeamDashboard";
import { SeasonalCanvas } from "@/components/SeasonalCanvas";
import { getCurrentUserProfile, loadOrgData } from "@/lib/data";
import { getNotificationSettings, getStaffingRules } from "@/lib/db-store";
import { localDateInZone } from "@/lib/timezone";

export const dynamic = "force-dynamic";

export default async function HomePage({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [data, currentUser] = await Promise.all([
    loadOrgData(),
    getCurrentUserProfile(),
  ]);

  let orgTimezone = "America/Chicago";
  let staffingRules: Awaited<ReturnType<typeof getStaffingRules>> = [];
  try {
    [orgTimezone, staffingRules] = await Promise.all([
      getNotificationSettings().then((s) => s.orgTimezone),
      getStaffingRules(),
    ]);
  } catch { /* defaults */ }

  // Resolved server-side, in the ORG's zone, so the whole team sees the same
  // decoration on the same day and nothing depends on a device clock.
  const todayIso = localDateInZone(orgTimezone);
  const dismissedId = (await cookies()).get("pulse_seasonal_off")?.value;
  // ?fx=halloween previews any effect on any day. Otherwise nobody sees one
  // until the date arrives — a poor moment to discover the pumpkins are wrong.
  const fx = (await searchParams).fx;
  const preview = typeof fx === "string" ? fx : undefined;

  return (
    <>
      <TeamDashboard
        data={data}
        staffingRules={staffingRules}
        currentUserId={currentUser?.id}
        userRole={currentUser?.role ?? null}
        orgTimezone={orgTimezone}
      />
      {/* Sibling of the board, not a child: the dashboard re-renders every
          second on its own, and the decoration must not be dragged into that.
          Its animation lives in refs and one rAF loop, so it renders once. */}
      <SeasonalCanvas todayIso={todayIso} dismissedId={dismissedId} preview={preview} />
    </>
  );
}

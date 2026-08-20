import { getCurrentUserProfile, loadOrgData} from "@/lib/data";
import { getNotificationSettings, getStaffingRules } from "@/lib/db-store";
import { MonitorView } from "@/components/MonitorView";

export const dynamic = "force-dynamic";

export default async function MonitorPage() {
  const currentUser = await getCurrentUserProfile();
  if (!currentUser) {
    return (
      <div style={{ fontFamily: "sans-serif", padding: 32, textAlign: "center", color: "#334155" }}>
        <p style={{ fontWeight: 600, marginBottom: 8 }}>Session expired</p>
        <p style={{ fontSize: 13, color: "#64748b", lineHeight: 1.5 }}>
          Sign in to Team Pulse, then re-open the monitor from the dashboard.
        </p>
        <a href="/login" style={{ display: "inline-block", marginTop: 16, fontSize: 13, color: "#1d4ed8" }}>
          Go to sign-in →
        </a>
      </div>
    );
  }

  const data = await loadOrgData();

  let orgTimezone = "America/Los_Angeles";
  let staffingRules: Awaited<ReturnType<typeof getStaffingRules>> = [];
  try {
    [orgTimezone, staffingRules] = await Promise.all([
      getNotificationSettings().then((s) => s.orgTimezone),
      getStaffingRules(),
    ]);
  } catch { /* defaults */ }

  return (
    <MonitorView
      data={data}
      staffingRules={staffingRules}
      orgTimezone={orgTimezone}
      currentUserId={currentUser.id}
    />
  );
}

import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getCurrentUserProfile } from "@/lib/data";
import { getAuditLogs } from "@/lib/db-store";

export const dynamic = "force-dynamic";

const ACTION_TONE: Record<string, string> = {
  create: "green", update: "blue", delete: "red",
  reassign: "blue", force_punch_in: "amber", force_punch_out: "amber",
};

function fmt(iso: string) {
  return new Date(iso).toLocaleString("en-US", {
    month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
  });
}

export default async function AuditPage() {
  const currentUser = await getCurrentUserProfile();
  if (currentUser?.role !== "admin") redirect("/");

  let logs: Awaited<ReturnType<typeof getAuditLogs>> = [];
  try {
    logs = await getAuditLogs(200);
  } catch {
    logs = [];
  }

  return (
    <section className="page-shell">
      <header className="page-header">
        <div>
          <p className="eyebrow">Admin controls</p>
          <h1>Audit Log</h1>
        </div>
        <Link href="/admin" className="button secondary">
          <ArrowLeft size={14} /> Back to Settings
        </Link>
      </header>

      <div className="page-content">
        <div className="panel" style={{ padding: 0, overflow: "hidden" }}>
          {logs.length === 0 ? (
            <p className="dash-empty" style={{ padding: 24 }}>No audit entries recorded yet.</p>
          ) : (
            <table className="audit-table">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Actor</th>
                  <th>Action</th>
                  <th>Details</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log.id}>
                    <td className="audit-when" suppressHydrationWarning>{fmt(log.createdAt)}</td>
                    <td>{log.actorName ?? "System"}</td>
                    <td>
                      <span className={`status-badge ${ACTION_TONE[log.action] ?? "gray"}`} style={{ fontSize: 11 }}>
                        {log.entityType}.{log.action}
                      </span>
                    </td>
                    <td className="audit-summary">{log.summary ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </section>
  );
}

"use client";
// Microsoft redirects here after OAuth (Teams popup flow only).
// Reads the one-time token from the URL and passes it back to the Teams
// iframe via notifySuccess() so the iframe can exchange it for a session cookie.
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

function TeamsAuthEndInner() {
  const searchParams = useSearchParams();
  const [errMsg, setErrMsg] = useState<string | null>(null);

  useEffect(() => {
    async function finish() {
      const token    = searchParams.get("token");
      const ssoError = searchParams.get("sso_error");

      const { app, authentication } = await import("@microsoft/teams-js");

      // SDK v2 requires initialization even in the popup context before
      // notifySuccess / notifyFailure will work.
      try { await app.initialize(); } catch { /* ignore — may be called twice or in non-Teams context */ }

      if (ssoError || !token) {
        authentication.notifyFailure(ssoError ?? "no_token");
      } else {
        authentication.notifySuccess(token);
      }
    }

    finish().catch((err: unknown) => {
      // Surface errors instead of silently swallowing them so the popup
      // doesn't get stuck showing "Completing sign-in…" with no explanation.
      const msg = err instanceof Error ? err.message : String(err);
      setErrMsg(msg);
    });
  }, [searchParams]);

  if (errMsg) {
    return (
      <div style={{ fontFamily: "sans-serif", padding: 24 }}>
        <p style={{ color: "#b91c1c", marginBottom: 12 }}>Sign-in could not be completed.</p>
        <p style={{ color: "#6b7280", fontSize: 13, marginBottom: 16 }}>{errMsg}</p>
        <a href="/login" style={{ color: "#1d4ed8" }}>Return to sign-in</a>
      </div>
    );
  }

  return <p style={{ fontFamily: "sans-serif", padding: 24 }}>Completing sign-in…</p>;
}

export default function TeamsAuthEnd() {
  return (
    <Suspense fallback={<p style={{ fontFamily: "sans-serif", padding: 24 }}>Completing sign-in…</p>}>
      <TeamsAuthEndInner />
    </Suspense>
  );
}

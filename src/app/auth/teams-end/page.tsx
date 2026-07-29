"use client";
// Microsoft redirects here after OAuth (Teams popup flow only).
// Reads the one-time token from the URL and passes it back to the Teams
// iframe via notifySuccess() so the iframe can exchange it for a session cookie.
import { useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

function TeamsAuthEndInner() {
  const searchParams = useSearchParams();

  useEffect(() => {
    async function finish() {
      const token    = searchParams.get("token");
      const ssoError = searchParams.get("sso_error");

      const { authentication } = await import("@microsoft/teams-js");

      if (ssoError || !token) {
        authentication.notifyFailure(ssoError ?? "no_token");
      } else {
        // Pass the one-time token back — the login page will POST it to
        // /api/auth/teams-token to set the session cookie in the iframe context.
        authentication.notifySuccess(token);
      }
    }
    finish().catch(() => {});
  }, [searchParams]);

  return <p style={{ fontFamily: "sans-serif", padding: 24 }}>Completing sign-in…</p>;
}

export default function TeamsAuthEnd() {
  return (
    <Suspense fallback={<p style={{ fontFamily: "sans-serif", padding: 24 }}>Completing sign-in…</p>}>
      <TeamsAuthEndInner />
    </Suspense>
  );
}

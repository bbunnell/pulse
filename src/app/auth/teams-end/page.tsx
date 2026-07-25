"use client";
// Microsoft redirects here after OAuth. Notifies the Teams popup opener of success/failure.
import { useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

function TeamsAuthEndInner() {
  const searchParams = useSearchParams();

  useEffect(() => {
    async function finish() {
      const ssoError = searchParams.get("sso_error");

      // Dynamically import Teams SDK (client only)
      const { authentication } = await import("@microsoft/teams-js");

      if (ssoError) {
        authentication.notifyFailure(ssoError);
      } else {
        authentication.notifySuccess("ok");
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

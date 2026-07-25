"use client";
// Opened by Teams SDK as a popup. Immediately redirects to the Microsoft OAuth flow.
import { useEffect } from "react";

export default function TeamsAuthStart() {
  useEffect(() => {
    window.location.href = "/api/auth/microsoft?teams=1";
  }, []);
  return <p style={{ fontFamily: "sans-serif", padding: 24 }}>Redirecting to Microsoft…</p>;
}

"use client";

import { Suspense, useEffect, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { LogIn, Mail, KeyRound, CheckCircle } from "lucide-react";

type View = "login" | "forgot" | "sent" | "setup" | "done";

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="login-overlay"><div className="login-card" /></div>}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  const [view, setView] = useState<View>(token ? "setup" : "login");
  const [setupFirstName, setSetupFirstName] = useState("");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  /** True only in the browser after hydration — avoids mismatches when password extensions inject into inputs. */
  const formsReady = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

  // Validate the token and get the user's first name for the greeting
  useEffect(() => {
    if (!token) return;
    setLoading(false); // reset any loading state carried over from the login form
    fetch(`/api/auth/reset-password?token=${token}`)
      .then((r) => r.json().catch(() => ({})))
      .then((data: { valid: boolean; firstName?: string }) => {
        if (!data.valid) {
          setError("This link has expired or already been used. Please request a new one.");
          setView("login");
        } else {
          setSetupFirstName(data.firstName ?? "");
          setView("setup");
        }
      });
  }, [token]);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });

    const json = (await res.json().catch(() => ({}))) as {
      error?: string;
      mustSetPassword?: boolean;
      token?: string;
      ok?: boolean;
    };

    if (!res.ok) {
      setError(json.error ?? `Login failed (${res.status}).`);
      setLoading(false);
      return;
    }

    if (json.mustSetPassword && json.token) {
      // Redirect to setup flow with token in URL
      router.replace(`/login?token=${json.token}`);
      return;
    }

    router.push("/");
    router.refresh();
  }

  async function handleForgot(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    await fetch("/api/auth/forgot-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });

    setLoading(false);
    setView("sent");
  }

  async function handleSetup(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (newPassword !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    if (newPassword.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    setLoading(true);

    const res = await fetch("/api/auth/reset-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, password: newPassword }),
    });

    const json = (await res.json().catch(() => ({}))) as { error?: string; ok?: boolean };
    setLoading(false);

    if (!res.ok) {
      setError(json.error ?? "Failed to set password.");
      return;
    }

    setView("done");
  }

  return (
    <div className="login-overlay">
      <div className="login-card">

        {/* ── Brand header ── */}
        <div className="login-logo">
          <img src="/team-pulse-logo-light.png" alt="Team Pulse" className="login-logo-svg" />
          <p className="subtle" style={{ marginTop: 8, textAlign: "center" }}>
            {view === "login"  && "Sign in to your account"}
            {view === "forgot" && "Reset your password"}
            {view === "sent"   && "Check your email"}
            {view === "setup"  && (setupFirstName ? `Welcome, ${setupFirstName}!` : "Set your password")}
            {view === "done"   && "Password set!"}
          </p>
        </div>

        {!formsReady ? (
          <div className="login-fields" style={{ minHeight: 280 }} aria-busy="true">
            <p className="subtle" style={{ textAlign: "center", paddingTop: 48 }}>
              Loading…
            </p>
          </div>
        ) : (
          <>
        {/* ── Sign In ── */}
        {view === "login" && (
          <form className="login-fields" onSubmit={handleLogin}>
            <div className="control">
              <label htmlFor="email">Email address</label>
              <input
                className="input"
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="control">
              <label htmlFor="password">
                Password
                <button
                  type="button"
                  className="login-forgot-link"
                  onClick={() => { setError(""); setView("forgot"); }}
                >
                  Forgot password?
                </button>
              </label>
              <input
                className="input"
                id="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            {error && <p className="error-line">{error}</p>}
            <button className="button primary" type="submit" disabled={loading} style={{ marginTop: 4 }}>
              <LogIn size={15} aria-hidden="true" />
              {loading ? "Signing in…" : "Sign In"}
            </button>
          </form>
        )}

        {/* ── Forgot password ── */}
        {view === "forgot" && (
          <form className="login-fields" onSubmit={handleForgot}>
            <p className="subtle" style={{ marginBottom: 4 }}>
              Enter your email address and we&apos;ll send you a link to set or reset your password.
            </p>
            <div className="control">
              <label htmlFor="forgot-email">Email address</label>
              <input
                className="input"
                id="forgot-email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            {error && <p className="error-line">{error}</p>}
            <button className="button primary" type="submit" disabled={loading} style={{ marginTop: 4 }}>
              <Mail size={15} aria-hidden="true" />
              {loading ? "Sending…" : "Send Reset Link"}
            </button>
            <button
              type="button"
              className="button secondary"
              onClick={() => { setError(""); setView("login"); }}
            >
              Back to sign in
            </button>
          </form>
        )}

        {/* ── Email sent ── */}
        {view === "sent" && (
          <div className="login-fields">
            <div className="login-sent-icon">
              <CheckCircle size={36} style={{ color: "var(--green)" }} />
            </div>
            <p style={{ textAlign: "center", color: "var(--ink-2)", lineHeight: 1.5 }}>
              If <strong>{email}</strong> is in our system, you&apos;ll receive an email with a link to set your password. Check your spam folder if it doesn&apos;t arrive within a few minutes.
            </p>
            <button
              type="button"
              className="button secondary"
              style={{ marginTop: 8 }}
              onClick={() => { setError(""); setView("login"); }}
            >
              Back to sign in
            </button>
          </div>
        )}

        {/* ── Set / reset password ── */}
        {view === "setup" && (
          <form className="login-fields" onSubmit={handleSetup}>
            {setupFirstName && (
              <p className="subtle" style={{ marginBottom: 4 }}>
                Please choose a password for your account.
              </p>
            )}
            <div className="control">
              <label htmlFor="new-password">New password</label>
              <input
                className="input"
                id="new-password"
                type="password"
                autoComplete="new-password"
                required
                minLength={8}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
            </div>
            <div className="control">
              <label htmlFor="confirm-password">Confirm password</label>
              <input
                className="input"
                id="confirm-password"
                type="password"
                autoComplete="new-password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
            </div>
            {error && <p className="error-line">{error}</p>}
            <button className="button primary" type="submit" disabled={loading} style={{ marginTop: 4 }}>
              <KeyRound size={15} aria-hidden="true" />
              {loading ? "Saving…" : "Set Password"}
            </button>
          </form>
        )}

        {/* ── Done ── */}
        {view === "done" && (
          <div className="login-fields">
            <div className="login-sent-icon">
              <CheckCircle size={36} style={{ color: "var(--green)" }} />
            </div>
            <p style={{ textAlign: "center", color: "var(--ink-2)", lineHeight: 1.5 }}>
              Your password has been set. You&apos;re now signed in.
            </p>
            <button
              type="button"
              className="button primary"
              style={{ marginTop: 8 }}
              onClick={() => { router.push("/"); router.refresh(); }}
            >
              <LogIn size={15} aria-hidden="true" />
              Go to Dashboard
            </button>
          </div>
        )}
          </>
        )}

      </div>
    </div>
  );
}

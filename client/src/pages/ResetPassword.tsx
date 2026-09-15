/**
 * pages/ResetPassword.tsx
 *
 * Step 2 of password recovery — user lands here via the email link.
 * Reads ?token=<rawToken> from the URL and calls POST /api/auth/reset-password.
 */
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Link, useSearch } from "wouter";
import { ArrowLeft, CheckCircle2, KeyRound, Lock, ShieldCheck } from "lucide-react";

const schema = z
  .object({
    password: z
      .string()
      .min(8, "At least 8 characters")
      .regex(/[A-Z]/, "Include at least one uppercase letter")
      .regex(/[0-9]/, "Include at least one number")
      .regex(/[^A-Za-z0-9]/, "Include at least one special character"),
    confirmPassword: z.string().min(1, "Please confirm your password"),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

type FormValues = z.infer<typeof schema>;

/* ── Password strength meter ──────────────────────────────────── */
function PasswordStrength({ password }: { password: string }) {
  const checks = [
    password.length >= 8,
    /[A-Z]/.test(password),
    /[0-9]/.test(password),
    /[^A-Za-z0-9]/.test(password),
  ];
  const score = checks.filter(Boolean).length;
  const labels = ["", "Weak", "Fair", "Good", "Strong"];
  const colors = ["", "#ef705e", "#f4a66d", "#2d73db", "#29a878"];
  if (!password) return null;
  return (
    <div className="pw-strength">
      <div className="pw-strength-bars">
        {[1, 2, 3, 4].map((n) => (
          <div key={n} className="pw-strength-bar"
            style={{ background: n <= score ? colors[score] : "#e6ecf3" }} />
        ))}
      </div>
      <span className="pw-strength-label" style={{ color: colors[score] }}>
        {labels[score]}
      </span>
    </div>
  );
}

export default function ResetPassword() {
  const search = useSearch();
  const params = new URLSearchParams(search);
  const token = params.get("token") ?? "";

  const [serverError, setServerError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [showPw, setShowPw] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  const passwordWatch = watch("password") ?? "";

  // Missing token — show a friendly error immediately
  if (!token) {
    return (
      <div className="auth-shell">
        <div className="auth-bg-blob auth-bg-blob--1" aria-hidden="true" />
        <div className="auth-bg-blob auth-bg-blob--2" aria-hidden="true" />
        <header className="auth-header">
          <div className="auth-brand">
            <div className="brand-mark"><span>N</span></div>
            <div>
              <div className="brand-name">Nexus<span>Pay</span></div>
              <div className="brand-caption">Banking &amp; FinTech Platform</div>
            </div>
          </div>
        </header>
        <main className="auth-main">
          <div className="auth-card">
            <div className="rp-invalid">
              <div className="rp-invalid-icon"><Lock size={28} /></div>
              <h1 className="auth-title" style={{ marginTop: "16px" }}>Invalid reset link</h1>
              <p className="fp-subtitle">
                This password reset link is missing its token. Please request a new one.
              </p>
              <Link href="/forgot-password" className="auth-submit" style={{ marginTop: "24px", textDecoration: "none", display: "flex", justifyContent: "center" }}>
                Request a New Link
              </Link>
            </div>
          </div>
        </main>
      </div>
    );
  }

  const onSubmit = async (data: FormValues) => {
    setServerError(null);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password: data.password }),
      });
      const json = await res.json() as { message?: string; error?: string };
      if (!res.ok) {
        setServerError(json.error ?? "Something went wrong. Please try again.");
        return;
      }
      setSuccess(true);
    } catch {
      setServerError("Network error — please check your connection and try again.");
    }
  };

  return (
    <div className="auth-shell">
      <div className="auth-bg-blob auth-bg-blob--1" aria-hidden="true" />
      <div className="auth-bg-blob auth-bg-blob--2" aria-hidden="true" />

      <header className="auth-header">
        <div className="auth-brand">
          <div className="brand-mark"><span>N</span></div>
          <div>
            <div className="brand-name">Nexus<span>Pay</span></div>
            <div className="brand-caption">Banking &amp; FinTech Platform</div>
          </div>
        </div>
      </header>

      <main className="auth-main">
        <div className="auth-card">
          {!success ? (
            <>
              <div className="fp-icon-wrap">
                <div className="fp-icon" style={{ background: "#eaf2ff", color: "#2d73db" }}>
                  <ShieldCheck size={28} />
                </div>
              </div>

              <h1 className="auth-title" style={{ marginTop: "16px" }}>
                Choose a new password
              </h1>
              <p className="fp-subtitle">
                Your new password must be different from any previously used passwords.
              </p>

              {serverError && (
                <div className="auth-error-banner" role="alert">
                  <Lock size={13} />
                  <span>{serverError}</span>
                </div>
              )}

              <form onSubmit={handleSubmit(onSubmit)} noValidate>
                {/* New password */}
                <div className="auth-field">
                  <label htmlFor="rp-password" className="auth-label">New Password</label>
                  <div className={`auth-input-wrap${errors.password ? " auth-input-wrap--error" : ""}`}>
                    <Lock size={14} className="auth-input-icon" aria-hidden="true" />
                    <input
                      id="rp-password"
                      type={showPw ? "text" : "password"}
                      autoComplete="new-password"
                      autoFocus
                      className="auth-input"
                      aria-invalid={!!errors.password}
                      {...register("password")}
                    />
                    <button type="button" className="auth-toggle-pw"
                      aria-label={showPw ? "Hide" : "Show"}
                      onClick={() => setShowPw((v) => !v)}>
                      {showPw ? <KeyRound size={15} /> : <Lock size={15} />}
                    </button>
                  </div>
                  <PasswordStrength password={passwordWatch} />
                  {errors.password && (
                    <p className="auth-field-error">{errors.password.message}</p>
                  )}
                </div>

                {/* Confirm password */}
                <div className="auth-field">
                  <label htmlFor="rp-confirm" className="auth-label">Confirm New Password</label>
                  <div className={`auth-input-wrap${errors.confirmPassword ? " auth-input-wrap--error" : ""}`}>
                    <Lock size={14} className="auth-input-icon" aria-hidden="true" />
                    <input
                      id="rp-confirm"
                      type={showConfirm ? "text" : "password"}
                      autoComplete="new-password"
                      className="auth-input"
                      aria-invalid={!!errors.confirmPassword}
                      {...register("confirmPassword")}
                    />
                    <button type="button" className="auth-toggle-pw"
                      aria-label={showConfirm ? "Hide" : "Show"}
                      onClick={() => setShowConfirm((v) => !v)}>
                      {showConfirm ? <KeyRound size={15} /> : <Lock size={15} />}
                    </button>
                  </div>
                  {errors.confirmPassword && (
                    <p className="auth-field-error">{errors.confirmPassword.message}</p>
                  )}
                </div>

                {/* Password rules */}
                <ul className="pw-rules" style={{ marginBottom: "20px" }}>
                  {([
                    ["8+ characters", passwordWatch.length >= 8],
                    ["One uppercase letter", /[A-Z]/.test(passwordWatch)],
                    ["One number", /[0-9]/.test(passwordWatch)],
                    ["One special character", /[^A-Za-z0-9]/.test(passwordWatch)],
                  ] as [string, boolean][]).map(([label, met]) => (
                    <li key={label} className={met ? "pw-rule pw-rule--met" : "pw-rule"}>
                      <CheckCircle2 size={11} />
                      {label}
                    </li>
                  ))}
                </ul>

                <button type="submit" className="auth-submit"
                  disabled={isSubmitting} aria-busy={isSubmitting}>
                  {isSubmitting
                    ? <span className="auth-spinner" aria-label="Updating…" />
                    : "Update Password"}
                </button>
              </form>

              <div className="auth-links" style={{ marginTop: "18px" }}>
                <Link href="/login" className="auth-link fp-back-link">
                  <ArrowLeft size={13} /> Back to Sign In
                </Link>
              </div>
            </>
          ) : (
            /* ── Success ── */
            <div className="signup-success">
              <div className="signup-success-icon">
                <CheckCircle2 size={38} />
              </div>
              <h1 className="auth-title" style={{ marginTop: "18px" }}>
                Password updated!
              </h1>
              <p className="signup-success-msg">
                Your password has been changed successfully. You can now sign
                in with your new password.
              </p>
              <Link href="/login" className="auth-submit"
                style={{ marginTop: "28px", textDecoration: "none", display: "flex", justifyContent: "center" }}>
                Go to Sign In
              </Link>
            </div>
          )}
        </div>
      </main>

      <footer className="auth-page-footer">
        <span>© {new Date().getFullYear()} NexusPay. All rights reserved.</span>
        <span className="auth-footer-links">
          <a href="#" className="auth-footer-link">Privacy Policy</a>
          <a href="#" className="auth-footer-link">Terms of Service</a>
          <a href="#" className="auth-footer-link">Security</a>
        </span>
      </footer>
    </div>
  );
}

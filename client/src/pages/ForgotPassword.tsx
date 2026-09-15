/**
 * pages/ForgotPassword.tsx
 *
 * Step 1 of password recovery — user enters their email.
 * Calls POST /api/auth/forgot-password and shows a confirmation screen.
 */
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Link } from "wouter";
import { ArrowLeft, Mail, Send } from "lucide-react";

const schema = z.object({
  email: z.string().email("Enter a valid email address"),
});
type FormValues = z.infer<typeof schema>;

export default function ForgotPassword() {
  const [sent, setSent] = useState(false);
  const [submittedEmail, setSubmittedEmail] = useState("");
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  const onSubmit = async (data: FormValues) => {
    setServerError(null);
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: data.email }),
      });
      const json = await res.json() as { message?: string; error?: string };
      if (!res.ok) {
        setServerError(json.error ?? "Something went wrong. Please try again.");
        return;
      }
      setSubmittedEmail(data.email);
      setSent(true);
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
          {!sent ? (
            <>
              {/* Icon */}
              <div className="fp-icon-wrap">
                <div className="fp-icon">
                  <Mail size={28} />
                </div>
              </div>

              <h1 className="auth-title" style={{ marginTop: "16px" }}>
                Forgot your password?
              </h1>
              <p className="fp-subtitle">
                Enter the email address linked to your account and we'll send
                you a secure reset link.
              </p>

              {serverError && (
                <div className="auth-error-banner" role="alert">
                  <span>{serverError}</span>
                </div>
              )}

              <form onSubmit={handleSubmit(onSubmit)} noValidate>
                <div className="auth-field">
                  <label htmlFor="fp-email" className="auth-label">
                    Email Address
                  </label>
                  <div
                    className={`auth-input-wrap${errors.email ? " auth-input-wrap--error" : ""}`}
                  >
                    <Mail size={14} className="auth-input-icon" aria-hidden="true" />
                    <input
                      id="fp-email"
                      type="email"
                      autoComplete="email"
                      autoFocus
                      className="auth-input"
                      placeholder="you@example.com"
                      aria-invalid={!!errors.email}
                      {...register("email")}
                    />
                  </div>
                  {errors.email && (
                    <p className="auth-field-error">{errors.email.message}</p>
                  )}
                </div>

                <button
                  type="submit"
                  className="auth-submit"
                  style={{ gap: "8px", marginTop: "4px" }}
                  disabled={isSubmitting}
                  aria-busy={isSubmitting}
                >
                  {isSubmitting ? (
                    <span className="auth-spinner" aria-label="Sending…" />
                  ) : (
                    <>
                      <Send size={15} />
                      Send Reset Link
                    </>
                  )}
                </button>
              </form>

              <div className="auth-links" style={{ marginTop: "20px" }}>
                <Link href="/login" className="auth-link fp-back-link">
                  <ArrowLeft size={13} />
                  Back to Sign In
                </Link>
              </div>
            </>
          ) : (
            /* ── Confirmation screen ── */
            <div className="fp-sent">
              <div className="fp-sent-icon">
                <Send size={30} />
              </div>
              <h1 className="auth-title" style={{ marginTop: "18px" }}>
                Check your inbox
              </h1>
              <p className="fp-subtitle">
                We sent a password reset link to{" "}
                <strong className="fp-email-highlight">{submittedEmail}</strong>.
                It expires in <strong>1 hour</strong>.
              </p>

              <div className="fp-tips">
                <p>Didn't receive it?</p>
                <ul>
                  <li>Check your spam or junk folder.</li>
                  <li>Make sure the email address is correct.</li>
                  <li>
                    <button
                      type="button"
                      className="auth-link"
                      onClick={() => setSent(false)}
                    >
                      Try a different address
                    </button>
                  </li>
                </ul>
              </div>

              <Link href="/login" className="auth-link fp-back-link" style={{ marginTop: "24px", display: "inline-flex" }}>
                <ArrowLeft size={13} />
                Back to Sign In
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

import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Link, useLocation } from "wouter";
import { Eye, EyeOff, Fingerprint, Lock, ScanFace, User } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

const schema = z.object({
  username: z.string().min(1, "Username is required"),
  password: z.string().min(1, "Password is required"),
  remember: z.boolean().optional(),
});
type FormValues = z.infer<typeof schema>;

export default function Login() {
  const { login, error, clearError, isLoading } = useAuth();
  const [, navigate] = useLocation();
  const [showPw, setShowPw] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const firstInputRef = useRef<HTMLInputElement | null>(null);

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { remember: false },
  });

  useEffect(() => {
    const saved = localStorage.getItem("banking_remember");
    if (saved) setValue("username", saved);
    firstInputRef.current?.focus();
  }, [setValue]);

  const onSubmit = async (data: FormValues) => {
    setSubmitting(true);
    try {
      await login(data.username, data.password, data.remember ?? false);
      navigate("/");
    } catch {
      // error surfaced via AuthContext
    } finally {
      setSubmitting(false);
    }
  };

  const busy = submitting || isLoading;

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
          <h1 className="auth-title">Sign In</h1>

          {error && (
            <div className="auth-error-banner" role="alert">
              <Lock size={13} />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit(onSubmit)} noValidate>
            {/* Username */}
            <div className="auth-field">
              <label htmlFor="login-username" className="auth-label">Username</label>
              <div className={`auth-input-wrap${errors.username ? " auth-input-wrap--error" : ""}`}>
                <User size={14} className="auth-input-icon" aria-hidden="true" />
                <input
                  id="login-username"
                  type="text"
                  autoComplete="username"
                  autoCapitalize="none"
                  spellCheck={false}
                  className="auth-input"
                  aria-invalid={!!errors.username}
                  aria-describedby={errors.username ? "login-username-err" : undefined}
                  {...register("username", { onChange: () => error && clearError() })}
                  ref={(el) => {
                    register("username").ref(el);
                    firstInputRef.current = el;
                  }}
                />
              </div>
              {errors.username && (
                <p id="login-username-err" className="auth-field-error">{errors.username.message}</p>
              )}
            </div>

            {/* Password */}
            <div className="auth-field">
              <label htmlFor="login-password" className="auth-label">Password</label>
              <div className={`auth-input-wrap${errors.password ? " auth-input-wrap--error" : ""}`}>
                <Lock size={14} className="auth-input-icon" aria-hidden="true" />
                <input
                  id="login-password"
                  type={showPw ? "text" : "password"}
                  autoComplete="current-password"
                  className="auth-input"
                  aria-invalid={!!errors.password}
                  aria-describedby={errors.password ? "login-password-err" : undefined}
                  {...register("password", { onChange: () => error && clearError() })}
                />
                <button
                  type="button"
                  className="auth-toggle-pw"
                  aria-label={showPw ? "Hide password" : "Show password"}
                  onClick={() => setShowPw((v) => !v)}
                >
                  {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
              {errors.password && (
                <p id="login-password-err" className="auth-field-error">{errors.password.message}</p>
              )}
            </div>

            {/* Remember me */}
            <div className="auth-remember">
              <label className="auth-checkbox-label">
                <input type="checkbox" className="auth-checkbox" {...register("remember")} />
                <span className="auth-checkbox-custom" aria-hidden="true" />
                Remember Me
              </label>
            </div>

            <button type="submit" className="auth-submit" disabled={busy} aria-busy={busy}>
              {busy ? <span className="auth-spinner" aria-label="Signing in…" /> : "Sign in"}
            </button>
          </form>

          {/* Passkey section */}
          <div className="passkey-card">
            <div className="passkey-icons">
              <ScanFace size={26} className="passkey-icon-face" />
              <Fingerprint size={26} className="passkey-icon-fp" />
            </div>
            <div className="passkey-copy">
              <strong>Go passwordless with a passkey</strong>
              <p>
                No more having to remember a password. Use a passkey to{" "}
                <span>sign in</span> using your face or fingerprint.
              </p>
              <button
                type="button"
                className="passkey-link"
                onClick={() => alert("Passkey registration — WebAuthn integration coming soon.")}
              >
                Create a passkey
              </button>
            </div>
          </div>

          <div className="auth-links">
            <Link href="/forgot-password" className="auth-link">
              Forgot Username or Password?
            </Link>
            <Link href="/signup" className="auth-link">
              Set Up Online Access
            </Link>
          </div>
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


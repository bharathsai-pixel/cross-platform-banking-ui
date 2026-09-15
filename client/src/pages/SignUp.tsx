import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Link, useLocation } from "wouter";
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  CreditCard,
  Eye,
  EyeOff,
  Lock,
  Mail,
  User,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

/* ── Validation schemas ─────────────────────────────────────── */
const step1Schema = z.object({
  lastName: z.string().min(2, "Last name must be at least 2 characters"),
  accountNumber: z
    .string()
    .min(8, "Account number must be at least 8 digits")
    .max(20, "Account number too long")
    .regex(/^\d+$/, "Account number must contain digits only"),
  dateOfBirth: z
    .string()
    .min(1, "Date of birth is required")
    .regex(/^\d{2}\/\d{2}\/\d{4}$/, "Use MM/DD/YYYY format"),
});

const step2Schema = z.object({
  firstName: z.string().min(2, "First name must be at least 2 characters"),
  email: z.string().email("Enter a valid email address"),
  username: z
    .string()
    .min(4, "Username must be at least 4 characters")
    .max(30, "Username too long")
    .regex(/^[a-zA-Z0-9._-]+$/, "Only letters, numbers, . _ - allowed"),
});

const step3Schema = z
  .object({
    password: z
      .string()
      .min(8, "At least 8 characters")
      .regex(/[A-Z]/, "Must contain an uppercase letter")
      .regex(/[0-9]/, "Must contain a number")
      .regex(/[^A-Za-z0-9]/, "Must contain a special character"),
    confirmPassword: z.string().min(1, "Please confirm your password"),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

type Step1Values = z.infer<typeof step1Schema>;
type Step2Values = z.infer<typeof step2Schema>;
type Step3Values = z.infer<typeof step3Schema>;

/* ── Step indicator ─────────────────────────────────────────── */
function StepIndicator({ current, total }: { current: number; total: number }) {
  return (
    <div className="signup-steps" aria-label={`Step ${current} of ${total}`}>
      <div className="signup-step-track">
        <div
          className="signup-step-fill"
          style={{ width: `${((current - 1) / (total - 1)) * 100}%` }}
        />
      </div>
      {Array.from({ length: total }, (_, i) => (
        <div
          key={i}
          className={`signup-step-dot${
            i + 1 < current
              ? " signup-step-dot--done"
              : i + 1 === current
              ? " signup-step-dot--active"
              : ""
          }`}
        >
          {i + 1 < current && <CheckCircle2 size={12} />}
        </div>
      ))}
    </div>
  );
}

/* ── Password strength ──────────────────────────────────────── */
function PasswordStrength({ password }: { password: string }) {
  const score = [
    password.length >= 8,
    /[A-Z]/.test(password),
    /[0-9]/.test(password),
    /[^A-Za-z0-9]/.test(password),
  ].filter(Boolean).length;
  const labels = ["", "Weak", "Fair", "Good", "Strong"];
  const colors = ["", "#ef705e", "#f4a66d", "#2d73db", "#29a878"];
  if (!password) return null;
  return (
    <div className="pw-strength">
      <div className="pw-strength-bars">
        {[1, 2, 3, 4].map((n) => (
          <div
            key={n}
            className="pw-strength-bar"
            style={{ background: n <= score ? colors[score] : "#e6ecf3" }}
          />
        ))}
      </div>
      <span className="pw-strength-label" style={{ color: colors[score] }}>
        {labels[score]}
      </span>
    </div>
  );
}

/* ── Main component ─────────────────────────────────────────── */
export default function SignUp() {
  const { register: registerUser, error: authError, clearError } = useAuth();
  const [, navigate] = useLocation();
  const [step, setStep] = useState(1);
  const [collectedData, setCollectedData] = useState<
    Partial<Step1Values & Step2Values>
  >({});
  const [showPw, setShowPw] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  /* ── Step forms ── */
  const form1 = useForm<Step1Values>({
    resolver: zodResolver(step1Schema),
    defaultValues: { lastName: "", accountNumber: "", dateOfBirth: "" },
  });
  const form2 = useForm<Step2Values>({
    resolver: zodResolver(step2Schema),
    defaultValues: { firstName: "", email: "", username: "" },
  });
  const form3 = useForm<Step3Values>({
    resolver: zodResolver(step3Schema),
    defaultValues: { password: "", confirmPassword: "" },
  });

  const passwordWatch = form3.watch("password") ?? "";

  /* ── DOB auto-format ── */
  const handleDobChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let v = e.target.value.replace(/\D/g, "");
    if (v.length > 2) v = v.slice(0, 2) + "/" + v.slice(2);
    if (v.length > 5) v = v.slice(0, 5) + "/" + v.slice(5);
    form1.setValue("dateOfBirth", v.slice(0, 10), { shouldValidate: true });
  };

  const onStep1 = form1.handleSubmit((data) => {
    setCollectedData((prev) => ({ ...prev, ...data }));
    setStep(2);
  });

  const onStep2 = form2.handleSubmit((data) => {
    setCollectedData((prev) => ({ ...prev, ...data }));
    setStep(3);
  });

  const onStep3 = form3.handleSubmit(async (data) => {
    setServerError(null);
    clearError();
    try {
      await registerUser({
        firstName: collectedData.firstName!,
        lastName: collectedData.lastName!,
        email: collectedData.email!,
        username: collectedData.username!,
        password: data.password,
        dateOfBirth: collectedData.dateOfBirth,
        accountNumber: collectedData.accountNumber,
      });
      setSubmitted(true);
    } catch (err) {
      setServerError(err instanceof Error ? err.message : "Registration failed.");
    }
  });

  /* ── Success screen ── */
  if (submitted) {
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
            <div className="signup-success">
              <div className="signup-success-icon">
                <CheckCircle2 size={38} />
              </div>
              <h1 className="auth-title" style={{ marginTop: "18px" }}>
                Account created!
              </h1>
              <p className="signup-success-msg">
                Welcome, {collectedData.firstName}! Your account is ready. Taking
                you to your dashboard…
              </p>
              <button
                className="auth-submit"
                style={{ marginTop: "28px" }}
                onClick={() => navigate("/")}
              >
                Go to Dashboard
              </button>
            </div>
          </div>
        </main>
      </div>
    );
  }

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
        <div className="auth-card auth-card--wide">
          <div className="signup-heading">
            <h1 className="auth-title">Get started by telling us about you</h1>
            <p className="signup-sub">
              To set up online access, we need to locate you in our system.
            </p>
          </div>

          <StepIndicator current={step} total={3} />

          {/* ── STEP 1 ── */}
          {step === 1 && (
            <form onSubmit={onStep1} noValidate>
              <p className="signup-section-label">Enter your personal information</p>

              <div className="auth-field">
                <label htmlFor="su-lastName" className="auth-label">Last Name</label>
                <div className={`auth-input-wrap${form1.formState.errors.lastName ? " auth-input-wrap--error" : ""}`}>
                  <User size={14} className="auth-input-icon" aria-hidden="true" />
                  <input id="su-lastName" type="text" autoComplete="family-name"
                    className="auth-input" {...form1.register("lastName")} />
                </div>
                {form1.formState.errors.lastName && (
                  <p className="auth-field-error">{form1.formState.errors.lastName.message}</p>
                )}
              </div>

              <div className="auth-field">
                <label htmlFor="su-account" className="auth-label">Bank Account Number</label>
                <div className={`auth-input-wrap${form1.formState.errors.accountNumber ? " auth-input-wrap--error" : ""}`}>
                  <CreditCard size={14} className="auth-input-icon" aria-hidden="true" />
                  <input id="su-account" type="text" inputMode="numeric" autoComplete="off"
                    className="auth-input" {...form1.register("accountNumber")} />
                </div>
                {form1.formState.errors.accountNumber ? (
                  <p className="auth-field-error">{form1.formState.errors.accountNumber.message}</p>
                ) : (
                  <p className="auth-field-hint">
                    <button type="button" className="auth-link" style={{ fontSize: "11px" }}
                      onClick={() => alert("SSN/ITIN lookup coming soon.")}>
                      Use social security number or ITIN instead
                    </button>
                  </p>
                )}
              </div>

              <div className="auth-field">
                <label htmlFor="su-dob" className="auth-label">Date of Birth</label>
                <div className={`auth-input-wrap${form1.formState.errors.dateOfBirth ? " auth-input-wrap--error" : ""}`}>
                  <CalendarDays size={14} className="auth-input-icon" aria-hidden="true" />
                  <input id="su-dob" type="text" inputMode="numeric" autoComplete="bday"
                    placeholder="mm / dd / yyyy" className="auth-input"
                    value={form1.watch("dateOfBirth")} onChange={handleDobChange} />
                </div>
                {form1.formState.errors.dateOfBirth && (
                  <p className="auth-field-error">{form1.formState.errors.dateOfBirth.message}</p>
                )}
              </div>

              <button type="submit" className="auth-submit" style={{ gap: "8px" }}>
                Get Started <ArrowRight size={15} />
              </button>
              <p className="signup-login-cta">
                Already have access? <Link href="/login" className="auth-link">Sign in</Link>
              </p>
            </form>
          )}

          {/* ── STEP 2 ── */}
          {step === 2 && (
            <form onSubmit={onStep2} noValidate>
              <p className="signup-section-label">Create your account credentials</p>

              <div className="auth-field">
                <label htmlFor="su-firstName" className="auth-label">First Name</label>
                <div className={`auth-input-wrap${form2.formState.errors.firstName ? " auth-input-wrap--error" : ""}`}>
                  <User size={14} className="auth-input-icon" aria-hidden="true" />
                  <input id="su-firstName" type="text" autoComplete="given-name"
                    className="auth-input" {...form2.register("firstName")} />
                </div>
                {form2.formState.errors.firstName && (
                  <p className="auth-field-error">{form2.formState.errors.firstName.message}</p>
                )}
              </div>

              <div className="auth-field">
                <label htmlFor="su-email" className="auth-label">Email Address</label>
                <div className={`auth-input-wrap${form2.formState.errors.email ? " auth-input-wrap--error" : ""}`}>
                  <Mail size={14} className="auth-input-icon" aria-hidden="true" />
                  <input id="su-email" type="email" autoComplete="email"
                    className="auth-input" {...form2.register("email")} />
                </div>
                {form2.formState.errors.email && (
                  <p className="auth-field-error">{form2.formState.errors.email.message}</p>
                )}
              </div>

              <div className="auth-field">
                <label htmlFor="su-username" className="auth-label">Choose a Username</label>
                <div className={`auth-input-wrap${form2.formState.errors.username ? " auth-input-wrap--error" : ""}`}>
                  <User size={14} className="auth-input-icon" aria-hidden="true" />
                  <input id="su-username" type="text" autoComplete="username"
                    autoCapitalize="none" className="auth-input"
                    {...form2.register("username")} />
                </div>
                {form2.formState.errors.username && (
                  <p className="auth-field-error">{form2.formState.errors.username.message}</p>
                )}
              </div>

              <div className="signup-actions">
                <button type="button" className="auth-back-button" onClick={() => setStep(1)}>
                  <ArrowLeft size={15} /> Back
                </button>
                <button type="submit" className="auth-submit auth-submit--inline">
                  Continue <ArrowRight size={15} />
                </button>
              </div>
            </form>
          )}

          {/* ── STEP 3 ── */}
          {step === 3 && (
            <form onSubmit={onStep3} noValidate>
              <p className="signup-section-label">Set a secure password</p>

              {(serverError || authError) && (
                <div className="auth-error-banner" role="alert">
                  <Lock size={13} />
                  <span>{serverError ?? authError}</span>
                </div>
              )}

              <div className="auth-field">
                <label htmlFor="su-password" className="auth-label">Password</label>
                <div className={`auth-input-wrap${form3.formState.errors.password ? " auth-input-wrap--error" : ""}`}>
                  <Lock size={14} className="auth-input-icon" aria-hidden="true" />
                  <input id="su-password" type={showPw ? "text" : "password"}
                    autoComplete="new-password" className="auth-input"
                    {...form3.register("password")} />
                  <button type="button" className="auth-toggle-pw"
                    aria-label={showPw ? "Hide" : "Show"}
                    onClick={() => setShowPw((v) => !v)}>
                    {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
                <PasswordStrength password={passwordWatch} />
                {form3.formState.errors.password && (
                  <p className="auth-field-error">{form3.formState.errors.password.message}</p>
                )}
              </div>

              <div className="auth-field">
                <label htmlFor="su-confirm" className="auth-label">Confirm Password</label>
                <div className={`auth-input-wrap${form3.formState.errors.confirmPassword ? " auth-input-wrap--error" : ""}`}>
                  <Lock size={14} className="auth-input-icon" aria-hidden="true" />
                  <input id="su-confirm" type={showConfirm ? "text" : "password"}
                    autoComplete="new-password" className="auth-input"
                    {...form3.register("confirmPassword")} />
                  <button type="button" className="auth-toggle-pw"
                    aria-label={showConfirm ? "Hide" : "Show"}
                    onClick={() => setShowConfirm((v) => !v)}>
                    {showConfirm ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
                {form3.formState.errors.confirmPassword && (
                  <p className="auth-field-error">{form3.formState.errors.confirmPassword.message}</p>
                )}
              </div>

              <ul className="pw-rules">
                {(
                  [
                    ["8+ characters", passwordWatch.length >= 8],
                    ["One uppercase letter", /[A-Z]/.test(passwordWatch)],
                    ["One number", /[0-9]/.test(passwordWatch)],
                    ["One special character", /[^A-Za-z0-9]/.test(passwordWatch)],
                  ] as [string, boolean][]
                ).map(([label, met]) => (
                  <li key={label} className={met ? "pw-rule pw-rule--met" : "pw-rule"}>
                    <CheckCircle2 size={11} />
                    {label}
                  </li>
                ))}
              </ul>

              <div className="signup-actions">
                <button type="button" className="auth-back-button" onClick={() => setStep(2)}>
                  <ArrowLeft size={15} /> Back
                </button>
                <button type="submit" className="auth-submit auth-submit--inline"
                  disabled={form3.formState.isSubmitting} aria-busy={form3.formState.isSubmitting}>
                  {form3.formState.isSubmitting
                    ? <span className="auth-spinner" aria-label="Creating account…" />
                    : <><CheckCircle2 size={15} /> Create Account</>}
                </button>
              </div>
            </form>
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

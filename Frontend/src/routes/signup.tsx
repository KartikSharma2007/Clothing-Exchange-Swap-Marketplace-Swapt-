import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useState, type ReactNode } from "react";
import { ArrowLeft, ArrowRight, Cake, Check, Eye, EyeOff, Lock, Mail, MapPin, PenLine, Phone, ShieldCheck, User } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { AuthShell, Divider, SubmitButton } from "@/components/site/AuthShell";
import { FormField, SectionLabel, fieldInput } from "@/components/site/FormField";
import { GoogleAuthButton } from "@/components/site/GoogleAuthButton";
import { isDeletedAccountError, signUp } from "@/lib/auth-api";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/signup")({
  head: () => ({
    meta: [
      { title: "Sign up — Swapt" },
      { name: "description", content: "Create a Swapt account and start trading clothes with people nearby." },
      { property: "og:title", content: "Sign up — Swapt" },
      { property: "og:description", content: "Create a Swapt account and start trading clothes." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: SignupPage,
});

const stepOne = z.object({
  name: z.string().trim().min(2, "Enter your full name").max(60),
  age: z.coerce.number({ invalid_type_error: "Age is required" }).int("Whole numbers only").min(13, "You must be 13+").max(120, "Enter a real age"),
  email: z.string().trim().min(1, "Email is required").email("Enter a valid email").max(255),
  phone: z.string().trim().regex(/^[+\d][\d\s-]{6,19}$/, "Enter a valid phone number"),
  address: z.string().trim().min(4, "Enter your address").max(160),
});

const stepTwo = z.object({
  password: z.string().min(8, "At least 8 characters").max(72, "Too long")
    .regex(/[A-Z]/, "Add an uppercase letter").regex(/[0-9]/, "Add a number"),
  bio: z.string().trim().max(300, "Keep it under 300 characters").optional(),
  agree: z.literal(true, { errorMap: () => ({ message: "You must accept the terms" }) }),
});

const schema = stepOne.merge(stepTwo);
type FormValues = z.input<typeof schema>;

function SignupPage() {
  const navigate = useNavigate();
  const { refresh } = useAuth();
  const [step, setStep] = useState<1 | 2>(1);
  const [showPw, setShowPw] = useState(false);
  const [rootError, setRootError] = useState<ReactNode | null>(null);

  const {
    register, handleSubmit, trigger, watch, formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema), mode: "onBlur" });

  // Watch password at the top level (outside conditionals)
  const password = watch("password");
  const pw = String(password ?? "");
  const pwRules = [
    { label: "8+ characters", ok: pw.length >= 8 },
    { label: "Uppercase letter", ok: /[A-Z]/.test(pw) },
    { label: "Number", ok: /[0-9]/.test(pw) },
  ];

  // Visual strength meter (length, upper, number, symbol).
  const strength = pwRules.filter((r) => r.ok).length + (/[^A-Za-z0-9]/.test(pw) ? 1 : 0);
  const strengthLabel = ["", "Weak", "Fair", "Good", "Strong"][strength];
  const strengthTone =
    strength === 1 ? "bg-rose-500"
    : strength === 2 ? "bg-amber-500"
    : strength === 3 ? "bg-lime-500"
    : "bg-emerald-500";

  const goHome = async () => {
    await refresh();
    void navigate({ to: "/dashboard", search: { welcome: true } });
  };

  const next = async () => {
    const ok = await trigger(["name", "age", "email", "phone", "address"]);
    if (ok) setStep(2);
  };

  const onSubmit = async (v: FormValues) => {
    setRootError(null);
    try {
      const result = await signUp({
        name: v.name,
        email: v.email,
        phone: v.phone,
        address: v.address,
        age: Number(v.age),
        bio: v.bio ?? "",
        password: v.password,
      });
      // With email verification on, the account isn't active yet — show a
      // confirmation prompt instead of pretending the user is signed in.
      if ("needsVerification" in result) {
        // In dev, stash the one-click verify token so check-email can offer it
        if (result.devToken) {
          try { sessionStorage.setItem(`swapt.devToken:${result.email}`, result.devToken); } catch { /* ignore */ }
        }
        if (result.devVerificationLink) {
          try { sessionStorage.setItem(`swapt.devLink:${result.email}`, result.devVerificationLink); } catch { /* ignore */ }
        }
        void navigate({ to: "/check-email", search: { email: result.email } });
        return;
      }
      await goHome();
    } catch (err) {
      if (isDeletedAccountError(err)) {
        setRootError(
          <>
            Your account has been deactivated. To recover your account, please{' '}
            <Link to="/contact" className="font-bold text-brand underline underline-offset-2 hover:opacity-80">
              contact support
            </Link>.
          </>
        );
        return;
      }
      setRootError(err instanceof Error ? err.message : "Couldn't create your account.");
    }
  };

  return (
    <AuthShell
      title="Join Swapt"
      subtitle="Trade preloved for something new-to-you."
      aside={{
        heading: "Create your swap profile in two quick steps.",
        points: ["Step 1 — who you are and where to ship", "Step 2 — secure your account and add a bio", "Then you're in: list, browse and swap"],
      }}
      footer={<>Already a member? <Link to="/login" className="font-semibold text-brand hover:underline">Log in</Link></>}
    >
      <GoogleAuthButton intent="signup_with" onAuthenticated={goHome} />
      <Divider>or</Divider>

      {/* Progress */}
      <div className="mb-6">
        <div className="flex items-center gap-2">
          {[1, 2].map((s) => (
            <div key={s} className="flex flex-1 items-center gap-2">
              <span
                className={`relative flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold transition-all duration-300 ${
                  step > s
                    ? "bg-brand text-brand-foreground"
                    : step === s
                      ? "bg-brand text-brand-foreground ring-4 ring-brand/15"
                      : "bg-muted text-foreground/50"
                }`}
              >
                {step > s ? <Check className="h-3.5 w-3.5" /> : s}
              </span>
              <span className={`hidden text-xs font-semibold sm:block ${step === s ? "text-foreground" : "text-foreground/50"}`}>
                {s === 1 ? "Your details" : "Security & bio"}
              </span>
              {s === 1 && (
                <span className="h-1 flex-1 overflow-hidden rounded-full bg-border">
                  <span
                    className={`block h-full rounded-full bg-gradient-to-r from-brand to-brand/60 transition-all duration-500 ${step > 1 ? "w-full" : "w-0"}`}
                  />
                </span>
              )}
            </div>
          ))}
        </div>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
        {step === 1 && (
          <div key="step1" className="animate-[step-in_0.35s_ease-out] space-y-5">
            <SectionLabel>About you</SectionLabel>

            <FormField label="Full name" icon={<User className="h-4 w-4" />} error={errors.name?.message}>
              <input autoComplete="name" placeholder="e.g. Maya Singh" className={fieldInput} {...register("name")} />
            </FormField>

            <FormField label="Age" icon={<Cake className="h-4 w-4" />} error={errors.age?.message}>
              <input type="number" min={13} max={120} placeholder="e.g. 26" className={fieldInput} {...register("age")} />
            </FormField>

            <SectionLabel>Contact & delivery</SectionLabel>

            <FormField label="Phone number" icon={<Phone className="h-4 w-4" />} error={errors.phone?.message}>
              <input type="tel" autoComplete="tel" placeholder="+91 98765 43210" className={fieldInput} {...register("phone")} />
            </FormField>

            <FormField label="Email" icon={<Mail className="h-4 w-4" />} error={errors.email?.message}>
              <input type="email" autoComplete="email" placeholder="you@example.com" className={fieldInput} {...register("email")} />
            </FormField>

            <FormField
              label="Address"
              icon={<MapPin className="h-4 w-4" />}
              error={errors.address?.message}
              hint="Used for shipping estimates and local swaps."
            >
              <input autoComplete="street-address" placeholder="Street, city, postcode" className={fieldInput} {...register("address")} />
            </FormField>

            <button
              type="button"
              onClick={next}
              className="group mt-1 flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-brand to-brand/85 py-3.5 text-sm font-bold text-brand-foreground shadow-lg shadow-brand/25 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-xl hover:shadow-brand/35 active:translate-y-0"
            >
              Continue
              <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
            </button>

            <p className="flex items-center justify-center gap-1.5 pt-1 text-xs font-medium text-foreground/45">
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
              Your details are encrypted and never shared.
            </p>
          </div>
        )}

        {step === 2 && (
          <div key="step2" className="animate-[step-in_0.35s_ease-out] space-y-5">
            <SectionLabel>Secure your account</SectionLabel>

            <FormField label="Password" icon={<Lock className="h-4 w-4" />} error={errors.password?.message}>
              <input
                type={showPw ? "text" : "password"}
                autoComplete="new-password"
                placeholder="Create a password"
                className={cn(fieldInput, "pr-9")}
                {...register("password")}
              />
              <button
                type="button"
                onClick={() => setShowPw((s) => !s)}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-foreground/50 transition-colors hover:bg-muted hover:text-foreground"
                aria-label={showPw ? "Hide password" : "Show password"}
              >
                {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </FormField>

            <div className="space-y-2">
              <ul className="grid grid-cols-1 gap-1.5 text-xs sm:grid-cols-3">
                {pwRules.map((r) => (
                  <li key={r.label} className={`flex items-center gap-1.5 transition-colors ${r.ok ? "text-emerald-600" : "text-foreground/50"}`}>
                    <span className={`flex h-4 w-4 items-center justify-center rounded-full transition-colors ${r.ok ? "bg-emerald-100 text-emerald-600" : "bg-muted text-foreground/40"}`}>
                      <Check className="h-2.5 w-2.5" />
                    </span>
                    {r.label}
                  </li>
                ))}
              </ul>

              {pw.length > 0 && (
                <div className="animate-fade-in">
                  <div className="flex items-center justify-between text-xs font-semibold">
                    <span className="text-foreground/50">Password strength</span>
                    <span className={strength >= 3 ? "text-emerald-600" : "text-foreground/60"}>{strengthLabel}</span>
                  </div>
                  <div className="mt-1.5 flex gap-1">
                    {[1, 2, 3, 4].map((i) => (
                      <span
                        key={i}
                        className={`h-1.5 flex-1 rounded-full transition-all duration-300 ${i <= strength ? strengthTone : "bg-border"}`}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>

            <SectionLabel>Tell swappers your style</SectionLabel>

            <FormField
              label="Bio"
              icon={<PenLine className="h-4 w-4" />}
              multiline
              error={errors.bio?.message}
              trailing={<span className="text-xs font-medium text-foreground/45">Optional</span>}
            >
              <textarea
                rows={3}
                placeholder="Describe your style — vintage lover, streetwear, smart-casual…"
                className={cn(fieldInput, "resize-none py-0.5")}
                {...register("bio")}
              />
            </FormField>

            <label className="group flex cursor-pointer items-start gap-3 rounded-2xl border border-border bg-muted/30 p-3.5 transition-all duration-200 hover:border-brand/40 has-[:checked]:border-brand/50 has-[:checked]:bg-brand/[0.04]">
              <span className="relative mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-md border border-foreground/20 bg-background transition-all duration-200 has-[:checked]:border-brand has-[:checked]:bg-brand">
                <input type="checkbox" className="peer absolute inset-0 cursor-pointer opacity-0" {...register("agree")} />
                <Check className="h-3.5 w-3.5 text-brand-foreground opacity-0 transition-opacity peer-checked:opacity-100" />
              </span>
              <span className="text-sm text-foreground/70">
                I agree to the <Link to="/terms" className="font-semibold text-brand underline underline-offset-2 hover:opacity-80">Terms of Service</Link> and{" "}
                <Link to="/privacy" className="font-semibold text-brand underline underline-offset-2 hover:opacity-80">Privacy Policy</Link>.
              </span>
            </label>
            {errors.agree && <p className="-mt-3 text-xs text-destructive">{errors.agree.message}</p>}

            {rootError && (
              <div className="animate-fade-in flex items-start gap-2 rounded-2xl border border-destructive/30 bg-destructive/10 px-3.5 py-2.5 text-sm text-destructive">
                <span>⚠️</span> {rootError}
              </div>
            )}

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setStep(1)}
                className="flex items-center justify-center gap-2 rounded-2xl border border-border px-4 py-3.5 text-sm font-semibold transition-all duration-200 hover:-translate-y-0.5 hover:bg-muted"
              >
                <ArrowLeft className="h-4 w-4" /> Back
              </button>
              <SubmitButton loading={isSubmitting} className="flex-1 rounded-2xl py-3.5">
                Create account
              </SubmitButton>
            </div>

            <p className="flex items-center justify-center gap-1.5 text-xs text-foreground/50">
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
              Your details are encrypted and never shared.
            </p>
          </div>
        )}
      </form>

    </AuthShell>
  );
}

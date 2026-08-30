import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useState, type ReactNode } from "react";
import { ArrowRight, Check, Eye, EyeOff, Loader2, Lock, LogIn, Mail, RefreshCw, ShieldCheck } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { BackHome, Divider } from "@/components/site/AuthShell";
import { FormField, fieldInput } from "@/components/site/FormField";
import { GoogleAuthButton } from "@/components/site/GoogleAuthButton";
import { devVerify, isDeletedAccountError, login, resendVerification } from "@/lib/auth-api";
import { ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";
import hoodie from "@/assets/pop-hoodie.jpg";
import sneakers from "@/assets/pop-sneakers.jpg";
import backpack from "@/assets/pop-backpack.jpg";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Log in — Swapt" },
      { name: "description", content: "Log in to Swapt to swap preloved clothing with people near you." },
      { property: "og:title", content: "Log in — Swapt" },
      { property: "og:description", content: "Log in to Swapt to swap preloved clothing." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: LoginPage,
});

const REMEMBER_KEY = "swapt.rememberedEmail";

const schema = z.object({
  email: z.string().trim().min(1, "Email is required").email("Enter a valid email").max(255),
  password: z.string().min(1, "Password is required").max(72),
  rememberMe: z.boolean(),
});
type FormValues = z.infer<typeof schema>;

function LoginPage() {
  const navigate = useNavigate();
  const { refresh } = useAuth();
  const [showPw, setShowPw] = useState(false);
  const [rootError, setRootError] = useState<ReactNode | null>(null);
  const [needsVerify, setNeedsVerify] = useState<string | null>(null);
  const [resending, setResending] = useState(false);
  const [resent, setResent] = useState(false);
  const {
    register, handleSubmit, formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    mode: "onBlur",
    defaultValues: {
      email: typeof window === "undefined" ? "" : (window.localStorage.getItem(REMEMBER_KEY) ?? ""),
      password: "",
      rememberMe: true,
    },
  });

  const goHome = async () => {
    await refresh();
    void navigate({ to: "/dashboard", search: { welcome: true } });
  };

  const onSubmit = async (values: FormValues) => {
    setRootError(null);
    setNeedsVerify(null);
    setResent(false);
    try {
      await login(values.email, values.password, values.rememberMe);
      if (typeof window !== "undefined") {
        if (values.rememberMe) window.localStorage.setItem(REMEMBER_KEY, values.email.trim());
        else window.localStorage.removeItem(REMEMBER_KEY);
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
      if (err instanceof ApiError && err.body?.needsVerification) {
        setNeedsVerify(String(err.body?.email ?? values.email));
        return;
      }
      setRootError(
        err instanceof ApiError || err instanceof Error
          ? err.message
          : "Couldn't reach the server. Is the API running?",
      );
    }
  };

  const resend = async () => {
    if (!needsVerify || resending) return;
    setResending(true);
    setResent(false);
    try {
      await resendVerification(needsVerify);
      setResent(true);
    } catch {
      /* best-effort */
    } finally {
      setResending(false);
    }
  };

  return (
    <div className="relative flex min-h-dvh flex-col overflow-hidden bg-surface-ink">
      {/* Ambient glows + grid texture — a red "signature" mood */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(55%_45%_at_12%_0%,rgba(224,53,58,0.28),transparent_60%),radial-gradient(45%_40%_at_95%_100%,rgba(224,53,58,0.14),transparent_60%),radial-gradient(30%_25%_at_80%_5%,rgba(255,255,255,0.08),transparent_55%)]" />
      <div className="pointer-events-none absolute inset-0 opacity-[0.14] [background-image:linear-gradient(rgba(255,255,255,0.06)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.06)_1px,transparent_1px)] [background-size:44px_44px]" />

      {/* Top bar — mobile no overlap: flex center instead of absolute */}
      <header className="relative z-10 flex items-center gap-2 px-5 py-5 sm:px-8 lg:px-12 max-md:px-3 max-md:py-3.5 max-md:gap-2">
        <BackHome dark className="shrink-0 max-md:shrink-0" />
        <Link to="/" className="hidden shrink-0 text-2xl font-black tracking-tight text-white sm:block">
          swapt<span className="text-brand">.</span>
        </Link>
        {/* Mobile centered logo — flex-1 centered, truncates instead of overlapping */}
        <Link to="/" className="flex flex-1 justify-center truncate text-xl font-black tracking-tight text-white sm:hidden max-md:text-[18px]">
          swapt<span className="text-brand">.</span>
        </Link>
        <Link
          to="/signup"
          className="shrink-0 rounded-full border border-white/20 px-4 py-2 text-sm font-semibold text-white/85 transition-all duration-200 hover:border-white/50 hover:text-white max-md:px-3 max-md:py-2 max-md:text-xs max-md:font-bold max-md:bg-white/10 max-md:backdrop-blur max-md:min-h-11 max-md:inline-flex max-md:items-center"
        >
          <span className="hidden sm:inline">New here? </span><span className="font-bold text-brand">Sign up</span>
        </Link>
      </header>

      {/* Main */}
      <main className="relative z-10 mx-auto flex w-full max-w-6xl flex-1 flex-col justify-center gap-8 px-5 pb-12 sm:px-8 lg:flex-row lg:items-center lg:gap-20 max-md:gap-6 max-md:px-4 max-md:pb-8">
        {/* Mobile brand hero — premium, hidden on desktop */}
        <div className="w-full max-w-md lg:hidden">
          <div className="flex flex-col items-center text-center">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-bold text-white/80 backdrop-blur">
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" /> Trusted by 30k+ swappers
            </span>
            <h2 className="mt-3 text-[22px] font-black leading-tight tracking-tight text-white">Welcome back, swapper</h2>
            <p className="mt-1.5 max-w-xs text-sm leading-relaxed text-white/60">Your closet is waiting — log in to see new offers.</p>
            <div className="mt-4 flex items-center gap-6 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 backdrop-blur">
              <span className="text-center"><span className="block text-sm font-black leading-none text-white">30k+</span><span className="text-[10px] font-bold uppercase tracking-widest text-white/50">swaps</span></span>
              <span className="h-8 w-px bg-white/10" />
              <span className="text-center"><span className="block text-sm font-black leading-none text-white">4.9</span><span className="text-[10px] font-bold uppercase tracking-widest text-white/50">rated</span></span>
              <span className="h-8 w-px bg-white/10" />
              <span className="text-center"><span className="block text-sm font-black leading-none text-white">120+</span><span className="text-[10px] font-bold uppercase tracking-widest text-white/50">cities</span></span>
            </div>
          </div>
        </div>
        {/* ── Form column ─────────────────────────────────────────── */}
        <div className="w-full max-w-md">
          <div className="relative animate-scale-in overflow-hidden rounded-3xl border border-white/15 bg-card/95 p-6 shadow-[0_40px_90px_-40px_rgba(0,0,0,0.75)] backdrop-blur-md md:p-8 max-md:rounded-[1.75rem] max-md:border-white/10 max-md:p-6 max-md:shadow-[0_16px_40px_-12px_rgba(0,0,0,0.5)]">
            {/* red hairline accent */}
            <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-transparent via-brand to-transparent" />

            <div className="flex items-center gap-3 max-md:gap-3.5">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-brand to-brand/80 shadow-lg shadow-brand/30 max-md:h-12 max-md:w-12 max-md:rounded-2xl">
                <LogIn className="h-5 w-5 text-brand-foreground max-md:h-5 max-md:w-5" />
              </span>
              <div>
                <h1 className="text-2xl font-black leading-none tracking-tight max-md:text-[22px]">Welcome back</h1>
                <p className="mt-1 text-sm text-foreground/60 max-md:text-[13px]">Log in to keep swapping.</p>
              </div>
            </div>

            <div className="mt-6 max-md:mt-5">
              <GoogleAuthButton intent="signin_with" onAuthenticated={goHome} />
              <Divider>or</Divider>

              <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-5">
                <FormField label="Email" icon={<Mail className="h-4 w-4" />} error={errors.email?.message} tone="brand">
                  <input
                    type="email"
                    autoComplete="email"
                    placeholder="you@example.com"
                    aria-invalid={!!errors.email}
                    className={fieldInput}
                    {...register("email")}
                  />
                </FormField>

                <FormField
                  label="Password"
                  icon={<Lock className="h-4 w-4" />}
                  error={errors.password?.message}
                  tone="brand"
                  trailing={<Link to="/forgot" className="text-xs font-semibold text-brand hover:underline">Forgot?</Link>}
                >
                  <input
                    type={showPw ? "text" : "password"}
                    autoComplete="current-password"
                    placeholder="Your password"
                    aria-invalid={!!errors.password}
                    className={cn(fieldInput, "pr-12")}
                    {...register("password")}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPw((s) => !s)}
                    className="absolute right-1 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-xl text-foreground/50 transition-colors hover:bg-muted hover:text-foreground max-md:h-11 max-md:w-11"
                    aria-label={showPw ? "Hide password" : "Show password"}
                  >
                    {showPw ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                  </button>
                </FormField>

                <label className="group flex cursor-pointer items-center gap-3">
                  <span className="relative grid h-5 w-5 shrink-0 place-items-center rounded-md border border-foreground/20 bg-background transition-all duration-200 has-[:checked]:border-brand has-[:checked]:bg-brand">
                    <input type="checkbox" className="peer absolute inset-0 cursor-pointer opacity-0" {...register("rememberMe")} />
                    <Check className="h-3.5 w-3.5 text-white opacity-0 transition-opacity peer-checked:opacity-100" />
                  </span>
                  <span className="text-sm font-medium text-foreground/75 transition-colors group-hover:text-foreground">
                    Keep me logged in
                  </span>
                </label>

                {needsVerify && (
                  <div className="animate-fade-in space-y-3 rounded-2xl border border-amber-300/40 bg-amber-50/80 px-3.5 py-3 text-sm">
                    <p className="font-bold text-amber-800">Please verify your email before logging in.</p>
                    <p className="text-amber-700/80">
                      We sent a link to <span className="font-semibold">{needsVerify}</span>. Once you click it you can log in. Check spam too.
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={resend}
                        disabled={resending}
                        className="inline-flex items-center gap-1.5 rounded-full border border-amber-300 bg-white px-3 py-2.5 text-sm min-h-11 font-bold text-amber-800 transition-colors hover:bg-amber-50 disabled:opacity-60"
                      >
                        <RefreshCw className={`h-3.5 w-3.5 ${resending ? "animate-spin" : ""}`} />
                        {resent ? "Email sent — check inbox" : "Resend email"}
                      </button>
                      <button
                        type="button"
                        onClick={async () => {
                          try {
                            await devVerify(needsVerify);
                            await refresh();
                            void navigate({ to: "/dashboard", search: { welcome: true } });
                          } catch (e) {
                            setRootError(e instanceof Error ? e.message : "Dev verify failed — is the API running?");
                          }
                        }}
                        className="inline-flex items-center gap-1.5 rounded-full bg-amber-600 px-3 py-2.5 text-sm min-h-11 font-bold text-white transition-colors hover:bg-amber-700"
                      >
                        <ShieldCheck className="h-3.5 w-3.5" />
                        Verify instantly (dev)
                      </button>
                    </div>
                    <p className="text-xs text-amber-700/60">Dev mode: verify without opening your email.</p>
                  </div>
                )}

                {rootError && (
                  <div className="animate-fade-in flex items-start gap-2 rounded-2xl border border-destructive/30 bg-destructive/10 px-3.5 py-2.5 text-sm text-destructive">
                    <span>⚠️</span>
                    <span>{rootError}</span>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="group flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-brand to-brand/85 py-3.5 text-sm font-bold text-white shadow-lg shadow-brand/30 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-xl hover:shadow-brand/45 active:translate-y-0 disabled:opacity-60 max-md:min-h-[52px] max-md:py-4 max-md:text-[15px] max-md:font-black max-md:rounded-2xl max-md:shadow-xl"
                >
                  {isSubmitting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
                  )}
                  {isSubmitting ? "Logging in…" : "Log in"}
                </button>
              </form>
            </div>
          </div>
        </div>

        {/* ── Dashboard preview (desktop only) ─────────────────────── */}
        <div className="hidden w-full max-w-md lg:block">
          <div className="relative">
            {/* floating alert chip */}
            <span className="absolute -right-3 -top-5 z-10 animate-[float_7s_ease-in-out_infinite] rounded-full border border-white/15 bg-white/10 px-3.5 py-2.5 text-sm min-h-11 font-bold text-white/90 shadow-xl backdrop-blur">
              ⚡ 3 new swap offers
            </span>

            {/* profile card */}
            <div className="animate-[float_8s_ease-in-out_infinite] rounded-3xl border border-white/15 bg-white/10 p-6 shadow-[0_30px_80px_-30px_rgba(0,0,0,0.7)] backdrop-blur-md">
              <div className="flex items-center gap-3">
                <div className="h-12 w-12 shrink-0 overflow-hidden rounded-2xl bg-gradient-to-br from-brand to-brand/85 ring-2 ring-white/25">
                  <img src={backpack} alt="Maya" className="h-full w-full object-cover" />
                </div>
                <div className="min-w-0">
                  <p className="truncate font-black text-white">Welcome back, Maya</p>
                  <p className="text-xs text-white/55">Member since 2023 · London</p>
                </div>
                <span className="ml-auto shrink-0 rounded-full bg-emerald-400/15 px-2.5 py-2 text-sm min-h-9 font-bold text-emerald-300">
                  +120 cr
                </span>
              </div>

              <div className="mt-5 grid grid-cols-3 gap-3">
                {[
                  ["14", "Swaps done"],
                  ["4.9", "Rating"],
                  ["3", "Pending"],
                ].map(([n, label]) => (
                  <div key={label} className="rounded-2xl bg-white/5 p-3">
                    <p className="text-xl font-black leading-none text-white">{n}</p>
                    <p className="mt-1 text-xs font-semibold text-white/50">{label}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* swap in progress */}
            <div className="mt-5 animate-[float_9s_ease-in-out_infinite] rounded-3xl border border-white/15 bg-white/10 p-5 shadow-[0_30px_80px_-30px_rgba(0,0,0,0.7)] backdrop-blur-md [animation-delay:-2s]">
              <p className="text-xs font-bold uppercase tracking-widest text-white/50">Swap in progress</p>
              <div className="mt-3 flex items-center gap-3">
                <div className="flex -space-x-3">
                  <div className="h-11 w-11 overflow-hidden rounded-xl border-2 border-surface-ink">
                    <img src={hoodie} alt="Your item" className="h-full w-full object-cover" />
                  </div>
                  <div className="h-11 w-11 overflow-hidden rounded-xl border-2 border-surface-ink">
                    <img src={sneakers} alt="Their item" className="h-full w-full object-cover" />
                  </div>
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-white">Vintage hoodie ↔ Retro sneakers</p>
                  <p className="text-xs text-white/55">Swap pending · M / 20 km</p>
                </div>
              </div>
            </div>

            {/* testimonial */}
            <div className="mt-5 rounded-2xl border border-white/10 bg-white/[0.06] p-4">
              <p className="text-xs leading-relaxed text-white/70">
                “Logged back in and picked up exactly where I left off — two offers were waiting for me.”
              </p>
              <p className="mt-2 flex items-center gap-1.5 text-xs font-bold text-white">
                <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" /> Priya · 40+ swaps
              </p>
            </div>
          </div>
        </div>
      </main>

      {/* footer note */}
      <p className="relative z-10 pb-6 text-center text-xs text-white/40">
        Protected by 256-bit encryption ·{" "}
        <Link to="/contact" className="hover:text-white/70">Need help?</Link>
      </p>
    </div>
  );
}
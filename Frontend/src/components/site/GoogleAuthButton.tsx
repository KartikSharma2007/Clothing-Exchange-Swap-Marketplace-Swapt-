import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { AlertTriangle, Cake, Check, Eye, EyeOff, Loader2, Lock, Mail, MapPin, Phone, ShieldCheck, User } from "lucide-react";
import { SubmitButton } from "@/components/site/AuthShell";
import { FormField, fieldInput } from "@/components/site/FormField";
import { completeGoogleProfile, googleSignIn, googleLink, changePassword } from "@/lib/auth-api";
import { googleConfigured, renderGoogleButton } from "@/lib/google-auth";
import { useModalDialog } from "@/lib/dialog-a11y";
import { apiEnabled } from "@/lib/api";
import { cn } from "@/lib/utils";

type Props = {
  /** "signin_with" on /login, "signup_with" on /signup */
  intent?: "signin_with" | "signup_with";
  /** Called once a Swapt session exists and the profile is complete. */
  onAuthenticated: () => Promise<void> | void;
};

/**
 * Real Google sign-in. Google renders its own button (required by GIS), we
 * exchange the returned ID token server-side, then — only for brand-new Google
 * users — collect the marketplace fields Google can't give us.
 */
export function GoogleAuthButton({ intent = "signin_with", onAuthenticated }: Props) {
  const slotRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "exchanging">("loading");
  const [error, setError] = useState<string | null>(null);
  const [needsProfile, setNeedsProfile] = useState(false);
  const [email, setEmail] = useState("");
  const [prefillName, setPrefillName] = useState("");
  const [consent, setConsent] = useState<{ idToken: string; email: string; displayName?: string } | null>(null);

  const handleConsentClose = useCallback(() => setConsent(null), []);

  const unavailable = !googleConfigured || !apiEnabled;

  // Keep onAuthenticated stable so the Google button isn't torn down / re-created
  // on every parent re-render (which would flicker and can steal focus).
  const onAuthenticatedRef = useRef(onAuthenticated);
  onAuthenticatedRef.current = onAuthenticated;

  useEffect(() => {
    if (unavailable || !slotRef.current) return;
    let cancelled = false;

    void renderGoogleButton(
      slotRef.current,
      (idToken) => {
        if (cancelled) return;
        setError(null);
        setStatus("exchanging");
        void googleSignIn(idToken, intent === "signin_with" ? "signin" : "signup")
          .then(async (data) => {
            if (cancelled) return;
            if (data.needsConsent && data.email) {
              // A local account with this email exists — ask for consent
              // (password proof) before linking the Google identity.
              setConsent({ idToken, email: data.email, displayName: data.displayName });
              setStatus("idle");
              return;
            }
            if (data.needsProfile) {
              setEmail(data.user.email);
              setPrefillName(data.user.displayName || "");
              setNeedsProfile(true);
              setStatus("idle");
            } else {
              await onAuthenticatedRef.current();
            }
          })
          .catch((err: unknown) => {
            if (cancelled) return;
            setStatus("idle");
            setError(err instanceof Error ? err.message : "Google sign-in failed. Please try again.");
          });
      },
      (err) => {
        if (!cancelled) setError(err.message);
      },
      { text: intent === "signup_with" ? "signup_with" : "signin_with" },
    )
      .then(() => !cancelled && setStatus("idle"))
      .catch((err: unknown) => {
        if (cancelled) return;
        setStatus("idle");
        setError(err instanceof Error ? err.message : "Couldn't load Google sign-in.");
      });

    return () => {
      cancelled = true;
    };
  }, [intent, unavailable]);

  if (unavailable) {
    return (
      <div className="flex items-start gap-3 rounded-2xl border border-dashed border-amber-200 bg-amber-50/60 px-4 py-3.5 text-xs leading-relaxed text-foreground/70 shadow-sm max-md:rounded-2xl max-md:px-4 max-md:py-3.5">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-amber-100 text-amber-600 max-md:h-9 max-md:w-9">
          <AlertTriangle className="h-4 w-4" />
        </span>
        <p className="pt-1">
          Google sign-in is ready but not configured yet. Set{" "}
          <code className="rounded bg-white px-1.5 py-0.5 font-mono text-xs font-bold shadow-sm border border-amber-200">VITE_GOOGLE_CLIENT_ID</code>
          {!apiEnabled && (
            <> and <code className="rounded bg-white px-1.5 py-0.5 font-mono text-xs font-bold shadow-sm border border-amber-200">VITE_API_URL</code></>
          )}{" "}
          to enable it. Use the form below in the meantime.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Clean Google button — no double border, pill matches Google's own shape */}
      <div className="group relative overflow-hidden rounded-full border border-[#dadce0] bg-white shadow-sm transition-all duration-300 hover:shadow-md hover:border-[#c2c4c7] hover:-translate-y-0.5 active:translate-y-0">
        <div className="flex min-h-[44px] w-full items-center justify-center px-1 py-1 max-md:min-h-[48px]">
          {status === "loading" && (
            <div className="h-10 w-full animate-pulse rounded-full bg-muted" aria-label="Loading Google sign-in" />
          )}
          {status === "exchanging" && (
            <span className="inline-flex items-center gap-2 rounded-full bg-brand/10 px-4 py-2 text-sm font-bold text-brand">
              <Loader2 className="h-4 w-4 animate-spin" /> Signing you in…
            </span>
          )}
          <div ref={slotRef} className={status === "idle" ? "flex w-full justify-center [&>div]:!w-full [&>div]:flex [&>div]:justify-center [&_iframe]:!m-0" : "hidden"} />
        </div>
      </div>
      <p className="flex items-center justify-center gap-1.5 text-xs font-medium text-foreground/40 max-md:text-[11px]">
        <ShieldCheck className="h-3 w-3 text-emerald-500" /> Secure Google sign-in • No password needed
      </p>

      {error && (
        <p role="alert" className="animate-fade-in rounded-xl bg-rose-50 px-3 py-2.5 text-center text-xs font-medium text-destructive border border-rose-200">
          {error}
        </p>
      )}

      {needsProfile && (
        <CompleteProfileDialog email={email} initialName={prefillName} onDone={onAuthenticated} />
      )}

      {consent && (
        <LinkAccountDialog
          email={consent.email}
          displayName={consent.displayName}
          onClose={handleConsentClose}
          onLinked={onAuthenticated}
          idToken={consent.idToken}
        />
      )}
    </div>
  );
}

function LinkAccountDialog({
  email,
  displayName,
  idToken,
  onClose,
  onLinked,
}: {
  email: string;
  displayName?: string;
  idToken: string;
  onClose: () => void;
  onLinked: () => Promise<void> | void;
}) {
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Focus trap, Escape-to-close, focus restore, and inert page behind it.
  const dialogRef = useModalDialog(true, onClose);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password || busy) return;
    setBusy(true);
    setError(null);
    try {
      await googleLink(idToken, email, password);
      await onLinked();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't link your accounts.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      ref={dialogRef}
      tabIndex={-1}
      className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/50 p-4 backdrop-blur-sm animate-fade-in outline-none"
      role="dialog"
      aria-modal="true"
      aria-labelledby="link-account-title"
    >
      <div className="relative max-h-[90vh] w-full max-w-md animate-scale-in overflow-y-auto rounded-3xl border border-border bg-card p-6 shadow-2xl md:p-7">
        <div className="mb-4 flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand/10">
            <ShieldCheck className="h-5 w-5 text-brand" />
          </span>
          <div>
            <h2 id="link-account-title" className="text-xl font-black leading-none tracking-tight">Link your Google account</h2>
            <p className="mt-1 text-xs text-foreground/55">We found an existing Swapt account</p>
          </div>
        </div>

        <form onSubmit={submit} className="space-y-4">
          <div className="flex items-start gap-2.5 rounded-xl border border-border bg-muted/50 px-3.5 py-2.5 text-sm text-foreground/70">
            <Mail className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
            <span className="min-w-0">
              Signed in with Google as <span className="font-semibold text-foreground">{email}</span>
            </span>
          </div>

          <p className="text-sm leading-relaxed text-foreground/70">
            An account{displayName ? ` for ${displayName}` : ""} already uses this email. Enter its
            password to connect your Google account — you&apos;ll keep being able to log in with either.
          </p>

          <FormField label="Password" icon={<Lock className="h-4 w-4" />}>
            <input
              type={showPw ? "text" : "password"}
              autoComplete="current-password"
              className={cn(fieldInput, "pr-12")}
              placeholder="Your Swapt password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <button
              type="button"
              onClick={() => setShowPw((s) => !s)}
              className="absolute right-1 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-xl text-foreground/50 transition-colors hover:bg-muted hover:text-foreground"
              aria-label={showPw ? "Hide password" : "Show password"}
            >
              {showPw ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
            </button>
          </FormField>

          {error && <p role="alert" className="animate-fade-in text-xs text-destructive">{error}</p>}

          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              className="rounded-xl border border-border px-4 py-3 text-sm font-semibold transition-colors hover:bg-muted disabled:opacity-60"
            >
              Cancel
            </button>
            <SubmitButton loading={busy} className="flex-1">Link accounts</SubmitButton>
          </div>
        </form>
      </div>
    </div>
  );
}

function CompleteProfileDialog({
  email,
  initialName,
  onDone,
}: {
  email: string;
  initialName: string;
  onDone: () => Promise<void> | void;
}) {
  const [form, setForm] = useState({ name: initialName, phone: "", address: "", age: "", bio: "" });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [agree, setAgree] = useState(false);
  const [agreeError, setAgreeError] = useState<string | null>(null);

  // Focus trap + focus restore + inert page. Escape is intentionally a no-op:
  // this dialog is mandatory for new Google users and can't be dismissed.
  const noop = useCallback(() => {}, []);
  const dialogRef = useModalDialog(true, noop);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setAgreeError(null);
    const age = Number(form.age);
    if (form.name.trim().length < 2) return setError("Please enter your full name.");
    if (!/^[+\d][\d\s-]{6,19}$/.test(form.phone.trim())) return setError("Enter a valid phone number.");
    if (form.address.trim().length < 4) return setError("Please enter your address.");
    if (!Number.isFinite(age) || age < 13 || age > 120) return setError("Enter an age between 13 and 120.");
    if (!password || password.trim().length < 8) return setError("Password must be 8+ characters.");
    if (!agree) {
      setAgreeError("Please accept the Terms of Service and Privacy Policy to continue.");
      return;
    }
    setBusy(true);
    try {
      await completeGoogleProfile({ ...form, age });
      if (password) {
        // If the Google account had no password, this promotes it to a local-capable account.
        await changePassword("", password);
      }
      // Completed profile; password flow handled separately if desired.
      await onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  };

  // This dialog is required: a brand-new Google user must finish their profile
  // before they can use Swapt, so it has no close button / backdrop dismiss.
  return (
    <div
      ref={dialogRef}
      tabIndex={-1}
      className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/50 p-4 backdrop-blur-sm animate-fade-in outline-none"
      role="dialog"
      aria-modal="true"
      aria-labelledby="complete-profile-title"
    >
      <div className="relative max-h-[90vh] w-full max-w-md animate-scale-in overflow-y-auto rounded-3xl border border-border bg-card p-6 shadow-2xl md:p-7">
        <div className="mb-4 flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand/10">
            <ShieldCheck className="h-5 w-5 text-brand" />
          </span>
          <div>
            <h2 id="complete-profile-title" className="text-xl font-black leading-none tracking-tight">Complete your profile</h2>
            <p className="mt-1 text-xs text-foreground/55">One quick step — then you're in</p>
          </div>
        </div>

        <form onSubmit={submit} className="space-y-4">
          <div className="flex items-start gap-2.5 rounded-xl border border-border bg-muted/50 px-3.5 py-2.5 text-sm text-foreground/70">
            <Mail className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
            <span className="min-w-0">
              Signed in with Google as <span className="font-semibold text-foreground">{email}</span>
            </span>
          </div>

          <FormField label="Full name" icon={<User className="h-4 w-4" />}>
            <input className={fieldInput} value={form.name} onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))} />
          </FormField>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Phone number" icon={<Phone className="h-4 w-4" />}>
              <input className={fieldInput} placeholder="+91 98765 43210" value={form.phone} onChange={(e) => setForm((prev) => ({ ...prev, phone: e.target.value }))} />
            </FormField>
            <FormField label="Age" icon={<Cake className="h-4 w-4" />}>
              <input type="number" min={13} max={120} className={fieldInput} value={form.age} onChange={(e) => setForm((prev) => ({ ...prev, age: e.target.value }))} />
            </FormField>
          </div>
          <FormField label="Address" icon={<MapPin className="h-4 w-4" />}>
            <input className={fieldInput} placeholder="Street, city, postcode" value={form.address} onChange={(e) => setForm((prev) => ({ ...prev, address: e.target.value }))} />
          </FormField>
          <FormField label="Password" icon={<Lock className="h-4 w-4" />}>
            <input
              type={showPw ? "text" : "password"}
              autoComplete="new-password"
              className={cn(fieldInput, "pr-12")}
              placeholder="Choose a password (8+ characters)"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <button
              type="button"
              onClick={() => setShowPw((s) => !s)}
              className="absolute right-1 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-xl text-foreground/50 transition-colors hover:bg-muted hover:text-foreground"
              aria-label={showPw ? "Hide password" : "Show password"}
            >
              {showPw ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
            </button>
          </FormField>

          <FormField label="Bio" multiline trailing={<span className="text-xs font-medium text-foreground/45">Optional</span>}>
            <textarea
              rows={3}
              className={cn(fieldInput, "resize-none py-0.5")}
              placeholder="Tell swappers about your style…"
              value={form.bio}
              onChange={(e) => setForm((prev) => ({ ...prev, bio: e.target.value }))}
            />
          </FormField>

          {/* Terms & policy — required */}
          <label
            className={cn(
              "group flex cursor-pointer items-start gap-3 rounded-2xl border border-border bg-muted/30 p-3.5 transition-all duration-200",
              agree ? "border-brand/50 bg-brand/[0.04]" : "hover:border-brand/40",
              agreeError && "border-destructive/50 bg-destructive/5",
            )}
          >
            <span className="relative mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-md border border-foreground/20 bg-background transition-all duration-200 has-[:checked]:border-brand has-[:checked]:bg-brand">
              <input type="checkbox" className="peer absolute inset-0 cursor-pointer opacity-0" checked={agree} onChange={(e) => { setAgree(e.target.checked); if (e.target.checked) setAgreeError(null); }} />
              <Check className="h-3.5 w-3.5 text-brand-foreground opacity-0 transition-opacity peer-checked:opacity-100" />
            </span>
            <span className="text-sm text-foreground/70">
              I have read and agree to the{" "}
              <Link to="/terms" target="_blank" className="font-semibold text-brand underline underline-offset-2 hover:opacity-80">
                Terms of Service
              </Link>{" "}
              and{" "}
              <Link to="/privacy" target="_blank" className="font-semibold text-brand underline underline-offset-2 hover:opacity-80">
                Privacy Policy
              </Link>.
            </span>
          </label>
          {agreeError && <p role="alert" className="-mt-2 animate-fade-in text-xs text-destructive">{agreeError}</p>}

          {error && <p role="alert" className="animate-fade-in text-xs text-destructive">{error}</p>}
          <SubmitButton loading={busy}>Finish & enter Swapt</SubmitButton>
        </form>
      </div>
    </div>
  );
}

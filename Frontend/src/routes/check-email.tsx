import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Clock, MailCheck, RefreshCw, ShieldCheck, Sparkles } from "lucide-react";
import { AuthShell } from "@/components/site/AuthShell";
import { devVerify, resendVerification, verifyEmail } from "@/lib/auth-api";
import { useAuth } from "@/lib/auth-context";

export const Route = createFileRoute("/check-email")({
  validateSearch: (search: Record<string, unknown>): { email?: string } =>
    typeof search.email === "string" && search.email.length > 0 ? { email: search.email } : {},
  head: () => ({
    meta: [
      { title: "Check your email — Swapt" },
      { name: "description", content: "Confirm your Swapt email address to activate your account." },
    ],
  }),
  component: CheckEmailPage,
});

function CheckEmailPage() {
  const { email } = Route.useSearch();
  const navigate = useNavigate();
  const { refresh } = useAuth();
  const [resending, setResending] = useState(false);
  const [resent, setResent] = useState(false);
  const [devToken, setDevToken] = useState<string | null>(null);
  const [devBusy, setDevBusy] = useState(false);
  const [devError, setDevError] = useState<string | null>(null);

  useEffect(() => {
    if (!email) return;
    try {
      const token = sessionStorage.getItem(`swapt.devToken:${email}`);
      if (token) setDevToken(token);
    } catch { /* ignore */ }
  }, [email]);

  const resend = async () => {
    if (!email || resending) return;
    setResending(true);
    setResent(false);
    try {
      await resendVerification(email);
      setResent(true);
    } catch {
      /* best-effort */
    } finally {
      setResending(false);
    }
  };

  const doDevVerify = async () => {
    if (!email || devBusy) return;
    setDevBusy(true);
    setDevError(null);
    try {
      // Prefer direct token verify if available, fallback to dev-verify endpoint
      if (devToken) {
        await verifyEmail(devToken);
      } else {
        await devVerify(email);
      }
      await refresh();
      void navigate({ to: "/dashboard", search: { welcome: true } });
    } catch (err) {
      setDevError(err instanceof Error ? err.message : "Verification failed");
      // Fallback to devVerify endpoint
      try {
        await devVerify(email);
        await refresh();
        void navigate({ to: "/dashboard", search: { welcome: true } });
      } catch { /* ignore */ }
    } finally {
      setDevBusy(false);
    }
  };

  return (
    <AuthShell
      title="Almost there"
      subtitle="One last step to activate your account."
      footer={
        <>
          Already verified?{" "}
          <Link to="/login" className="font-semibold text-brand hover:underline">
            Log in
          </Link>
        </>
      }
    >
      <div className="animate-fade-in space-y-4 text-center">
        <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-brand/10">
          <MailCheck className="h-8 w-8 text-brand" />
        </div>

        <div>
          <h2 className="text-lg font-bold text-foreground">Check your email 📬</h2>
          <p className="mt-2 text-sm text-foreground/60">
            We sent a verification link to{" "}
            <span className="font-semibold text-foreground">{email ?? "your email"}</span>. Click it to
            activate your account — you&apos;ll be signed in automatically.
          </p>
          <p className="mt-2 flex items-center justify-center gap-1.5 text-xs text-foreground/50">
            <Clock className="h-3 w-3" /> Link expires in 24 hours · check spam folder too
          </p>
        </div>

        <div className="flex flex-col gap-3">
          <button
            type="button"
            onClick={resend}
            disabled={resending || !email}
            className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-border bg-background px-4 py-2.5 text-sm font-semibold transition-colors hover:bg-muted disabled:opacity-60"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${resending ? "animate-spin" : ""}`} />
            {resent ? "Email sent — check your inbox" : "Resend verification email"}
          </button>

          {(devToken || email) && (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-left">
              <p className="flex items-center gap-1.5 text-xs font-bold text-amber-800">
                <ShieldCheck className="h-3.5 w-3.5" /> Having trouble with email?
              </p>
              <p className="mt-1 text-xs leading-relaxed text-amber-700/80">
                In development you can verify instantly without checking your inbox.
              </p>
              <button
                onClick={doDevVerify}
                disabled={devBusy}
                className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-amber-600 px-4 py-2.5 text-sm font-bold text-white shadow-md transition-all hover:-translate-y-0.5 hover:bg-amber-700 disabled:opacity-60"
              >
                <Sparkles className="h-4 w-4" />
                {devBusy ? "Verifying…" : "Verify instantly & continue →"}
              </button>
              {devError && <p className="mt-2 text-xs text-rose-600">{devError}</p>}
            </div>
          )}
        </div>
      </div>
    </AuthShell>
  );
}

import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2, MailCheck, MailX } from "lucide-react";
import { AuthShell } from "@/components/site/AuthShell";
import { useAuth } from "@/lib/auth-context";
import { verifyEmail } from "@/lib/auth-api";

export const Route = createFileRoute("/verify-email")({
  head: () => ({
    meta: [
      { title: "Verify your email — Swapt" },
      { name: "description", content: "Confirm your Swapt email address to activate your account." },
    ],
  }),
  component: VerifyEmailPage,
});

function VerifyEmailPage() {
  const navigate = useNavigate();
  const { refresh } = useAuth();
  const [state, setState] = useState<"loading" | "success" | "error">("loading");
  const [message, setMessage] = useState("");

  useEffect(() => {
    let alive = true;
    const token = new URLSearchParams(window.location.search).get("token") ?? "";
    (async () => {
      try {
        const res = await verifyEmail(token);
        if (!alive) return;
        if (res.ok) {
          setState("success");
          await refresh();
        } else {
          setState("error");
          setMessage("We couldn't confirm that link. It may have expired.");
        }
      } catch (err) {
        if (!alive) return;
        setState("error");
        setMessage(
          err instanceof Error && err.message
            ? err.message
            : "This verification link is invalid or has expired.",
        );
      }
    })();
    return () => {
      alive = false;
    };
  }, [refresh]);

  return (
    <AuthShell
      title="Email verification"
      subtitle="Confirming your Swapt account."
      footer={
        state === "success" ? (
          <Link to="/dashboard" className="font-semibold text-brand hover:underline">
            Go to your dashboard →
          </Link>
        ) : (
          <>
            Already verified?{" "}
            <Link to="/login" className="font-semibold text-brand hover:underline">
              Log in
            </Link>
          </>
        )
      }
    >
      <div className="animate-fade-in space-y-4 text-center">
        {state === "loading" && (
          <>
            <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-muted">
              <Loader2 className="h-8 w-8 animate-spin text-brand" />
            </div>
            <p className="text-sm text-foreground/60">Verifying your email…</p>
          </>
        )}

        {state === "success" && (
          <>
            <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-emerald-100 text-emerald-600">
              <MailCheck className="h-8 w-8" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-foreground">Email verified 🎉</h2>
              <p className="mt-2 text-sm text-foreground/60">
                Your account is active. Head to your dashboard to start listing and swapping.
              </p>
            </div>
            <button
              onClick={() => void navigate({ to: "/dashboard" })}
              className="w-full rounded-xl bg-gradient-to-r from-brand to-brand/85 py-3 text-sm font-bold text-brand-foreground shadow-lg shadow-brand/20 transition-transform hover:-translate-y-0.5"
            >
              Go to dashboard
            </button>
          </>
        )}

        {state === "error" && (
          <>
            <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-rose-100 text-rose-600">
              <MailX className="h-8 w-8" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-foreground">Link expired or invalid</h2>
              <p className="mt-2 text-sm text-foreground/60">{message}</p>
              <p className="mt-2 text-xs text-foreground/45">
                Request a fresh one from the login page or by signing up again.
              </p>
            </div>
          </>
        )}
      </div>
    </AuthShell>
  );
}

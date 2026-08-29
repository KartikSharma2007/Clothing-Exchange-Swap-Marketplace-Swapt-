import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ArrowLeft } from "lucide-react";
import { AuthShell, Field, SubmitButton, inputCls } from "@/components/site/AuthShell";
import { requestPasswordReset, resetPassword } from "@/lib/auth-api";
import { ApiError } from "@/lib/api";

const requestSchema = z.object({
  email: z.string().trim().min(1, "Email is required").email("Enter a valid email").max(255),
});

const resetSchema = z
  .object({
    password: z.string().min(8, "Password must be at least 8 characters"),
    confirmPassword: z.string().min(8, "Password confirmation is required"),
  })
  .refine((data) => data.password === data.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords must match",
  });

export const Route = createFileRoute("/forgot")({
  validateSearch: (search: Record<string, unknown>) => ({
    token: (search.token as string | undefined) ?? undefined,
    from: (search.from as string | undefined) ?? undefined,
    tab: (search.tab as string | undefined) ?? undefined,
  }),
  head: () => ({
    meta: [
      { title: "Reset password — Swapt" },
      { name: "description", content: "Reset your account password or request a password reset email." },
      { property: "og:title", content: "Reset password — Swapt" },
      { property: "og:description", content: "Reset your Swapt password or request reset instructions." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ForgotPasswordPage,
});

type RequestFormValues = z.infer<typeof requestSchema>;
type ResetFormValues = z.infer<typeof resetSchema>;

function ForgotPasswordPage() {
  const { token, from, tab } = Route.useSearch() as { token?: string; from?: string; tab?: string };
  const [rootError, setRootError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const requestForm = useForm<RequestFormValues>({
    resolver: zodResolver(requestSchema),
    mode: "onBlur",
    defaultValues: { email: "" },
  });

  const resetForm = useForm<ResetFormValues>({
    resolver: zodResolver(resetSchema),
    mode: "onBlur",
    defaultValues: { password: "", confirmPassword: "" },
  });

  const onRequestSubmit = async (values: RequestFormValues) => {
    setRootError(null);
    setSuccessMessage(null);
    try {
      await requestPasswordReset(values.email);
      setSuccessMessage("If that email exists, we sent reset instructions. Check your inbox.");
    } catch (err) {
      setRootError(err instanceof ApiError || err instanceof Error ? err.message : "Unable to send reset email.");
    }
  };

  const onResetSubmit = async (values: ResetFormValues) => {
    setRootError(null);
    setSuccessMessage(null);
    if (!token) {
      setRootError("Reset token is missing or invalid.");
      return;
    }
    try {
      await resetPassword(token, values.password);
      setSuccessMessage("Your password has been updated. You can now log in with your new password.");
    } catch (err) {
      setRootError(err instanceof ApiError || err instanceof Error ? err.message : "Unable to reset your password.");
    }
  };

  const isFromSettings = from === "settings";
  const backToSettingsTab = (tab as string) || "security";
  return (
    <AuthShell
      title={token ? "Set a new password" : "Forgot your password?"}
      subtitle={
        token
          ? "Choose a new password for your Swapt account."
          : "Enter your email and we’ll send secure reset instructions."
      }
      footer={
        isFromSettings ? (
          <>Back to <Link to="/settings" search={{ tab: backToSettingsTab } as any} className="font-semibold text-brand hover:underline">Settings</Link></>
        ) : token ? (
          <>
            Remembered it? <Link to="/login" className="font-semibold text-brand hover:underline">Sign in</Link>
          </>
        ) : (
          <>Back to <Link to="/login" className="font-semibold text-brand hover:underline">Log in</Link></>
        )
      }
    >
      {isFromSettings && (
        <Link to="/settings" search={{ tab: backToSettingsTab } as any} className="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-foreground/60 hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Back to settings
        </Link>
      )}
      {successMessage && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {successMessage}
        </div>
      )}

      {token ? (
        <form onSubmit={resetForm.handleSubmit(onResetSubmit)} noValidate className="space-y-4">
          <Field label="New password" error={resetForm.formState.errors.password?.message}>
            <input
              type="password"
              autoComplete="new-password"
              aria-invalid={!!resetForm.formState.errors.password}
              className={inputCls(!!resetForm.formState.errors.password)}
              {...resetForm.register("password")}
            />
          </Field>

          <Field
            label="Confirm password"
            error={resetForm.formState.errors.confirmPassword?.message}
          >
            <input
              type="password"
              autoComplete="new-password"
              aria-invalid={!!resetForm.formState.errors.confirmPassword}
              className={inputCls(!!resetForm.formState.errors.confirmPassword)}
              {...resetForm.register("confirmPassword")}
            />
          </Field>

          {rootError && (
            <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {rootError}
            </div>
          )}

          <SubmitButton loading={resetForm.formState.isSubmitting}>Reset password</SubmitButton>
        </form>
      ) : (
        <form onSubmit={requestForm.handleSubmit(onRequestSubmit)} noValidate className="space-y-4">
          <Field label="Email" error={requestForm.formState.errors.email?.message}>
            <input
              type="email"
              autoComplete="email"
              aria-invalid={!!requestForm.formState.errors.email}
              className={inputCls(!!requestForm.formState.errors.email)}
              {...requestForm.register("email")}
            />
          </Field>

          {rootError && (
            <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {rootError}
            </div>
          )}

          <SubmitButton loading={requestForm.formState.isSubmitting}>Send reset email</SubmitButton>
        </form>
      )}
    </AuthShell>
  );
}

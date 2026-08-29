import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, BadgeCheck, Check, Clock, Headset, Loader2, Mail, MapPin, MessageSquare, Phone, RefreshCw, Send, ShieldAlert, Sparkles } from "lucide-react";
import { Navbar } from "@/components/site/Navbar";
import { Footer } from "@/components/site/Footer";
import { useAuth } from "@/lib/auth-context";
import { FormField, fieldInput } from "@/components/site/FormField";
import { sendContactMessage, type ContactResult } from "@/lib/contact-api";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/contact")({
  head: () => ({
    meta: [
      { title: "Contact support — Swapt" },
      { name: "description", content: "Need help with a deactivated account, a swap or payments? Get in touch with Swapt support." },
      { property: "og:title", content: "Contact support — Swapt" },
      { property: "og:description", content: "Get help with your Swapt account, swaps and more." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ContactPage,
});

const TOPICS = [
  "Recover a deactivated account",
  "Suspended or banned account",
  "Problem with a swap",
  "Payments & swap credits",
  "Shipping & delivery",
  "Report a bug",
  "Feedback or other",
] as const;

function ContactPage() {
  const { user } = useAuth();
  const [name, setName] = useState(user?.displayName ?? user?.name ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [topic, setTopic] = useState<string>(TOPICS[0]);
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "done" | "error">("idle");
  const [ticket, setTicket] = useState<ContactResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (user?.displayName && !name) setName(user.displayName);
    if (user?.email && !email) setEmail(user.email);
  }, [user]);

  const supportEmail = (import.meta.env.VITE_SUPPORT_EMAIL as string | undefined) || "support@swapt.example";
  const valid = email.trim().length > 0 && email.includes("@") && message.trim().length >= 10;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid || status === "sending") return;
    setStatus("sending");
    setErrorMsg(null);
    try {
      const result = await sendContactMessage({ name: name.trim(), email: email.trim(), topic, message: message.trim() });
      setTicket(result);
      setStatus("done");
    } catch {
      setStatus("error");
      setErrorMsg("We couldn't send your message. Try again, or email us directly using the link below.");
    }
  };

  const reset = () => {
    setStatus("idle");
    setTicket(null);
    setMessage("");
    setErrorMsg(null);
  };

  const mailtoFallback = () => {
    const subject = encodeURIComponent(`[${topic}] Support request from Swapt`);
    const body = encodeURIComponent(`Name: ${name}\nEmail: ${email}\n\n${message}`);
    window.location.href = `mailto:${supportEmail}?subject=${subject}&body=${body}`;
  };

  return (
    <div className="min-h-dvh bg-background">
      <Navbar />
      <main id="main-content" tabIndex={-1} className="mx-auto w-full max-w-5xl px-4 pb-16 pt-6 md:px-8 md:pt-10">
        <Link
          to="/"
          className="group mb-6 inline-flex items-center gap-2 rounded-full border border-border bg-card/80 px-3.5 py-2 text-sm font-semibold text-foreground/80 backdrop-blur transition-all duration-200 hover:-translate-y-0.5 hover:bg-muted hover:text-foreground hover:shadow-md"
        >
          <span className="grid h-6 w-6 place-items-center rounded-full bg-muted transition-colors group-hover:bg-brand group-hover:text-brand-foreground">
            <ArrowLeft className="h-3.5 w-3.5" />
          </span>
          Back to home
        </Link>

        {/* Hero */}
        <div className="relative overflow-hidden rounded-3xl border border-border bg-card px-5 py-8 shadow-sm md:px-8 md:py-10">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_60%_at_100%_0%,rgba(224,53,58,0.10),transparent_60%),radial-gradient(45%_50%_at_0%_100%,rgba(224,53,58,0.06),transparent_60%)]" />
          <span className="inline-flex items-center gap-1.5 rounded-full border border-brand/25 bg-brand/10 px-3 py-2 text-sm min-h-9 font-bold text-brand">
            <Headset className="h-3.5 w-3.5" /> We reply within 24–48 hours
          </span>
          <h1 className="mt-3 text-3xl font-black tracking-tight md:text-4xl">Contact support</h1>
          <p className="mt-2 max-w-xl text-sm text-foreground/60 md:text-base">
            Deactivated your account or lost access? Send us a message and our team will help you recover it — or
            anything else you need.
          </p>
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
          {/* ── Form / success ───────────────────────────────────────── */}
          <section className="rounded-3xl border border-border bg-card p-5 shadow-sm md:p-7">
            {status === "done" && ticket ? (
              <div className="animate-scale-in flex flex-col items-center py-8 text-center">
                <span className="grid h-16 w-16 place-items-center rounded-full bg-emerald-100 text-emerald-600">
                  <Check className="h-8 w-8" />
                </span>
                <h2 className="mt-5 text-2xl font-black tracking-tight">Message sent!</h2>
                <p className="mt-2 max-w-sm text-sm text-foreground/60">
                  Thanks for reaching out. Your ticket is <span className="font-bold text-foreground">{ticket.ticketId}</span> —
                  we&apos;ll get back to you at <span className="font-semibold">{email}</span> within 24–48 hours.
                </p>
                <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
                  <button
                    onClick={reset}
                    className="inline-flex items-center gap-2 rounded-xl border border-border px-4 py-2.5 text-sm font-semibold transition-all hover:-translate-y-0.5 hover:bg-muted"
                  >
                    <RefreshCw className="h-4 w-4" /> Send another
                  </button>
                  <Link
                    to="/"
                    className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-brand to-brand/85 px-4 py-2.5 text-sm font-bold text-brand-foreground shadow-lg shadow-brand/25 transition-all hover:-translate-y-0.5"
                  >
                    Back to home
                  </Link>
                </div>
              </div>
            ) : (
              <form onSubmit={submit} className="space-y-5">
                <div className="flex items-center gap-3">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-brand/10">
                    <MessageSquare className="h-5 w-5 text-brand" />
                  </span>
                  <div>
                    <h2 className="text-lg font-black tracking-tight">Send us a message</h2>
                    <p className="text-xs text-foreground/55">The more detail you add, the faster we can help.</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <FormField label="Your name">
                    <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Maya Singh" className={fieldInput} />
                  </FormField>
                  <FormField label="Email" icon={<Mail className="h-4 w-4" />}>
                    <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" className={fieldInput} />
                  </FormField>
                </div>

                <FormField label="What's this about?" icon={<ShieldAlert className="h-4 w-4" />}>
                  <select value={topic} onChange={(e) => setTopic(e.target.value)} className={fieldInput}>
                    {TOPICS.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </FormField>

                <FormField label="Message" multiline>
                  <textarea
                    rows={6}
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder="Tell us what happened — include the email on your account if you're recovering it."
                    className={cn(fieldInput, "resize-none py-0.5")}
                  />
                </FormField>

                {status === "error" && (
                  <div className="animate-fade-in flex flex-col gap-2 rounded-2xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                    <span>{errorMsg}</span>
                    <button type="button" onClick={mailtoFallback} className="w-fit text-xs font-bold text-brand underline underline-offset-2">
                      Open your email app instead
                    </button>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={!valid || status === "sending"}
                  className="group flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-brand to-brand/85 py-3.5 text-sm font-bold text-brand-foreground shadow-lg shadow-brand/25 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-xl hover:shadow-brand/35 active:translate-y-0 disabled:opacity-60 disabled:hover:translate-y-0"
                >
                  {status === "sending" ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                  )}
                  {status === "sending" ? "Sending…" : "Send message"}
                </button>
                <p className="text-center text-xs font-medium text-foreground/40">
                  By sending, you agree we may email you about this request.
                </p>
              </form>
            )}
          </section>

          {/* ── Other ways to reach us ───────────────────────────────── */}
          <aside className="space-y-5">
            {/* Deactivated account card */}
            <div className="rounded-3xl border border-brand/20 bg-brand/[0.04] p-5">
              <h3 className="flex items-center gap-2 text-sm font-black">
                <BadgeCheck className="h-4 w-4 text-brand" /> Deactivated account?
              </h3>
              <p className="mt-1.5 text-xs leading-relaxed text-foreground/60">
                If you deleted your account and want it back, send a message from the form with the email you signed up
                with. We&apos;ll verify your identity and restore access.
              </p>
            </div>

            <div className="rounded-3xl border border-border bg-card p-5 shadow-sm">
              <h3 className="text-sm font-black">Other ways to reach us</h3>
              <ul className="mt-3 space-y-3">
                <li className="flex items-start gap-3">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-muted text-foreground/60">
                    <Mail className="h-4 w-4" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-xs font-bold uppercase tracking-wider text-foreground/45">Email</p>
                    <a href={`mailto:${supportEmail}`} className="break-all text-sm font-semibold text-brand hover:underline">
                      {supportEmail}
                    </a>
                  </div>
                </li>
                <li className="flex items-start gap-3">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-muted text-foreground/60">
                    <Clock className="h-4 w-4" />
                  </span>
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wider text-foreground/45">Response time</p>
                    <p className="text-sm font-semibold">24–48 hours, 7 days a week</p>
                  </div>
                </li>
                <li className="flex items-start gap-3">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-muted text-foreground/60">
                    <Phone className="h-4 w-4" />
                  </span>
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wider text-foreground/45">Phone</p>
                    <p className="text-sm font-semibold">+1 (555) 010-8420</p>
                    <p className="text-xs text-foreground/50">Mon–Fri, 9am–6pm ET</p>
                  </div>
                </li>
                <li className="flex items-start gap-3">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-muted text-foreground/60">
                    <MapPin className="h-4 w-4" />
                  </span>
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wider text-foreground/45">HQ</p>
                    <p className="text-sm font-semibold">Swapt HQ, 128 Market St</p>
                    <p className="text-xs text-foreground/50">London, UK</p>
                  </div>
                </li>
              </ul>
            </div>

            {/* Help links */}
            <div className="rounded-3xl border border-border bg-card p-5 shadow-sm">
              <h3 className="flex items-center gap-2 text-sm font-black">
                <Sparkles className="h-4 w-4 text-brand" /> Quick help
              </h3>
              <ul className="mt-3 space-y-2 text-sm">
                <li><Link to="/forgot" className="font-semibold text-brand hover:underline">I forgot my password</Link></li>
                <li><Link to="/signup" className="font-semibold text-brand hover:underline">Create a new account</Link></li>
                <li><Link to="/login" className="font-semibold text-brand hover:underline">Back to login</Link></li>
              </ul>
            </div>
          </aside>
        </div>
      </main>
      <Footer />
    </div>
  );
}
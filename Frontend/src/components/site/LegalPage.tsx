import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { ArrowLeft, FileText, Scale } from "lucide-react";
import { Navbar } from "@/components/site/Navbar";
import { Footer } from "@/components/site/Footer";

export type LegalSection = {
  id: string;
  title: string;
  body: ReactNode;
};

type Props = {
  icon: "terms" | "privacy";
  title: string;
  description: string;
  updated: string;
  sections: LegalSection[];
};

/**
 * Shared layout for legal documents (Terms, Privacy). Renders a sticky table
 * of contents on large screens and a swipeable section nav on mobile, with
 * the document styled for comfortable long-form reading.
 */
export function LegalPage({ icon, title, description, updated, sections }: Props) {
  return (
    <div className="min-h-dvh bg-background">
      <Navbar />
      <main className="mx-auto w-full max-w-6xl px-4 pb-16 pt-6 md:px-8 md:pt-10">
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
        <header className="relative overflow-hidden rounded-3xl border border-border bg-card px-5 py-8 shadow-sm md:px-8 md:py-10">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_60%_at_100%_0%,rgba(224,53,58,0.10),transparent_60%),radial-gradient(45%_50%_at_0%_100%,rgba(224,53,58,0.06),transparent_60%)]" />
          <span className="inline-flex items-center gap-1.5 rounded-full border border-brand/25 bg-brand/10 px-3 py-2 text-sm min-h-9 font-bold text-brand">
            {icon === "terms" ? <Scale className="h-3.5 w-3.5" /> : <FileText className="h-3.5 w-3.5" />}
            Last updated {updated}
          </span>
          <h1 className="mt-3 text-3xl font-black tracking-tight md:text-4xl">{title}</h1>
          <p className="mt-2 max-w-2xl text-sm text-foreground/60 md:text-base">{description}</p>
        </header>

        <div className="mt-6 grid gap-8 lg:grid-cols-[220px_minmax(0,1fr)]">
          {/* Table of contents */}
          <aside className="lg:sticky lg:top-6 lg:self-start">
            <p className="mb-2 hidden text-xs font-bold uppercase tracking-wider text-foreground/45 lg:block">
              On this page
            </p>
            {/* Mobile: swipeable chips */}
            <nav className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-2 lg:mx-0 lg:flex-col lg:gap-1.5 lg:overflow-visible lg:px-0 lg:pb-0">
              {sections.map((s, i) => (
                <a
                  key={s.id}
                  href={`#${s.id}`}
                  className="shrink-0 rounded-full border border-border bg-card px-3.5 py-2.5 text-sm min-h-11 font-semibold text-foreground/70 transition-colors hover:border-brand/40 hover:text-brand lg:shrink lg:rounded-xl lg:border-0 lg:bg-transparent lg:px-3 lg:py-2 lg:text-sm"
                >
                  <span className="hidden lg:inline lg:text-brand">{i + 1}.</span> {s.title}
                </a>
              ))}
            </nav>
          </aside>

          {/* Document body */}
          <article className="min-w-0 space-y-10">
            {sections.map((s, i) => (
              <section key={s.id} id={s.id} className="scroll-mt-24">
                <h2 className="flex items-baseline gap-3 border-b border-border pb-3 text-xl font-black tracking-tight md:text-2xl">
                  <span className="text-brand">{String(i + 1).padStart(2, "0")}</span>
                  {s.title}
                </h2>
                <div className="mt-4 space-y-4 text-[15px] leading-relaxed text-foreground/75">{s.body}</div>
              </section>
            ))}

            <p className="rounded-2xl border border-border bg-muted/50 px-4 py-3 text-xs text-foreground/55">
              Questions about this document? Email{" "}
              <a
                href="mailto:support@swapt.example"
                className="font-semibold text-brand underline underline-offset-2 hover:opacity-80"
              >
                support@swapt.example
              </a>{" "}
              or{" "}
              <Link to="/contact" className="font-semibold text-brand underline underline-offset-2 hover:opacity-80">
                contact support
              </Link>.
            </p>
          </article>
        </div>
      </main>
      <Footer />
    </div>
  );
}

/** Inline lead paragraph helper for section bodies. */
export function Lead({ children }: { children: ReactNode }) {
  return <p className="text-foreground/85">{children}</p>;
}

/** Definition list rows (e.g. "Data · How we use it"). */
export function DefList({ rows }: { rows: { term: string; detail: ReactNode }[] }) {
  return (
    <dl className="divide-y divide-border rounded-2xl border border-border bg-card">
      {rows.map((r) => (
        <div key={r.term} className="grid gap-1 px-4 py-3 sm:grid-cols-[200px_minmax(0,1fr)] sm:gap-4">
          <dt className="text-sm font-bold text-foreground">{r.term}</dt>
          <dd className="text-sm leading-relaxed text-foreground/70">{r.detail}</dd>
        </div>
      ))}
    </dl>
  );
}
import { createFileRoute, Link } from "@tanstack/react-router";
import { LegalPage, Lead, DefList } from "@/components/site/LegalPage";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "Privacy Policy — Swapt" },
      { name: "description", content: "How Swapt collects, uses and protects your personal information." },
      { property: "og:title", content: "Privacy Policy — Swapt" },
      { property: "og:description", content: "We protect your personal data. Read how on Swapt." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PrivacyPage,
});

function PrivacyPage() {
  return (
    <LegalPage
      icon="privacy"
      title="Privacy Policy"
      description="Your privacy matters. Here's what we collect, why we collect it, and the control you keep over your data."
      updated="14 August 2026"
      sections={[
        {
          id: "intro",
          title: "Our promise",
          body: (
            <>
              <Lead>We collect only what Swapt needs to work, we never sell your data, and you stay in control.</Lead>
              <p>
                This policy explains how Swapt ("we") handles the personal information of people who use our platform
                to list, discover and swap preloved clothing. By using Swapt, you agree to the practices described
                here.
              </p>
            </>
          ),
        },
        {
          id: "collect",
          title: "What we collect",
          body: (
            <>
              <Lead>Depending on how you use Swapt, we collect the following:</Lead>
              <DefList
                rows={[
                  {
                    term: "Account information",
                    detail: (
                      <>
                        Your name, email, phone number, address, age and password (stored encrypted). If you sign in
                        with Google, we use the name and email your Google account shares.
                      </>
                    ),
                  },
                  {
                    term: "Profile & content",
                    detail: (
                      <>
                        Your profile photo, bio, location, the listings you post (photos, descriptions, sizes, prices)
                        and any messages you send through the platform.
                      </>
                    ),
                  },
                  {
                    term: "Swap & payment activity",
                    detail: (
                      <>
                        Your swap history, swap credits balance, reviews you give and receive, and dispute or support
                        records.
                      </>
                    ),
                  },
                  {
                    term: "Technical data",
                    detail: (
                      <>
                        IP address, device and browser type, and how you use the app — so we can keep things fast and
                        secure.
                      </>
                    ),
                  },
                ]}
              />
            </>
          ),
        },
        {
          id: "use",
          title: "How we use it",
          body: (
            <>
              <Lead>Every use of your data maps to making Swapt work for you.</Lead>
              <ul className="list-disc space-y-1.5 pl-5 marker:text-brand">
                <li>Create and secure your account, and let you sign in.</li>
                <li>Run listings, swap matching, messaging and shipping estimates.</li>
                <li>Connect you with nearby swappers and personalise recommendations.</li>
                <li>Detect fraud, abuse and prohibited items, and resolve disputes.</li>
                <li>Send service messages, swap updates and — only with your permission — push notifications.</li>
                <li>Improve the platform through aggregated, anonymised analytics.</li>
              </ul>
            </>
          ),
        },
        {
          id: "share",
          title: "What we share",
          body: (
            <>
              <Lead>We never sell your personal information. Sharing only happens to run the service.</Lead>
              <DefList
                rows={[
                  {
                    term: "Other members",
                    detail: (
                      <>
                        When you propose or accept a swap, the other member sees your public profile, location and the
                        details needed to complete the exchange.
                      </>
                    ),
                  },
                  {
                    term: "Service providers",
                    detail: (
                      <>
                        Trusted providers who host our servers, send emails or handle payments process data under our
                        instruction and never for their own use.
                      </>
                    ),
                  },
                  {
                    term: "Legal & safety",
                    detail: (
                      <>
                        We may disclose information where required by law, or to protect the safety and rights of our
                        members and the public.
                      </>
                    ),
                  },
                ]}
              />
            </>
          ),
        },
        {
          id: "cookies",
          title: "Cookies & storage",
          body: (
            <>
              <Lead>Small files that help Swapt remember you and keep you signed in.</Lead>
              <p>
                We use cookies and similar storage for essential functions like staying logged in, and for
                non-essential analytics with your consent where required. You can clear cookies in your browser at any
                time — you may just need to sign in again.
              </p>
            </>
          ),
        },
        {
          id: "location",
          title: "Location data",
          body: (
            <>
              <Lead>Location powers nearby swaps.</Lead>
              <p>
                Your listed location (city or area) is shown on your public profile and used to surface swaps near you.
                If you share your precise device location, it is used only to show nearby listings and never displayed
                to other members without your action.
              </p>
            </>
          ),
        },
        {
          id: "rights",
          title: "Your rights",
          body: (
            <>
              <Lead>You can access, correct or delete your data whenever you like.</Lead>
              <ul className="list-disc space-y-1.5 pl-5 marker:text-brand">
                <li>
                  <span className="font-semibold">Access & correct</span> — update your profile and settings, or ask us
                  for a copy of your data.
                </li>
                <li>
                  <span className="font-semibold">Export</span> — request your data in a portable format.
                </li>
                <li>
                  <span className="font-semibold">Delete</span> — deactivate your account in Settings, or ask us to
                  erase your data. Some records may be kept where the law requires.
                </li>
                <li>
                  <span className="font-semibold">Object & restrict</span> — ask us to stop certain processing, such as
                  personalised recommendations.
                </li>
              </ul>
              <p>
                To exercise any of these rights, visit{" "}
                <Link to="/contact" className="font-semibold text-brand underline underline-offset-2 hover:opacity-80">
                  Contact support
                </Link>{" "}
                — we&apos;ll respond within 30 days.
              </p>
            </>
          ),
        },
        {
          id: "security",
          title: "How we protect data",
          body: (
            <>
              <Lead>We use industry-standard safeguards to keep your information safe.</Lead>
              <p>
                Passwords are hashed, data is encrypted in transit, and access is limited to the people and systems
                that genuinely need it. No system is perfectly secure — if you believe your account is compromised,
                reset your password and tell us right away.
              </p>
            </>
          ),
        },
        {
          id: "retention",
          title: "How long we keep it",
          body: (
            <>
              <Lead>We keep data only as long as your account is active, plus a short safety margin.</Lead>
              <p>
                If you deactivate your account, we retain the minimum data needed to honour our legal obligations and
                to help you recover the account if you change your mind. When data is no longer needed, it is
                securely deleted or anonymised.
              </p>
            </>
          ),
        },
        {
          id: "children",
          title: "Children",
          body: (
            <>
              <Lead>Swapt is for people aged 13 and over.</Lead>
              <p>
                We do not knowingly collect personal information from children under 13. If you believe a child under
                13 has given us data, contact us and we&apos;ll delete it promptly.
              </p>
            </>
          ),
        },
        {
          id: "changes",
          title: "Changes to this policy",
          body: (
            <>
              <Lead>We&apos;ll tell you before things change.</Lead>
              <p>
                If we make material changes to how we handle your data, we&apos;ll notify you in the app or by email.
                Continued use of Swapt after changes means you accept the updated policy.
              </p>
            </>
          ),
        },
      ]}
    />
  );
}
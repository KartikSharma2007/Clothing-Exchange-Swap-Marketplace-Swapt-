import { createFileRoute, Link } from "@tanstack/react-router";
import { LegalPage, Lead, DefList } from "@/components/site/LegalPage";

export const Route = createFileRoute("/terms")({
  head: () => ({
    meta: [
      { title: "Terms of Service — Swapt" },
      { name: "description", content: "The terms that govern how you use Swapt to list, browse and swap preloved clothing." },
      { property: "og:title", content: "Terms of Service — Swapt" },
      { property: "og:description", content: "The rules of the road for swapping on Swapt." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: TermsPage,
});

function TermsPage() {
  return (
    <LegalPage
      icon="terms"
      title="Terms of Service"
      description="Welcome to Swapt — a marketplace for giving preloved clothes a second life. By using Swapt, you agree to the terms below."
      updated="14 August 2026"
      sections={[
        {
          id: "about",
          title: "What Swapt is",
          body: (
            <>
              <Lead>
                Swapt is an online marketplace where members list clothing and accessories, discover pieces from other
                swappers, and trade items instead of money.
              </Lead>
              <p>
                We provide the platform, the tools (listings, swap matching, messaging, shipping estimates, swap
                credits) and the community rules. We are not the buyer or the seller in any swap — every exchange is
                between two members. "Swapt", "we", "us" or "our" means the operator of this platform. "You" or "your"
                means the person using it.
              </p>
            </>
          ),
        },
        {
          id: "accounts",
          title: "Your account",
          body: (
            <>
              <Lead>You need an account to list or swap. Keep it yours, and keep it accurate.</Lead>
              <ul className="list-disc space-y-1.5 pl-5 marker:text-brand">
                <li>You must be at least 13 years old to use Swapt.</li>
                <li>
                  Provide accurate details — your name, location and contact information help swaps happen safely.
                </li>
                <li>One account per person. Multiple or automated accounts may be removed.</li>
                <li>
                  You are responsible for everything done on your account. Choose a strong password and never share it.
                </li>
                <li>If you deactivate your account, you can request recovery through our support team.</li>
              </ul>
            </>
          ),
        },
        {
          id: "listings",
          title: "Listing items",
          body: (
            <>
              <Lead>You only list things you own and are allowed to give away.</Lead>
              <ul className="list-disc space-y-1.5 pl-5 marker:text-brand">
                <li>Describe items honestly — photos, size, condition, colour and any flaws.</li>
                <li>List each item once. Do not repost listings that have already been swapped.</li>
                <li>
                  Prohibited items include counterfeit goods, weapons, drugs, hazardous materials, and anything illegal.
                </li>
                <li>You confirm you have the right to transfer the item to another member.</li>
              </ul>
            </>
          ),
        },
        {
          id: "swaps",
          title: "Swaps & swap credits",
          body: (
            <>
              <Lead>Swapping is a mutual exchange. Once agreed, follow through.</Lead>
              <DefList
                rows={[
                  {
                    term: "Proposing a swap",
                    detail: (
                      <>
                        Any member can propose a swap on a listing. The listing owner can accept, counter or decline.
                        A swap is only agreed when both members confirm.
                      </>
                    ),
                  },
                  {
                    term: "Swap credits",
                    detail: (
                      <>
                        Credits are Swapt&apos;s internal currency for balancing unequal swaps. Credits have no cash
                        value, cannot be withdrawn, and are non-transferable between accounts.
                      </>
                    ),
                  },
                  {
                    term: "Completing a swap",
                    detail: (
                      <>
                        Ship the agreed items to the agreed address within the timeframe you set, or arrange an
                        in-person meetup. Mark swaps complete once both sides have their items.
                      </>
                    ),
                  },
                  {
                    term: "Disputes",
                    detail: (
                      <>
                        If a swap goes wrong — an item never arrives, or arrives damaged — both members should talk
                        first. Our team can step in to help resolve disputes and may revoke credits or suspend accounts
                        for repeated issues.
                      </>
                    ),
                  },
                ]}
              />
            </>
          ),
        },
        {
          id: "conduct",
          title: "Behaviour on Swapt",
          body: (
            <>
              <Lead>Be kind, be honest, be safe. We have zero tolerance for abuse.</Lead>
              <ul className="list-disc space-y-1.5 pl-5 marker:text-brand">
                <li>No harassment, threats, hate speech or discrimination.</li>
                <li>No fraud, scamming, or misleading listings.</li>
                <li>No sharing contact details to complete transactions off-platform.</li>
                <li>No spamming, fake reviews, or manipulating swap matching.</li>
                <li>Follow our safety guidance — meet in public, verify items, and report suspicious behaviour.</li>
              </ul>
            </>
          ),
        },
        {
          id: "fees",
          title: "Fees & payments",
          body: (
            <>
              <Lead>Listing and swapping is free today. If fees are introduced, we&apos;ll tell you before they apply.</Lead>
              <p>
                We may introduce optional paid features in the future. Any fees will be clearly displayed before you
                confirm the action, and we&apos;ll update these terms in advance.
              </p>
            </>
          ),
        },
        {
          id: "content",
          title: "Your content & our property",
          body: (
            <>
              <Lead>You own your photos and descriptions; we license them to run the service.</Lead>
              <p>
                You keep ownership of the content you post. By posting, you grant Swapt a worldwide, royalty-free
                licence to host, display and distribute that content so we can operate the platform. Our brand, logo and
                site design remain our property.
              </p>
            </>
          ),
        },
        {
          id: "suspension",
          title: "Suspension & deactivation",
          body: (
            <>
              <Lead>We may restrict or close accounts that break these rules.</Lead>
              <ul className="list-disc space-y-1.5 pl-5 marker:text-brand">
                <li>
                  We can suspend or deactivate accounts for violating these terms, breaking the law, or harming the
                  community.
                </li>
                <li>
                  You can deactivate your own account at any time in Settings. A deactivated account can be recovered by
                  contacting support.
                </li>
                <li>If your account is suspended, you can ask support to review the decision.</li>
              </ul>
            </>
          ),
        },
        {
          id: "liability",
          title: "Liability",
          body: (
            <>
              <Lead>We work hard to keep Swapt running, but swaps happen between members.</Lead>
              <p>
                Swapt provides the platform "as is". To the maximum extent permitted by law, we are not liable for
                losses from individual swaps, member conduct, or temporary service interruptions. We will however act
                reasonably to help resolve disputes and protect the community.
              </p>
            </>
          ),
        },
        {
          id: "changes",
          title: "Changes to these terms",
          body: (
            <>
              <Lead>We&apos;ll keep these terms up to date and let you know about big changes.</Lead>
              <p>
                We may revise these terms from time to time. When we make material changes we&apos;ll notify you through
                the app or by email. Continuing to use Swapt after changes means you accept the updated terms.
              </p>
            </>
          ),
        },
        {
          id: "contact",
          title: "Questions",
          body: (
            <>
              <Lead>We&apos;re here to help.</Lead>
              <p>
                If you have questions about these terms, or about your account, visit{" "}
                <Link to="/contact" className="font-semibold text-brand underline underline-offset-2 hover:opacity-80">
                  Contact support
                </Link>{" "}
                and we&apos;ll get back to you within 24–48 hours.
              </p>
            </>
          ),
        },
      ]}
    />
  );
}
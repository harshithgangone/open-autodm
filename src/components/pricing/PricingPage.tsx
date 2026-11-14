"use client";

import { useState, Fragment } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowRight,
  Check,
  CheckCircle2,
  ShieldCheck,
  ShieldAlert,
  Sparkles,
  Zap,
  HelpCircle,
  Menu,
  X,
  ChevronDown,
  Lock,
  CreditCard,
  Calendar,
  Layers,
  Send,
  Video,
  Filter,
  Repeat,
  Info,
} from "lucide-react";
import { LogoMark, LogoWordmark } from "@/components/ui/Logo";
import { ThemeToggle } from "@/components/ui/ThemeToggle";

// Pricing plans definition based on exact owner specifications
const PRICING_PLANS = [
  {
    id: "trial",
    name: "Free Trial",
    badge: "30-Day Evaluation",
    price: "$0",
    period: "for 30 days",
    audience: "Creators exploring comment-to-DM funnels",
    description:
      "Explore Open AutoDM's complete automation pipeline and Traffic Guard safeguards during early access. Access is provisioned by the instance administrator.",
    ctaText: "Request Early Access",
    ctaHref: "/login?plan=trial",
    highlighted: false,
    buttonStyle: "bg-muted text-foreground hover:bg-muted/80 border border-border",
    features: [
      "1 connected Instagram account",
      "30-day early access evaluation",
      "Full comment-to-DM automation for Reels & Posts",
      "Keyword matching & negative word exclusions",
      "Supported shared-Reel DM triggers",
      "Dynamic public comment reply rotation",
      "Cloudflare Workers AI comment reply suggestions",
      "Private DM delivery with link & button attachments",
      "Traffic Guard velocity limits & deduplication lock",
      "Account access provisioned by instance administrator",
    ],
  },
  {
    id: "starter",
    name: "Starter",
    badge: "Individual Creators",
    price: "$5",
    period: "/ month",
    audience: "Individual creators and beginners",
    description:
      "Designed for solo creators, educators, and beginners launching their first reliable Instagram comment-to-DM automation funnels.",
    ctaText: "Choose Starter",
    ctaHref: "/login?plan=starter",
    highlighted: false,
    buttonStyle: "bg-foreground text-background hover:opacity-90",
    features: [
      "1 connected Instagram account",
      "Comment-to-DM automation for Reels and Posts",
      "Exact keyword and phrase matching",
      "Negative keyword exclusions (e.g. support, refund)",
      "Supported shared-Reel DM triggers",
      "Dynamic public reply rotation to prevent spam flags",
      "Cloudflare Workers AI reply suggestion generator",
      "Private DM delivery with links and CTA buttons",
      "Traffic Guard sliding-window rate protection",
      "Full automation draft, pause, and review controls",
    ],
  },
  {
    id: "creator-plus",
    name: "Creator Plus",
    badge: "Advanced Workflow",
    price: "$9",
    period: "/ month",
    audience: "Creators who want the advanced supported automation workflow",
    description:
      "Designed for active creators scaling multi-post campaigns, shared-Reel triggers, dynamic reply rotations, and follow-up message sequences.",
    ctaText: "Choose Creator Plus",
    ctaHref: "/login?plan=creator-plus",
    highlighted: true,
    buttonStyle: "bg-primary text-primary-foreground hover:bg-primary/90 shadow-md shadow-primary/20",
    features: [
      "Up to 3 connected Instagram accounts",
      "All Starter automation capabilities",
      "Advanced Reel, carousel, and post campaign targeting",
      "Multi-variation public comment replies with AI assistance",
      "Supported follow-up message sequence scheduling",
      "Shared-Reel DM trigger matching (Reel shares & story mentions)",
      "Atomic per-user deduplication locks",
      "Traffic Guard comment velocity tracking & protective pause",
      "Real-time execution telemetry and delivery event logs",
      "Draft, review, pause, and active lifecycle controls",
    ],
  },
];

// Feature comparison matrix based strictly on verified codebase capabilities
interface ComparisonRow {
  name: string;
  description: string;
  trial: string | boolean;
  starter: string | boolean;
  creatorPlus: string | boolean;
}

interface ComparisonCategory {
  category: string;
  rows: ComparisonRow[];
}

const COMPARISON_DATA: ComparisonCategory[] = [
  {
    category: "Connected Accounts & Scope",
    rows: [
      {
        name: "Connected Instagram Accounts",
        description: "Official Instagram Professional accounts (Creator or Business) linked to your workspace (planned tier allowances for upcoming self-serve billing)",
        trial: "1 account",
        starter: "1 account",
        creatorPlus: "Up to 3 accounts",
      },
    ],
  },
  {
    category: "Trigger & Media Targeting",
    rows: [
      {
        name: "Comment-to-DM Automation",
        description: "Monitors comments on published media in real time via Meta Graph API webhooks",
        trial: true,
        starter: true,
        creatorPlus: true,
      },
      {
        name: "Post & Reel Targeting",
        description: "Target specific viral Reels, carousel posts, or feed photos, or run globally",
        trial: true,
        starter: true,
        creatorPlus: true,
      },
      {
        name: "Shared-Reel DM Triggers",
        description: "Trigger automations when followers share a Reel via DM or tag your account in Stories",
        trial: true,
        starter: true,
        creatorPlus: true,
      },
      {
        name: "Keyword Inclusion & Phrase Matching",
        description: "Trigger on exact keywords or phrases (e.g. 'GUIDE', 'SEND LINK')",
        trial: true,
        starter: true,
        creatorPlus: true,
      },
      {
        name: "Negative Keyword Exclusions",
        description: "Exclude comments with sensitive words (e.g. 'refund', 'help', 'broken') for human handling",
        trial: true,
        starter: true,
        creatorPlus: true,
      },
    ],
  },
  {
    category: "Messaging & AI Capabilities",
    rows: [
      {
        name: "Dynamic Public Reply Rotation",
        description: "Rotate authentic comment responses to maintain natural organic engagement",
        trial: true,
        starter: true,
        creatorPlus: true,
      },
      {
        name: "AI Reply Suggestions (Llama 3.2)",
        description: "Generate creator-toned comment replies using Cloudflare Workers AI edge inference",
        trial: true,
        starter: true,
        creatorPlus: true,
      },
      {
        name: "Private DM Delivery",
        description: "Deliver links, codes, and resources via official Instagram Messaging API",
        trial: true,
        starter: true,
        creatorPlus: true,
      },
      {
        name: "Action Buttons & URL Links",
        description: "Attach clickable buttons and external resource links directly inside the DM",
        trial: true,
        starter: true,
        creatorPlus: true,
      },
      {
        name: "Follow-Up Message Scheduling",
        description: "Schedule automated follow-up messages within the supported messaging window",
        trial: true,
        starter: true,
        creatorPlus: true,
      },
    ],
  },
  {
    category: "Traffic Guard & Account Safeguards",
    rows: [
      {
        name: "Sliding-Window Rate Limiting",
        description: "Enforce safe delivery windows to help keep your account within platform thresholds",
        trial: true,
        starter: true,
        creatorPlus: true,
      },
      {
        name: "Atomic Deduplication Lock",
        description: "Ensures each user receives your private DM exactly once per post, even on repeated comments",
        trial: true,
        starter: true,
        creatorPlus: true,
      },
      {
        name: "Protective Spike Pause",
        description: "Temporarily pauses automated replies if incoming comment velocity spikes abnormally",
        trial: true,
        starter: true,
        creatorPlus: true,
      },
      {
        name: "Campaign Lifecycle Controls",
        description: "Create draft automations, review rules, pause campaigns, or activate instantly",
        trial: true,
        starter: true,
        creatorPlus: true,
      },
    ],
  },
];

// Billing and trial FAQs
const BILLING_FAQS = [
  {
    question: "How does the 30-day free trial work?",
    answer:
      "Open AutoDM is currently in early access. Trial access must be provisioned or confirmed by the instance administrator. Clicking a plan button navigates to sign-in and does not automatically create an account or start a trial, as automatic trial expiry, checkouts, and subscription entitlement enforcement are not implemented yet. Once provisioned by your administrator, you receive 30 days of full platform access to explore comment-to-DM funnels, keyword filters, and Traffic Guard safeguards.",
  },
  {
    question: "Is a credit card required to start the trial?",
    answer:
      "No. No credit card is required. In the current release, user accounts are provisioned directly by the instance administrator without collecting payment information or payment card details.",
  },
  {
    question: "How will billing work when self-serve subscriptions launch?",
    answer:
      "When automated self-serve billing is deployed, payments will be processed securely through a compliant payment provider (such as Stripe). Users will be notified well in advance with clear options to select either the $5/month Starter or $9/month Creator Plus plan.",
  },
  {
    question: "Can I switch or cancel my plan at any time?",
    answer:
      "Yes. Once paid subscription management is enabled, you will be able to upgrade, downgrade, or cancel your plan at any time from your account settings with no long-term contracts or lock-in.",
  },
  {
    question: "Is Open AutoDM still free for self-hosters? How does hosted access compare?",
    answer:
      "Yes! Open AutoDM is open-source under the MIT license. You are free to self-host and deploy your own instance to Cloudflare Workers and Supabase without software licensing fees. Hosted early access is evaluated directly on this deployment (app.opendm.in) managed by the instance operator with zero cloud setup required on your end, whereas self-hosting gives developers complete custody over their own cloud infrastructure. Self-hosting deployment instructions are packaged directly in the source repository.",
  },
];

export function PricingPage() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [openFaqIndex, setOpenFaqIndex] = useState<number | null>(0);

  return (
    <div className="min-h-screen bg-background text-foreground font-sans relative selection:bg-primary/20 selection:text-primary">
      {/* Subtle ambient background grid */}
      <div
        className="fixed inset-0 z-0 opacity-[0.08] dark:opacity-[0.18] pointer-events-none"
        style={{
          backgroundImage: `radial-gradient(circle at 1.5px 1.5px, currentColor 1.5px, transparent 0)`,
          backgroundSize: "32px 32px",
        }}
      />

      {/* ──────────────────────────────────────────────────────────────────────────
          1. NAVIGATION HEADER
      ────────────────────────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-50 w-full border-b border-border/80 bg-background/85 backdrop-blur-md transition-colors">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          {/* Logo */}
          <Link href="/" className="flex items-center space-x-2.5 group">
            <LogoMark className="w-8 h-8 drop-shadow-sm group-hover:scale-105 transition-transform" />
            <LogoWordmark className="text-lg" />
          </Link>

          {/* Desktop Navigation Links */}
          <nav className="hidden md:flex items-center space-x-8 text-[13.5px] font-medium text-muted-foreground">
            <Link href="/#features" className="hover:text-foreground transition-colors">
              Features
            </Link>
            <Link href="/#how-it-works" className="hover:text-foreground transition-colors">
              How It Works
            </Link>
            <Link href="/#traffic-guard" className="hover:text-foreground transition-colors flex items-center gap-1.5">
              <span>Traffic Guard</span>
              <span className="text-[10px] uppercase font-mono px-1.5 py-0.2 rounded bg-primary/10 text-primary font-semibold">
                Safe
              </span>
            </Link>
            <Link href="/pricing" className="text-foreground font-semibold transition-colors">
              Pricing
            </Link>
            <Link href="/#reviews" className="hover:text-foreground transition-colors">
              Reviews
            </Link>
            <a href="#faq" className="hover:text-foreground transition-colors">
              FAQ
            </a>
          </nav>

          {/* Right Header Actions */}
          <div className="hidden md:flex items-center space-x-4">
            <ThemeToggle />
            <Link
              href="/login"
              className="text-[13.5px] font-medium text-muted-foreground hover:text-foreground transition-colors px-3 py-1.5"
            >
              Sign In
            </Link>
            <Link
              href="/login?plan=trial"
              className="inline-flex items-center gap-2 px-4 py-2 text-[13.5px] font-semibold rounded-lg bg-foreground text-background hover:opacity-90 transition-opacity shadow-sm"
            >
              <span>Request Early Access</span>
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>

          {/* Mobile Menu Hamburger Button */}
          <div className="flex md:hidden items-center space-x-2">
            <ThemeToggle />
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="p-2 rounded-lg border border-border text-muted-foreground hover:text-foreground hover:bg-muted transition-colors focus:outline-none"
              aria-label="Toggle navigation menu"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {/* Mobile Navigation Drawer */}
        <AnimatePresence>
          {mobileMenuOpen && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="md:hidden border-b border-border bg-background px-4 py-6 space-y-4"
            >
              <div className="flex flex-col space-y-3 text-[14.5px] font-medium">
                <Link
                  href="/#features"
                  onClick={() => setMobileMenuOpen(false)}
                  className="px-2 py-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded transition-colors"
                >
                  Features
                </Link>
                <Link
                  href="/#how-it-works"
                  onClick={() => setMobileMenuOpen(false)}
                  className="px-2 py-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded transition-colors"
                >
                  How It Works
                </Link>
                <Link
                  href="/#traffic-guard"
                  onClick={() => setMobileMenuOpen(false)}
                  className="px-2 py-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded transition-colors flex items-center justify-between"
                >
                  <span>Traffic Guard Protection</span>
                  <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-primary/10 text-primary font-semibold">
                    Safe
                  </span>
                </Link>
                <Link
                  href="/pricing"
                  onClick={() => setMobileMenuOpen(false)}
                  className="px-2 py-1.5 text-foreground bg-muted font-semibold rounded transition-colors"
                >
                  Pricing
                </Link>
                <Link
                  href="/#reviews"
                  onClick={() => setMobileMenuOpen(false)}
                  className="px-2 py-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded transition-colors"
                >
                  Creator Reviews
                </Link>
                <a
                  href="#faq"
                  onClick={() => setMobileMenuOpen(false)}
                  className="px-2 py-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded transition-colors"
                >
                  FAQ
                </a>
              </div>

              <div className="pt-4 border-t border-border flex flex-col gap-2.5">
                <Link
                  href="/login"
                  onClick={() => setMobileMenuOpen(false)}
                  className="w-full text-center py-2.5 text-[14px] font-semibold border border-border rounded-lg hover:bg-muted transition-colors"
                >
                  Sign In
                </Link>
                <Link
                  href="/login?plan=trial"
                  onClick={() => setMobileMenuOpen(false)}
                  className="w-full text-center py-2.5 text-[14px] font-semibold bg-foreground text-background rounded-lg hover:opacity-90 transition-opacity"
                >
                  Request Early Access
                </Link>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </header>

      <main className="relative z-10">
        {/* ──────────────────────────────────────────────────────────────────────────
            2. HERO & HEADING SECTION
        ────────────────────────────────────────────────────────────────────────── */}
        <section className="pt-16 pb-12 sm:pt-20 sm:pb-16 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-primary/25 bg-primary/5 text-primary text-xs font-mono font-medium mb-6">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Honest, Transparent Creator Plans</span>
          </div>

          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-heading font-extrabold tracking-tight text-foreground max-w-3xl mx-auto leading-[1.1] mb-6">
            Simple Pricing.{" "}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#F97316] via-[#ea580c] to-[#dc2626]">
              More Control.
            </span>
          </h1>

          <p className="text-base sm:text-lg text-muted-foreground max-w-2xl mx-auto leading-relaxed mb-4">
            Automate Instagram comments into private DM conversations with built-in Traffic Guard safeguards.
            Evaluate Open AutoDM during early access with zero billing obligation.
          </p>

          <p className="text-xs sm:text-sm text-muted-foreground/80 font-mono">
            All plans include full Traffic Guard rate limiting &bull; No hidden fees &bull; Initial paid launch capped at $9/mo
          </p>
        </section>

        {/* ──────────────────────────────────────────────────────────────────────────
            3. THREE PRICING CARDS
        ────────────────────────────────────────────────────────────────────────── */}
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-16">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 lg:gap-8 items-stretch">
            {PRICING_PLANS.map((plan) => (
              <div
                key={plan.id}
                className={`relative flex flex-col justify-between rounded-2xl border transition-all duration-200 overflow-hidden ${
                  plan.highlighted
                    ? "bg-card border-primary/40 shadow-xl shadow-primary/5 dark:shadow-primary/10 ring-1 ring-primary/30"
                    : "bg-card/70 border-border hover:border-foreground/20 shadow-sm"
                }`}
              >
                {/* Highlight top sunset thread bar for Creator Plus */}
                {plan.highlighted && <div className="h-[3px] w-full ig-thread" />}

                <div className="p-6 sm:p-8 flex-1 flex flex-col">
                  {/* Badge & Name */}
                  <div className="flex items-center justify-between mb-4">
                    <span
                      className={`text-xs font-mono uppercase font-semibold px-2.5 py-0.5 rounded-full ${
                        plan.highlighted
                          ? "bg-primary/10 text-primary border border-primary/20"
                          : "bg-muted text-muted-foreground border border-border"
                      }`}
                    >
                      {plan.badge}
                    </span>
                    {plan.highlighted && (
                      <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-primary">
                        Recommended
                      </span>
                    )}
                  </div>

                  <h2 className="text-2xl font-heading font-bold text-foreground mb-1">
                    {plan.name}
                  </h2>
                  <p className="text-xs text-muted-foreground font-medium mb-5">
                    {plan.audience}
                  </p>

                  {/* Price */}
                  <div className="flex items-baseline gap-1.5 mb-5 pb-5 border-b border-border">
                    <span className="text-4xl sm:text-5xl font-heading font-extrabold text-foreground tracking-tight">
                      {plan.price}
                    </span>
                    <span className="text-sm font-medium text-muted-foreground">
                      {plan.period}
                    </span>
                  </div>

                  <p className="text-xs text-muted-foreground leading-relaxed mb-6">
                    {plan.description}
                  </p>

                  {/* Features list */}
                  <div className="space-y-3 mb-8 flex-1">
                    <div className="text-[11px] font-mono uppercase font-semibold tracking-wider text-muted-foreground">
                      What&apos;s Included:
                    </div>
                    {plan.features.map((feature, idx) => (
                      <div key={idx} className="flex items-start gap-2.5 text-xs text-foreground/90">
                        <Check className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                        <span className="leading-tight">{feature}</span>
                      </div>
                    ))}
                  </div>

                  {/* CTA Button */}
                  <Link
                    href={plan.ctaHref}
                    className={`inline-flex items-center justify-center gap-2 w-full py-3 px-4 text-sm font-semibold rounded-xl transition-all ${plan.buttonStyle}`}
                  >
                    <span>{plan.ctaText}</span>
                    <ArrowRight className="w-4 h-4" />
                  </Link>
                </div>
              </div>
            ))}
          </div>

          {/* Transparent billing & early-access callout note */}
          <div className="mt-8 p-4 rounded-xl border border-border/80 bg-muted/30 flex items-start gap-3 max-w-3xl mx-auto">
            <Info className="w-5 h-5 text-muted-foreground shrink-0 mt-0.5" />
            <div className="text-xs text-muted-foreground leading-relaxed">
              <span className="font-semibold text-foreground">Early-Access Status Notice: </span>
              Open AutoDM is currently in early access. Clicking a plan CTA navigates to sign-in and does not
              automatically create an account, start a trial, or charge a payment method. User accounts and evaluation access
              must be provisioned or confirmed by the instance administrator. Automatic trial expiry, billing checkouts,
              and subscription entitlement enforcement are not yet implemented.
            </div>
          </div>

          {/* Consistent Instagram Safety Disclaimer */}
          <div className="mt-6 text-center max-w-2xl mx-auto">
            <p className="text-[11.5px] text-muted-foreground/80 leading-relaxed">
              <span className="font-semibold text-foreground/90">Safety &amp; Compliance Notice:</span> open-autoDM uses official Meta Graph API webhooks and built-in Traffic Guard rate limiting and safeguards to help protect your account. No tool can guarantee immunity from platform restrictions; account owners remain responsible for ensuring messaging content and frequency comply with Meta Community Guidelines. open-autoDM is an independent open-source project and is not affiliated with, sponsored by, or endorsed by Meta Platforms, Inc. or Instagram.
            </p>
          </div>
        </section>

        {/* ──────────────────────────────────────────────────────────────────────────
            4. DETAILED FEATURE COMPARISON TABLE
        ────────────────────────────────────────────────────────────────────────── */}
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 border-t border-border/80">
          <div className="text-center max-w-2xl mx-auto mb-12">
            <div className="inline-flex items-center gap-1.5 text-xs font-mono uppercase font-semibold text-primary bg-primary/10 px-2.5 py-0.5 rounded-full mb-3">
              <Layers className="w-3.5 h-3.5" />
              <span>Full Capability Matrix</span>
            </div>
            <h2 className="text-3xl font-heading font-bold text-foreground tracking-tight mb-3">
              Compare Platform Capabilities
            </h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Every feature listed below represents verified functionality built directly into the Open AutoDM
              codebase and edge execution engine.
            </p>
          </div>

          <div className="rounded-2xl border border-border bg-card overflow-hidden shadow-xs">
            <div className="overflow-x-auto custom-scrollbar">
              <table className="w-full text-left text-xs border-collapse min-w-[620px]">
                <thead>
                  <tr className="border-b border-border bg-muted/40">
                    <th className="py-4 px-6 text-foreground font-heading font-semibold text-sm w-[40%]">
                      Feature &amp; Capability
                    </th>
                    <th className="py-4 px-4 text-center font-heading font-semibold text-sm w-[20%]">
                      Free Trial <span className="block text-[11px] font-normal text-muted-foreground">30 Days ($0)</span>
                    </th>
                    <th className="py-4 px-4 text-center font-heading font-semibold text-sm w-[20%]">
                      Starter <span className="block text-[11px] font-normal text-muted-foreground">$5 / month</span>
                    </th>
                    <th className="py-4 px-4 text-center font-heading font-semibold text-sm w-[20%] text-primary">
                      Creator Plus <span className="block text-[11px] font-normal text-primary/80">$9 / month</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {COMPARISON_DATA.map((section, sIdx) => (
                    <Fragment key={sIdx}>
                      <tr className="bg-muted/20">
                        <td
                          colSpan={4}
                          className="py-2.5 px-6 font-mono text-[11px] font-bold uppercase tracking-wider text-primary"
                        >
                          {section.category}
                        </td>
                      </tr>
                      {section.rows.map((row, rIdx) => (
                        <tr key={rIdx} className="hover:bg-muted/10 transition-colors">
                          <td className="py-3.5 px-6">
                            <div className="font-semibold text-foreground">{row.name}</div>
                            <div className="text-[11px] text-muted-foreground mt-0.5">{row.description}</div>
                          </td>
                          <td className="py-3.5 px-4 text-center">
                            {typeof row.trial === "boolean" ? (
                              row.trial ? (
                                <Check className="w-4 h-4 text-emerald-500 mx-auto" />
                              ) : (
                                <span className="text-muted-foreground">&mdash;</span>
                              )
                            ) : (
                              <span className="font-medium text-foreground">{row.trial}</span>
                            )}
                          </td>
                          <td className="py-3.5 px-4 text-center">
                            {typeof row.starter === "boolean" ? (
                              row.starter ? (
                                <Check className="w-4 h-4 text-emerald-500 mx-auto" />
                              ) : (
                                <span className="text-muted-foreground">&mdash;</span>
                              )
                            ) : (
                              <span className="font-medium text-foreground">{row.starter}</span>
                            )}
                          </td>
                          <td className="py-3.5 px-4 text-center bg-primary/[0.02]">
                            {typeof row.creatorPlus === "boolean" ? (
                              row.creatorPlus ? (
                                <Check className="w-4 h-4 text-primary font-bold mx-auto" />
                              ) : (
                                <span className="text-muted-foreground">&mdash;</span>
                              )
                            ) : (
                              <span className="font-medium text-foreground">{row.creatorPlus}</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="p-4 border-t border-border bg-muted/20 text-center text-xs text-muted-foreground leading-relaxed max-w-3xl mx-auto">
              <span className="font-semibold text-foreground">Implementation &amp; Entitlement Notice: </span>
              All 14 verified capabilities listed above are fully implemented and enabled in Open AutoDM today with zero artificial paywalls.
              Plan tiers and account allowances reflect our planned self-serve billing structure. Because automated entitlement enforcement and paywalls
              are not implemented in the current early-access release, your provisioned evaluation access includes the complete automation pipeline and Traffic Guard safeguards.
            </div>
          </div>
        </section>

        {/* ──────────────────────────────────────────────────────────────────────────
            5. CLEAR FREE-TRIAL EXPLANATION SECTION
        ────────────────────────────────────────────────────────────────────────── */}
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 border-t border-border/80">
          <div className="max-w-4xl mx-auto bg-card rounded-2xl border border-border p-8 sm:p-12 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8 pb-6 border-b border-border">
              <div>
                <div className="text-xs font-mono font-semibold uppercase tracking-wider text-primary mb-1">
                  Evaluation Guarantee
                </div>
                <h2 className="text-2xl sm:text-3xl font-heading font-bold text-foreground">
                  How the 30-Day Free Trial Works
                </h2>
              </div>
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-xs font-semibold shrink-0">
                <CheckCircle2 className="w-4 h-4" />
                <span>Zero Billing Obligation</span>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mb-8">
              <div className="space-y-2.5">
                <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center font-mono font-bold text-sm">
                  1
                </div>
                <h3 className="text-sm font-semibold text-foreground">Administrator Provisioning</h3>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Request early access from your instance administrator. User accounts are created without entering payment card details.
                </p>
              </div>

              <div className="space-y-2.5">
                <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center font-mono font-bold text-sm">
                  2
                </div>
                <h3 className="text-sm font-semibold text-foreground">Test Full Safeguards</h3>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Connect your Instagram Creator or Business account and launch comment-to-DM triggers. Traffic Guard automatically rate-limits delivery.
                </p>
              </div>

              <div className="space-y-2.5">
                <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center font-mono font-bold text-sm">
                  3
                </div>
                <h3 className="text-sm font-semibold text-foreground">Transparent Transition</h3>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  When self-serve billing is deployed, select the $5 Starter or $9 Creator Plus tier, or continue self-hosting the open-source MIT codebase.
                </p>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-muted/40 border border-border text-xs text-muted-foreground space-y-1.5">
              <div className="font-semibold text-foreground flex items-center gap-1.5">
                <Lock className="w-3.5 h-3.5 text-primary" />
                <span>What happens after 30 days?</span>
              </div>
              <p>
                Open AutoDM is in early access. Trial access must be provisioned or confirmed by the instance administrator.
                Automatic trial expiry, checkouts, and subscription entitlement enforcement are not implemented yet.
                In the current release, accounts remain active until updated by the administrator, with zero unexpected charges and zero automatic lockouts.
              </p>
            </div>
          </div>
        </section>

        {/* ──────────────────────────────────────────────────────────────────────────
            6. BILLING FAQ ACCORDION
        ────────────────────────────────────────────────────────────────────────── */}
        <section id="faq" className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16 border-t border-border/80">
          <div className="text-center mb-12">
            <div className="inline-flex items-center gap-1.5 text-xs font-mono uppercase font-semibold text-primary bg-primary/10 px-2.5 py-0.5 rounded-full mb-3">
              <HelpCircle className="w-3.5 h-3.5" />
              <span>Questions &amp; Clarity</span>
            </div>
            <h2 className="text-3xl font-heading font-bold text-foreground tracking-tight mb-3">
              Frequently Asked Billing Questions
            </h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Clear answers about trial duration, billing roadmap, plan changes, and open-source self-hosting.
            </p>
          </div>

          <div className="space-y-3">
            {BILLING_FAQS.map((faq, index) => {
              const isOpen = openFaqIndex === index;
              return (
                <div
                  key={index}
                  className="rounded-xl border border-border bg-card overflow-hidden transition-colors"
                >
                  <button
                    onClick={() => setOpenFaqIndex(isOpen ? null : index)}
                    className="w-full px-6 py-4 text-left flex items-center justify-between gap-4 focus:outline-none"
                    aria-expanded={isOpen}
                  >
                    <span className="text-sm font-semibold text-foreground">
                      {faq.question}
                    </span>
                    <ChevronDown
                      className={`w-4 h-4 text-muted-foreground shrink-0 transition-transform duration-200 ${
                        isOpen ? "rotate-180 text-foreground" : ""
                      }`}
                    />
                  </button>
                  <AnimatePresence>
                    {isOpen && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.2 }}
                      >
                        <div className="px-6 pb-4 pt-1 text-xs sm:text-[13px] text-muted-foreground leading-relaxed border-t border-border/40">
                          {faq.answer}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            })}
          </div>
        </section>

        {/* ──────────────────────────────────────────────────────────────────────────
            7. BOTTOM CALL TO ACTION
        ────────────────────────────────────────────────────────────────────────── */}
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-24">
          <div className="relative rounded-3xl border border-border bg-card p-8 sm:p-14 text-center overflow-hidden shadow-lg shadow-black/5 dark:shadow-black/20">
            {/* Ambient warm glow in CTA box */}
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-3/4 h-32 bg-primary/10 blur-[80px] pointer-events-none rounded-full" />
            <div className="h-[2px] w-full ig-thread absolute top-0 left-0" />

            <div className="relative z-10 max-w-2xl mx-auto">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-mono font-semibold mb-6">
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>30-Day Evaluation &bull; Traffic Guard Protected</span>
              </span>

              <h2 className="text-3xl sm:text-4xl font-heading font-extrabold tracking-tight text-foreground mb-4">
                Ready to Automate Your Instagram Growth?
              </h2>

              <p className="text-sm sm:text-base text-muted-foreground leading-relaxed mb-8">
                Request early-access evaluation from your instance administrator, configure your keyword triggers,
                and experience comment-to-DM automation with built-in Traffic Guard safeguards.
              </p>

              <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
                <Link
                  href="/login?plan=trial"
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-foreground text-background text-sm font-semibold hover:opacity-90 transition-opacity shadow-sm"
                >
                  <span>Request Early Access</span>
                  <ArrowRight className="w-4 h-4" />
                </Link>
                <Link
                  href="/login"
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl border border-border bg-background text-foreground text-sm font-medium hover:bg-muted transition-colors"
                >
                  <span>Sign In to Existing Account</span>
                </Link>
              </div>

              <div className="mt-6 flex flex-wrap items-center justify-center gap-6 text-xs text-muted-foreground font-mono">
                <span className="flex items-center gap-1.5">
                  <Check className="w-3.5 h-3.5 text-emerald-500" />
                  No credit card required
                </span>
                <span className="flex items-center gap-1.5">
                  <Check className="w-3.5 h-3.5 text-emerald-500" />
                  30 days full access
                </span>
                <span className="flex items-center gap-1.5">
                  <Check className="w-3.5 h-3.5 text-emerald-500" />
                  Instance administrator managed
                </span>
              </div>

              {/* Consistent Instagram Safety Disclaimer */}
              <div className="mt-8 pt-6 border-t border-border/60 text-center">
                <p className="text-[11.5px] text-muted-foreground/80 leading-relaxed max-w-xl mx-auto">
                  <span className="font-semibold text-foreground/90">Safety &amp; Compliance Notice:</span> open-autoDM uses official Meta Graph API webhooks and built-in Traffic Guard rate limiting and safeguards to help protect your account. No tool can guarantee immunity from platform restrictions; account owners remain responsible for ensuring messaging content and frequency comply with Meta Community Guidelines. open-autoDM is an independent open-source project and is not affiliated with, sponsored by, or endorsed by Meta Platforms, Inc. or Instagram.
                </p>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* ──────────────────────────────────────────────────────────────────────────
          8. FOOTER
      ────────────────────────────────────────────────────────────────────────── */}
      <footer className="border-t border-border bg-card/50 text-muted-foreground">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-12">
            {/* Col 1: Brand */}
            <div className="col-span-2 md:col-span-1 space-y-3">
              <Link href="/" className="flex items-center space-x-2 group">
                <LogoMark className="w-6 h-6 group-hover:scale-105 transition-transform" />
                <LogoWordmark className="text-base" />
              </Link>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Open-source, self-hosted Instagram comment automation with built-in Traffic Guard safeguards.
              </p>
            </div>

            {/* Col 2: Navigation */}
            <div className="space-y-3">
              <div className="text-xs font-mono font-semibold uppercase tracking-wider text-foreground">
                Product
              </div>
              <ul className="space-y-2 text-xs">
                <li>
                  <Link href="/#features" className="hover:text-foreground transition-colors">
                    Features
                  </Link>
                </li>
                <li>
                  <Link href="/#how-it-works" className="hover:text-foreground transition-colors">
                    How It Works
                  </Link>
                </li>
                <li>
                  <Link href="/#traffic-guard" className="hover:text-foreground transition-colors">
                    Traffic Guard
                  </Link>
                </li>
                <li>
                  <Link href="/pricing" className="text-foreground font-semibold transition-colors">
                    Pricing
                  </Link>
                </li>
                <li>
                  <a href="#faq" className="hover:text-foreground transition-colors">
                    FAQ
                  </a>
                </li>
              </ul>
            </div>

            {/* Col 3: Trust & Legal */}
            <div className="space-y-3">
              <div className="text-xs font-mono font-semibold uppercase tracking-wider text-foreground">
                Legal &amp; Trust
              </div>
              <ul className="space-y-2 text-xs">
                <li>
                  <Link href="/privacy-policy" className="hover:text-foreground transition-colors">
                    Privacy Policy
                  </Link>
                </li>
                <li>
                  <Link href="/terms" className="hover:text-foreground transition-colors">
                    Terms of Service
                  </Link>
                </li>
                <li>
                  <Link href="/data-deletion" className="hover:text-foreground transition-colors">
                    Data Deletion Instructions
                  </Link>
                </li>
              </ul>
            </div>

            {/* Col 4: Platform */}
            <div className="space-y-3">
              <div className="text-xs font-mono font-semibold uppercase tracking-wider text-foreground">
                Platform
              </div>
              <ul className="space-y-2 text-xs">
                <li>
                  <Link href="/login" className="hover:text-foreground transition-colors">
                    Sign In
                  </Link>
                </li>
                <li>
                  <a
                    href="mailto:work.techhacksai@gmail.com"
                    className="hover:text-foreground transition-colors"
                  >
                    Contact Operator
                  </a>
                </li>
              </ul>
            </div>
          </div>

          {/* Bottom disclaimer row */}
          <div className="pt-8 border-t border-border flex flex-col sm:flex-row items-center justify-between gap-4 text-xs">
            <div>
              &copy; {new Date().getFullYear()} open-autoDM. Free and open source under the MIT License.
            </div>
            <div className="text-[11px] text-muted-foreground/80 text-center sm:text-right max-w-md">
              open-autoDM is an independent open-source project and is not affiliated with, sponsored by, or endorsed by Meta Platforms, Inc. or Instagram.
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

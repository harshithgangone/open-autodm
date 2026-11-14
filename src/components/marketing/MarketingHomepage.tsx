"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowRight,
  CheckCircle2,
  ShieldCheck,
  ShieldAlert,
  Zap,
  Sparkles,
  MessageSquare,
  Send,
  Video,
  Filter,
  Repeat,
  ChevronDown,
  Menu,
  X,
  Lock,
  Server,
  Sliders,
  Check,
  ChevronRight,
  AlertTriangle,
  Play,
  Pause,
  RotateCcw,
} from "lucide-react";
import { LogoMark, LogoWordmark } from "@/components/ui/Logo";
import { ThemeToggle } from "@/components/ui/ThemeToggle";

interface PipelineStepBase {
  id: number;
  title: string;
  subtitle: string;
  badge: string;
  summary: string;
  statusText: string;
  statusColor: string;
}

interface PipelineStep1 extends PipelineStepBase {
  id: 1;
  postAuthor: string;
  postCaption: string;
  commentUser: string;
  commentText: string;
}

interface PipelineStep2 extends PipelineStepBase {
  id: 2;
  checks: Array<{ label: string; result: string; passed: boolean }>;
}

interface PipelineStep3 extends PipelineStepBase {
  id: 3;
  authorReply: string;
  replyText: string;
  variation: string;
  aiAssisted: boolean;
}

interface PipelineStep4 extends PipelineStepBase {
  id: 4;
  dmSender: string;
  dmRecipient: string;
  dmBody: string;
  deliveredVia: string;
}

type PipelineStep = PipelineStep1 | PipelineStep2 | PipelineStep3 | PipelineStep4;

const PIPELINE_STEPS: PipelineStep[] = [
  {
    id: 1,
    title: "1. Trigger",
    subtitle: "Reel or Post comment",
    badge: "Step 01",
    summary: "Monitors comments on your selected Reel or Post in real time via Meta webhooks.",
    postAuthor: "sarah_creator",
    postCaption: "Comment GUIDE below to get my free 2026 growth blueprint! 🚀",
    commentUser: "alex_dev",
    commentText: "GUIDE please! Looking forward to this.",
    statusText: "Keyword 'GUIDE' detected via webhook",
    statusColor: "text-emerald-500 bg-emerald-500/10 border-emerald-500/20",
  },
  {
    id: 2,
    title: "2. Filter & Guard",
    subtitle: "Keywords & rate limits",
    badge: "Step 02",
    summary: "Verifies trigger keywords, checks excluded words (e.g. 'refund'), and reserves a delivery slot.",
    checks: [
      { label: "Trigger Keyword Match", result: "Exact match: 'GUIDE'", passed: true },
      { label: "Excluded Negative Keywords", result: "None detected ('help', 'refund' absent)", passed: true },
      { label: "Deduplication & Reservation", result: "First-time commenter for this media ID", passed: true },
      { label: "Traffic Guard Rate Limiter", result: "12 / 60 DMs this hour — Safe Window", passed: true },
    ],
    statusText: "Traffic Guard clearance granted",
    statusColor: "text-sky-500 bg-sky-500/10 border-sky-500/20",
  },
  {
    id: 3,
    title: "3. Public Reply",
    subtitle: "Contextual engagement",
    badge: "Step 03",
    summary: "Rotates authentic public replies or uses AI suggestions to boost post engagement.",
    authorReply: "sarah_creator",
    replyText: "Just sent the blueprint to your DMs, Alex! Check your message requests 📬✨",
    variation: "Smart Rotation #2 of 4",
    aiAssisted: true,
    statusText: "Public reply published instantly",
    statusColor: "text-amber-500 bg-amber-500/10 border-amber-500/20",
  },
  {
    id: 4,
    title: "4. Private DM",
    subtitle: "Direct value delivery",
    badge: "Step 04",
    summary: "Delivers your link, download, or discount code privately via official Instagram Messaging API.",
    dmSender: "sarah_creator",
    dmRecipient: "alex_dev",
    dmBody:
      "Hey Alex! Thanks for your comment. Here is your direct access link to the 2026 Growth Blueprint:\n\n👉 https://example.com/growth-blueprint\n\nLet me know if you have any questions!",
    deliveredVia: "Meta Official Instagram Graph API (200 OK)",
    statusText: "DM delivered safely & logged",
    statusColor: "text-emerald-500 bg-emerald-500/10 border-emerald-500/20",
  },
];

const PIPELINE_SCENARIOS: Array<{
  id: string;
  label: string;
  keyword: string;
  steps: PipelineStep[];
}> = [
  {
    id: "guide",
    label: "Scenario A: 'GUIDE'",
    keyword: "GUIDE",
    steps: PIPELINE_STEPS,
  },
  {
    id: "link",
    label: "Scenario B: 'LINK'",
    keyword: "LINK",
    steps: [
      {
        id: 1,
        title: "1. Trigger",
        subtitle: "Reel or Post comment",
        badge: "Step 01",
        summary: "Monitors comments on your selected Reel or Post in real time via Meta webhooks.",
        postAuthor: "sarah_creator",
        postCaption: "Want early access to our Next.js masterclass? Drop LINK below! 💻",
        commentUser: "elena_code",
        commentText: "LINK please! Need this for my project.",
        statusText: "Keyword 'LINK' detected via webhook",
        statusColor: "text-emerald-500 bg-emerald-500/10 border-emerald-500/20",
      },
      {
        id: 2,
        title: "2. Filter & Guard",
        subtitle: "Keywords & rate limits",
        badge: "Step 02",
        summary: "Verifies trigger keywords, checks excluded words (e.g. 'refund'), and reserves a delivery slot.",
        checks: [
          { label: "Trigger Keyword Match", result: "Exact match: 'LINK'", passed: true },
          { label: "Excluded Negative Keywords", result: "None detected ('help', 'refund' absent)", passed: true },
          { label: "Deduplication & Reservation", result: "First-time commenter for this media ID", passed: true },
          { label: "Traffic Guard Rate Limiter", result: "18 / 60 DMs this hour — Safe Window", passed: true },
        ],
        statusText: "Traffic Guard clearance granted",
        statusColor: "text-sky-500 bg-sky-500/10 border-sky-500/20",
      },
      {
        id: 3,
        title: "3. Public Reply",
        subtitle: "Contextual engagement",
        badge: "Step 03",
        summary: "Rotates authentic public replies or uses AI suggestions to boost post engagement.",
        authorReply: "sarah_creator",
        replyText: "Check your DMs Elena! Direct masterclass link is on its way 🚀",
        variation: "Smart Rotation #1 of 4",
        aiAssisted: true,
        statusText: "Public reply published instantly",
        statusColor: "text-amber-500 bg-amber-500/10 border-amber-500/20",
      },
      {
        id: 4,
        title: "4. Private DM",
        subtitle: "Direct value delivery",
        badge: "Step 04",
        summary: "Delivers your link, download, or discount code privately via official Instagram Messaging API.",
        dmSender: "sarah_creator",
        dmRecipient: "elena_code",
        dmBody:
          "Hey Elena! Thanks for reaching out. Here is your direct access link to the Next.js Masterclass:\n\n👉 https://example.com/nextjs-masterclass\n\nEnjoy the course and happy coding!",
        deliveredVia: "Meta Official Instagram Graph API (200 OK)",
        statusText: "DM delivered safely & logged",
        statusColor: "text-emerald-500 bg-emerald-500/10 border-emerald-500/20",
      },
    ],
  },
  {
    id: "vip",
    label: "Scenario C: 'VIP'",
    keyword: "VIP",
    steps: [
      {
        id: 1,
        title: "1. Trigger",
        subtitle: "Reel or Post comment",
        badge: "Step 01",
        summary: "Monitors comments on your selected Reel or Post in real time via Meta webhooks.",
        postAuthor: "sarah_creator",
        postCaption: "Comment VIP to claim your exclusive creator community pass ✨",
        commentUser: "marcus_growth",
        commentText: "VIP! Been waiting for this all week.",
        statusText: "Keyword 'VIP' detected via webhook",
        statusColor: "text-emerald-500 bg-emerald-500/10 border-emerald-500/20",
      },
      {
        id: 2,
        title: "2. Filter & Guard",
        subtitle: "Keywords & rate limits",
        badge: "Step 02",
        summary: "Verifies trigger keywords, checks excluded words (e.g. 'refund'), and reserves a delivery slot.",
        checks: [
          { label: "Trigger Keyword Match", result: "Exact match: 'VIP'", passed: true },
          { label: "Excluded Negative Keywords", result: "None detected ('help', 'refund' absent)", passed: true },
          { label: "Deduplication & Reservation", result: "First-time commenter for this media ID", passed: true },
          { label: "Traffic Guard Rate Limiter", result: "24 / 60 DMs this hour — Safe Window", passed: true },
        ],
        statusText: "Traffic Guard clearance granted",
        statusColor: "text-sky-500 bg-sky-500/10 border-sky-500/20",
      },
      {
        id: 3,
        title: "3. Public Reply",
        subtitle: "Contextual engagement",
        badge: "Step 03",
        summary: "Rotates authentic public replies or uses AI suggestions to boost post engagement.",
        authorReply: "sarah_creator",
        replyText: "Welcome aboard Marcus! Check your message requests for your pass 🎟️",
        variation: "Smart Rotation #3 of 4",
        aiAssisted: true,
        statusText: "Public reply published instantly",
        statusColor: "text-amber-500 bg-amber-500/10 border-amber-500/20",
      },
      {
        id: 4,
        title: "4. Private DM",
        subtitle: "Direct value delivery",
        badge: "Step 04",
        summary: "Delivers your link, download, or discount code privately via official Instagram Messaging API.",
        dmSender: "sarah_creator",
        dmRecipient: "marcus_growth",
        dmBody:
          "Hey Marcus! You are in. Here is your VIP Creator Community pass:\n\n👉 https://example.com/vip-community\n\nSee you inside!",
        deliveredVia: "Meta Official Instagram Graph API (200 OK)",
        statusText: "DM delivered safely & logged",
        statusColor: "text-emerald-500 bg-emerald-500/10 border-emerald-500/20",
      },
    ],
  },
];

// Feature card definitions
const FEATURES = [
  {
    icon: Send,
    title: "Instant Comment-to-DM",
    description:
      "Automatically deliver lead magnets, discount codes, video resources, or links the moment an audience member leaves a comment.",
  },
  {
    icon: Video,
    title: "Reel & Post Targeting",
    description:
      "Pin automations to specific viral Reels, carousel posts, or feed photos, or run global keyword matching across all your published media.",
  },
  {
    icon: Filter,
    title: "Smart Keyword & Exclusion Rules",
    description:
      "Match exact phrases or broad keywords. Filter out negative terms like 'help', 'broken', or 'refund' so human support handles sensitive queries.",
  },
  {
    icon: Repeat,
    title: "Dynamic Public Replies",
    description:
      "Rotate between multiple authentic public reply variations so your comment section remains organic and avoids repetitive bot patterns.",
  },
  {
    icon: Sparkles,
    title: "AI Reply Suggestions",
    description:
      "Generate creator-toned, context-aware comment replies using built-in Cloudflare Workers AI directly inside the 4-step builder.",
  },
  {
    icon: ShieldAlert,
    title: "Traffic Guard Safeguards",
    description:
      "Monitors comment velocity, enforces sliding-window rate limits, and triggers protective pauses during abnormal spikes to help protect your account.",
  },
];

// 4-step setup walkthrough definitions
const SETUP_STEPS = [
  {
    step: "01",
    title: "Connect Your Meta Account",
    description:
      "Authorize your Instagram Professional or Creator account using official Meta Business Login. Your tokens are securely encrypted at rest via AES-256-GCM.",
  },
  {
    step: "02",
    title: "Select Your Reel or Post",
    description:
      "Choose a specific high-performing Reel, carousel, or image from your live Instagram feed, or apply your automation to any incoming comment.",
  },
  {
    step: "03",
    title: "Define Keywords & Messages",
    description:
      "Set your trigger keywords, add negative keyword exclusions, write public comment reply variations, and compose your automated private DM.",
  },
  {
    step: "04",
    title: "Launch With Built-In Protection",
    description:
      "Turn on your automation with confidence. Traffic Guard tracks comment velocity and enforces rate limits to help protect your account standing.",
  },
];

// Truthful creator early-access and community feedback invitations
const REVIEWS = [
  {
    name: "Community Beta Testing",
    role: "Creator Early Access Program",
    tag: "Creator Beta",
    headline: "Early-Stage Platform Testing",
    quote:
      "Open AutoDM is actively being tested by early creators evaluating comment-to-DM funnels on live accounts. We are gathering real-world performance feedback before wider release.",
  },
  {
    name: "Self-Hosted Builders",
    role: "Open Source Feedback",
    tag: "Community Input",
    headline: "Shaping Core Safeguards",
    quote:
      "We invite self-hosted operators to test keyword matching rules, sliding-window rate limit thresholds, and Traffic Guard protective pauses to help refine our default safety profiles.",
  },
  {
    name: "Open Community Collaboration",
    role: "Direct Feedback Phase",
    tag: "Transparent Development",
    headline: "Honest Testing & Zero Fluff",
    quote:
      "We do not publish synthetic reviews or fabricated client testimonials. We welcome genuine feedback from developers and creators testing the platform on their own infrastructure.",
  },
];

// Real product FAQs
const FAQS = [
  {
    question: "What type of Instagram account do I need?",
    answer:
      "You need an Instagram Professional account (either Creator or Business) that is connected to a Facebook Page. This is a standard requirement established by Meta for the Instagram Graph API and messaging webhooks.",
  },
  {
    question: "How does Open AutoDM protect my account from getting restricted?",
    answer:
      "Open AutoDM includes Traffic Guard — a protective system featuring sliding-window rate limiting, atomic database reservations that prevent duplicate DMs, and automatic protective pausing if comment volume spikes abnormally. We also encourage natural, creator-led messaging copy rather than aggressive mass spam.",
  },
  {
    question: "Can an audience member receive the same DM multiple times?",
    answer:
      "No. The deduplication engine creates an atomic reservation per user per post. Even if a user comments multiple times on the same Reel or Post, Open AutoDM ensures they receive the private DM only once.",
  },
  {
    question: "How does the AI reply suggestion feature work?",
    answer:
      "Inside the automation builder, you can click 'Generate with AI' to use Cloudflare Workers AI (powered by Llama 3.2 on Cloudflare edge) to suggest varied, friendly public comment replies based on your trigger topic. You can review, edit, or add any generated suggestions to your rotation.",
  },
  {
    question: "Is Open AutoDM open-source and self-hostable?",
    answer:
      "Yes. Open AutoDM is open-source under the MIT license. You can deploy it to Cloudflare Workers with Supabase as the backend, giving you 100% control over your database, encryption keys, and Meta credentials.",
  },
  {
    question: "Can I filter out followers asking for customer support?",
    answer:
      "Yes. In Step 2 of the builder, you can define excluded keywords (e.g. 'refund', 'broken', 'help', 'cancel'). When any of these words appear in a comment, Open AutoDM intentionally skips the automated DM so your human team can reply appropriately.",
  },
];

export function MarketingHomepage() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [activeScenarioId, setActiveScenarioId] = useState("guide");
  const [activePipelineStep, setActivePipelineStep] = useState(1);
  const [isSimulating, setIsSimulating] = useState(false);
  const [openFaqIndex, setOpenFaqIndex] = useState<number | null>(0);

  const currentScenario =
    PIPELINE_SCENARIOS.find((s) => s.id === activeScenarioId) ?? PIPELINE_SCENARIOS[0]!;
  const currentStep: PipelineStep =
    currentScenario.steps.find((s) => s.id === activePipelineStep) ?? currentScenario.steps[0]!;

  useEffect(() => {
    if (!isSimulating) return;
    const timer = setTimeout(() => {
      setActivePipelineStep((prev) => {
        if (prev >= 4) {
          setIsSimulating(false);
          return 4;
        }
        return prev + 1;
      });
    }, 1900);
    return () => clearTimeout(timer);
  }, [isSimulating, activePipelineStep]);

  const handleRunSimulation = () => {
    setActivePipelineStep(1);
    setIsSimulating(true);
  };

  const handleResetSimulation = () => {
    setIsSimulating(false);
    setActivePipelineStep(1);
  };

  return (
    <div className="min-h-screen bg-background text-foreground font-sans relative selection:bg-primary/20 selection:text-primary">
      {/* Subtle background ambient pattern */}
      <div
        className="fixed inset-0 z-0 opacity-[0.08] dark:opacity-[0.18] pointer-events-none"
        style={{
          backgroundImage: `radial-gradient(circle at 1.5px 1.5px, currentColor 1.5px, transparent 0)`,
          backgroundSize: "32px 32px",
        }}
      />

      {/* ──────────────────────────────────────────────────────────────────────────
          1. NAVIGATION
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
            <a href="#features" className="hover:text-foreground transition-colors">
              Features
            </a>
            <a href="#how-it-works" className="hover:text-foreground transition-colors">
              How It Works
            </a>
            <a href="#traffic-guard" className="hover:text-foreground transition-colors flex items-center gap-1.5">
              <span>Traffic Guard</span>
              <span className="text-[10px] uppercase font-mono px-1.5 py-0.2 rounded bg-primary/10 text-primary font-semibold">
                Safe
              </span>
            </a>
            <Link href="/pricing" className="hover:text-foreground transition-colors">
              Pricing
            </Link>
            <a href="#reviews" className="hover:text-foreground transition-colors">
              Reviews
            </a>
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
              href="/login"
              className="inline-flex items-center gap-2 px-4 py-2 text-[13.5px] font-semibold rounded-lg bg-foreground text-background hover:opacity-90 transition-opacity shadow-sm"
            >
              <span>Get Started</span>
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
                <a
                  href="#features"
                  onClick={() => setMobileMenuOpen(false)}
                  className="px-2 py-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded transition-colors"
                >
                  Features
                </a>
                <a
                  href="#how-it-works"
                  onClick={() => setMobileMenuOpen(false)}
                  className="px-2 py-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded transition-colors"
                >
                  How It Works
                </a>
                <a
                  href="#traffic-guard"
                  onClick={() => setMobileMenuOpen(false)}
                  className="px-2 py-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded transition-colors flex items-center justify-between"
                >
                  <span>Traffic Guard Protection</span>
                  <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-primary/10 text-primary font-semibold">
                    Safe
                  </span>
                </a>
                <Link
                  href="/pricing"
                  onClick={() => setMobileMenuOpen(false)}
                  className="px-2 py-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded transition-colors"
                >
                  Pricing
                </Link>
                <a
                  href="#reviews"
                  onClick={() => setMobileMenuOpen(false)}
                  className="px-2 py-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded transition-colors"
                >
                  Creator Reviews
                </a>
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
                  href="/login"
                  onClick={() => setMobileMenuOpen(false)}
                  className="w-full text-center py-2.5 text-[14px] font-semibold bg-foreground text-background rounded-lg hover:opacity-90 transition-opacity flex items-center justify-center gap-2"
                >
                  <span>Get Started Free</span>
                  <ArrowRight className="w-4 h-4" />
                </Link>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </header>

      {/* ──────────────────────────────────────────────────────────────────────────
          2. HERO SECTION
      ────────────────────────────────────────────────────────────────────────── */}
      <section className="relative z-10 pt-16 sm:pt-24 pb-20 sm:pb-28 overflow-hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative">
          {/* Subtle floating hero element 1: Inbound comment with keyword match indicator */}
          <div
            aria-hidden="true"
            className="hidden xl:flex flex-col gap-2.5 absolute left-2 lg:left-4 top-16 w-64 p-3.5 rounded-2xl border border-border/80 bg-card/85 backdrop-blur-md shadow-2xl shadow-black/10 animate-float-slow pointer-events-none select-none z-20"
          >
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-full bg-gradient-to-tr from-amber-500 via-pink-500 to-purple-600 p-[1.5px] shrink-0">
                <div className="w-full h-full rounded-full bg-card flex items-center justify-center text-[10px] font-bold text-foreground">
                  IG
                </div>
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[11px] font-semibold text-foreground truncate">@maya_travel</div>
                <div className="text-[10px] text-muted-foreground">Commented on Reel</div>
              </div>
              <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-semibold border border-emerald-500/20">
                New
              </span>
            </div>
            <div className="text-xs text-foreground/90 bg-muted/30 p-2 rounded-lg border border-border/50">
              &ldquo;GUIDE please! ✈️ Need this itinerary&rdquo;
            </div>
            <div className="flex items-center justify-between text-[10px] font-mono text-muted-foreground pt-0.5">
              <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-medium">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Keyword Match &quot;GUIDE&quot;
              </span>
              <span>92ms</span>
            </div>
          </div>

          {/* Subtle floating hero element 2: Outbound automated DM preview card */}
          <div
            aria-hidden="true"
            className="hidden xl:flex flex-col gap-2.5 absolute right-2 lg:right-4 top-24 w-68 p-3.5 rounded-2xl border border-border/80 bg-card/85 backdrop-blur-md shadow-2xl shadow-black/10 animate-float-delayed pointer-events-none select-none z-20"
          >
            <div className="flex items-center justify-between border-b border-border/60 pb-2">
              <div className="flex items-center gap-2">
                <div className="w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center text-primary text-[10px] font-bold">
                  DM
                </div>
                <span className="text-[11px] font-semibold text-foreground">Direct Message</span>
              </div>
              <span className="text-[10px] font-mono text-muted-foreground">Just now</span>
            </div>
            <div className="text-[11px] text-foreground/90 bg-muted/30 p-2 rounded-lg border border-border/50 leading-relaxed font-mono">
              &ldquo;Hey Maya! Here is your 2026 Packing Guide 👉 opendm.in/guide&rdquo;
            </div>
            <div className="flex items-center justify-between text-[10px] font-mono pt-0.5">
              <span className="text-emerald-600 dark:text-emerald-400 font-medium flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                Sent (200 OK)
              </span>
              <span className="text-sky-600 dark:text-sky-400 font-medium flex items-center gap-1">
                <ShieldCheck className="w-3 h-3 text-sky-500" />
                Guarded
              </span>
            </div>
          </div>

          <div className="flex flex-col items-center text-center max-w-4xl mx-auto">
            {/* Trust Pill */}
            <motion.div
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4 }}
              className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full border border-border bg-card/70 backdrop-blur-xs text-[12px] font-medium text-muted-foreground mb-6 shadow-xs"
            >
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span>Official Meta Instagram Graph API</span>
              <span className="text-border">·</span>
              <span className="text-foreground font-semibold">Self-Hosted &amp; Open Source</span>
            </motion.div>

            {/* Main Headline */}
            <motion.h1
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.1 }}
              className="text-4xl sm:text-6xl lg:text-[72px] font-heading font-extrabold tracking-tight text-foreground leading-[1.08] mb-6"
            >
              Turn Instagram Comments Into{" "}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#f09433] via-[#e6683c] to-[#bc1888]">
                Conversations.
              </span>
            </motion.h1>

            {/* Subhead */}
            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.2 }}
              className="text-lg sm:text-xl text-muted-foreground max-w-2xl leading-relaxed mb-10"
            >
              Automate public comment replies and instant direct message delivery through the official Instagram Graph API. Increase engagement, deliver lead magnets, and protect your account with intelligent rate limits and spike prevention.
            </motion.p>

            {/* Call to Actions */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.3 }}
              className="flex flex-col sm:flex-row items-center gap-3.5 w-full sm:w-auto"
            >
              <Link
                href="/login"
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-7 py-3.5 rounded-xl font-heading font-semibold text-[15px] bg-foreground text-background hover:opacity-90 transition-all shadow-md hover:shadow-lg"
              >
                <span>Get Started</span>
                <ArrowRight className="w-4 h-4" />
              </Link>
              <a
                href="#how-it-works"
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl font-heading font-semibold text-[15px] border border-border bg-card/60 hover:bg-muted text-foreground transition-colors"
              >
                <span>See How It Works</span>
                <ChevronDown className="w-4 h-4 text-muted-foreground" />
              </a>
            </motion.div>

            {/* Trust highlights checklist */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.6, delay: 0.4 }}
              className="flex flex-wrap items-center justify-center gap-y-2 gap-x-6 text-[12.5px] text-muted-foreground font-medium mt-10 pt-4"
            >
              <div className="flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                <span>100% Official Meta Webhooks</span>
              </div>
              <div className="flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                <span>Traffic Guard Rate Limiting</span>
              </div>
              <div className="flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                <span>Zero Third-Party Data Sharing</span>
              </div>
            </motion.div>

            {/* Consistent Instagram Safety Disclaimer */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.6, delay: 0.42 }}
              className="mt-6 text-center max-w-xl mx-auto"
            >
              <p className="text-[11.5px] text-muted-foreground/80 leading-relaxed">
                <span className="font-semibold text-foreground/90">Safety &amp; Compliance Notice:</span> open-autoDM uses official Meta Graph API webhooks and built-in Traffic Guard rate limiting and safeguards to help protect your account. No tool can guarantee immunity from platform restrictions; account owners remain responsible for ensuring messaging content and frequency comply with Meta Community Guidelines. open-autoDM is an independent open-source project and is not affiliated with, sponsored by, or endorsed by Meta Platforms, Inc. or Instagram.
              </p>
            </motion.div>
          </div>

          {/* ──────────────────────────────────────────────────────────────────────────
              HERO PRODUCT ILLUSTRATION: 4-STEP PIPELINE SHOWCASE
          ────────────────────────────────────────────────────────────────────────── */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.45 }}
            className="mt-16 max-w-5xl mx-auto"
          >
            <div className="rounded-2xl border border-border bg-card shadow-2xl overflow-hidden">
              {/* Product window title bar */}
              <div className="px-5 py-3.5 border-b border-border bg-muted/30 flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <div className="w-3 h-3 rounded-full bg-red-400/80" />
                  <div className="w-3 h-3 rounded-full bg-yellow-400/80" />
                  <div className="w-3 h-3 rounded-full bg-emerald-400/80" />
                  <span className="text-xs font-mono text-muted-foreground ml-2 hidden sm:inline">
                    open-autoDM // Automation Execution Pipeline
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="hidden sm:inline-flex items-center gap-1 text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-muted text-muted-foreground border border-border">
                    Interactive Simulation
                  </span>
                  <span className="inline-flex items-center gap-1.5 text-[11px] font-mono px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-semibold border border-emerald-500/20">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping" />
                    Traffic Guard Active
                  </span>
                </div>
              </div>

              {/* Interactive Scenario Selector & Simulation Controls Bar */}
              <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 border-b border-border bg-muted/15">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground mr-1">
                    Select Scenario:
                  </span>
                  {PIPELINE_SCENARIOS.map((scenario) => {
                    const isSelected = scenario.id === activeScenarioId;
                    return (
                      <button
                        key={scenario.id}
                        type="button"
                        onClick={() => {
                          setActiveScenarioId(scenario.id);
                          setActivePipelineStep(1);
                          setIsSimulating(false);
                        }}
                        className={`px-2.5 py-1 rounded-md text-xs font-mono font-medium border transition-all ${
                          isSelected
                            ? "bg-primary text-primary-foreground border-primary shadow-xs font-semibold"
                            : "bg-card border-border text-muted-foreground hover:text-foreground hover:bg-muted"
                        }`}
                        aria-pressed={isSelected}
                        aria-label={`Select ${scenario.label}`}
                      >
                        {scenario.keyword}
                      </button>
                    );
                  })}
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={isSimulating ? () => setIsSimulating(false) : handleRunSimulation}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-foreground text-background hover:opacity-90 transition-opacity shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    aria-label={isSimulating ? "Pause simulation" : "Run comment to DM pipeline simulation"}
                  >
                    {isSimulating ? (
                      <>
                        <Pause className="w-3.5 h-3.5" />
                        <span>Pause</span>
                      </>
                    ) : (
                      <>
                        <Play className="w-3.5 h-3.5 fill-current" />
                        <span>{activePipelineStep === 4 ? "Replay Simulation" : "Run Simulation"}</span>
                      </>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={handleResetSimulation}
                    className="p-1.5 rounded-lg border border-border text-muted-foreground hover:text-foreground hover:bg-muted transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    title="Reset simulation to Step 1"
                    aria-label="Reset simulation to Step 1"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Simulation Progress Line */}
              <div className="h-0.5 bg-border/40 w-full overflow-hidden">
                <div
                  className="h-full bg-primary transition-all duration-500 ease-out"
                  style={{ width: `${(activePipelineStep / 4) * 100}%` }}
                />
              </div>

              {/* Step Navigation Tabs with Keyboard Arrow Accessibility */}
              <div
                role="tablist"
                aria-label="Pipeline execution steps"
                className="grid grid-cols-2 sm:grid-cols-4 border-b border-border bg-muted/10"
              >
                {currentScenario.steps.map((step) => {
                  const isActive = step.id === activePipelineStep;
                  return (
                    <button
                      key={step.id}
                      id={`step-tab-${step.id}`}
                      role="tab"
                      aria-selected={isActive}
                      aria-controls={`step-panel-${step.id}`}
                      tabIndex={isActive ? 0 : -1}
                      onClick={() => {
                        setIsSimulating(false);
                        setActivePipelineStep(step.id);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "ArrowRight") {
                          e.preventDefault();
                          const next = step.id === 4 ? 1 : step.id + 1;
                          setIsSimulating(false);
                          setActivePipelineStep(next);
                          document.getElementById(`step-tab-${next}`)?.focus();
                        } else if (e.key === "ArrowLeft") {
                          e.preventDefault();
                          const prev = step.id === 1 ? 4 : step.id - 1;
                          setIsSimulating(false);
                          setActivePipelineStep(prev);
                          document.getElementById(`step-tab-${prev}`)?.focus();
                        }
                      }}
                      className={`px-4 py-3 text-left transition-all relative border-r last:border-r-0 border-border/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary ${
                        isActive
                          ? "bg-card text-foreground font-semibold"
                          : "text-muted-foreground hover:bg-muted/40 hover:text-foreground"
                      }`}
                    >
                      <div className="text-[10px] uppercase font-mono tracking-wider text-primary mb-0.5">
                        {step.badge}
                      </div>
                      <div className="text-xs sm:text-[13px] font-heading font-medium truncate">
                        {step.title}
                      </div>
                      {isActive && (
                        <div className="absolute bottom-0 left-0 right-0 h-[2.5px] bg-primary" />
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Step Detail Content */}
              <div
                id={`step-panel-${currentStep.id}`}
                role="tabpanel"
                aria-labelledby={`step-tab-${currentStep.id}`}
                className="p-6 sm:p-8"
              >
                {/* Live screen reader announcement */}
                <div className="sr-only" aria-live="polite">
                  {`Simulation Step ${currentStep.id} of 4: ${currentStep.title}. ${currentStep.statusText}`}
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
                  {/* Left explanation column */}
                  <div className="lg:col-span-5 space-y-4">
                    <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-primary/10 text-primary text-xs font-mono font-semibold">
                      {currentStep.badge} — {currentStep.subtitle}
                    </div>
                    <h3 className="text-2xl font-heading font-bold text-foreground">
                      {currentStep.title}
                    </h3>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      {currentStep.summary}
                    </p>

                    <div className="pt-2">
                      <span
                        className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-mono font-medium border ${currentStep.statusColor}`}
                      >
                        <Check className="w-3.5 h-3.5" />
                        <span>{currentStep.statusText}</span>
                      </span>
                    </div>

                    <div className="pt-4 flex items-center gap-2 text-xs text-muted-foreground">
                      <span>Click steps above to explore the workflow</span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </div>
                  </div>

                  {/* Right simulated UI card */}
                  <div className="lg:col-span-7">
                    <div className="p-5 sm:p-6 rounded-xl border border-border bg-muted/20 font-sans shadow-inner">
                      {currentStep.id === 1 && (
                        <div className="space-y-4">
                          <div className="text-xs font-mono text-muted-foreground uppercase tracking-wider mb-2">
                            Simulated Instagram Post &amp; Comment
                          </div>
                          {/* Post Card */}
                          <div className="p-4 rounded-lg bg-card border border-border">
                            <div className="flex items-center space-x-2.5 mb-2">
                              <div className="w-7 h-7 rounded-full bg-gradient-to-tr from-amber-500 to-pink-500" />
                              <span className="text-xs font-semibold text-foreground">
                                {currentStep.postAuthor}
                              </span>
                            </div>
                            <p className="text-xs text-muted-foreground">
                              {currentStep.postCaption}
                            </p>
                          </div>

                          {/* Incoming Comment */}
                          <div className="p-4 rounded-lg bg-primary/5 border border-primary/20 space-y-1.5">
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-semibold text-foreground">
                                @{currentStep.commentUser}
                              </span>
                              <span className="text-[11px] font-mono text-emerald-600 dark:text-emerald-400 font-semibold">
                                ✓ Trigger Match
                              </span>
                            </div>
                            <p className="text-xs text-foreground font-medium">
                              {currentStep.commentText}
                            </p>
                          </div>
                        </div>
                      )}

                      {currentStep.id === 2 && (
                        <div className="space-y-3">
                          <div className="text-xs font-mono text-muted-foreground uppercase tracking-wider mb-2">
                            Safety Checks &amp; Guard Clearance
                          </div>
                          <div className="space-y-2">
                            {currentStep.checks.map((chk, i) => (
                              <div
                                key={i}
                                className="flex items-center justify-between p-3 rounded-lg bg-card border border-border text-xs"
                              >
                                <span className="font-medium text-foreground">{chk.label}</span>
                                <span className="font-mono text-emerald-600 dark:text-emerald-400 font-semibold flex items-center gap-1">
                                  <Check className="w-3 h-3" />
                                  {chk.result}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {currentStep.id === 3 && (
                        <div className="space-y-4">
                          <div className="text-xs font-mono text-muted-foreground uppercase tracking-wider mb-2">
                            Automated Public Comment Reply
                          </div>
                          <div className="p-4 rounded-lg bg-card border border-border space-y-2">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center space-x-2">
                                <div className="w-6 h-6 rounded-full bg-gradient-to-tr from-amber-500 to-pink-500" />
                                <span className="text-xs font-semibold text-foreground">
                                  @{currentStep.authorReply} (Creator)
                                </span>
                              </div>
                              <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-amber-500/10 text-amber-600 dark:text-amber-400 font-semibold border border-amber-500/20">
                                {currentStep.variation}
                              </span>
                            </div>
                            <p className="text-xs text-foreground/90 pl-8 leading-relaxed">
                              {currentStep.replyText}
                            </p>
                          </div>
                          <div className="p-3 rounded-lg bg-muted/40 border border-border text-xs text-muted-foreground flex items-center gap-2">
                            <Sparkles className="w-4 h-4 text-primary shrink-0" />
                            <span>
                              Variations can be crafted manually or drafted using Cloudflare Workers AI in the builder.
                            </span>
                          </div>
                        </div>
                      )}

                      {currentStep.id === 4 && (
                        <div className="space-y-4">
                          <div className="text-xs font-mono text-muted-foreground uppercase tracking-wider mb-2">
                            Automated Private Direct Message
                          </div>
                          <div className="p-4 rounded-lg bg-card border border-border space-y-3">
                            <div className="flex items-center justify-between border-b border-border pb-2.5">
                              <div className="flex items-center space-x-2">
                                <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center text-primary text-[11px] font-bold">
                                  DM
                                </div>
                                <span className="text-xs font-semibold text-foreground">
                                  To: @{currentStep.dmRecipient}
                                </span>
                              </div>
                              <span className="text-[10px] font-mono text-muted-foreground">
                                Just now
                              </span>
                            </div>
                            <p className="text-xs text-foreground whitespace-pre-line leading-relaxed font-mono bg-muted/20 p-3 rounded-md border border-border/60">
                              {currentStep.dmBody}
                            </p>
                            <div className="text-[11px] font-mono text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span>{currentStep.deliveredVia}</span>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ──────────────────────────────────────────────────────────────────────────
          3. FEATURES SECTION (#features)
      ────────────────────────────────────────────────────────────────────────── */}
      <section id="features" className="py-20 sm:py-28 border-t border-border bg-card/30 relative z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-40px" }}
            transition={{ duration: 0.55, ease: "easeOut" }}
          >
            <div className="text-center max-w-3xl mx-auto mb-16 sm:mb-20">
              <span className="text-[11px] font-mono uppercase tracking-widest text-primary font-semibold bg-primary/10 px-2.5 py-1 rounded">
                Supported Capabilities
              </span>
              <h2 className="text-3xl sm:text-5xl font-heading font-extrabold tracking-tight text-foreground mt-4 mb-4">
                Everything You Need to Scale Instagram Engagement
              </h2>
              <p className="text-base sm:text-lg text-muted-foreground leading-relaxed">
                Engineered for creators, digital educators, and high-growth brands who demand precision, fast delivery, and strict adherence to platform safety.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-8">
              {FEATURES.map((feature, idx) => {
                const Icon = feature.icon;
                return (
                  <div
                    key={idx}
                    tabIndex={0}
                    role="article"
                    aria-label={feature.title}
                    className="group relative p-7 rounded-2xl bg-card border border-border hover:border-primary/40 focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 transition-all duration-300 ease-out shadow-xs hover:shadow-xl hover:shadow-primary/5 hover:-translate-y-1.5 flex flex-col justify-between overflow-hidden cursor-default"
                  >
                    {/* Subtle top glow line */}
                    <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-primary/0 to-transparent group-hover:via-primary/70 group-focus-visible:via-primary/70 transition-all duration-500" />

                    <div>
                      <div className="w-12 h-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center mb-6 group-hover:scale-110 group-hover:bg-primary/20 group-focus-visible:scale-110 group-focus-visible:bg-primary/20 transition-all duration-300">
                        <Icon className="w-6 h-6 transition-transform duration-300 group-hover:rotate-3" />
                      </div>
                      <h3 className="text-xl font-heading font-bold text-foreground mb-2.5 group-hover:text-primary transition-colors duration-200">
                        {feature.title}
                      </h3>
                      <p className="text-sm text-muted-foreground leading-relaxed">
                        {feature.description}
                      </p>
                    </div>

                    {/* Feature card interactive bottom indicator */}
                    <div className="mt-6 pt-4 border-t border-border/40 flex items-center justify-between text-xs font-mono text-muted-foreground/70">
                      <span className="flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                        <span>Ready in Builder</span>
                      </span>
                      <ArrowRight className="w-3.5 h-3.5 text-muted-foreground/40 transform -translate-x-1 group-hover:translate-x-0 group-hover:text-primary transition-all duration-200" />
                    </div>
                  </div>
                );
              })}
            </div>
          </motion.div>
        </div>
      </section>

      {/* ──────────────────────────────────────────────────────────────────────────
          4. HOW IT WORKS SECTION (#how-it-works)
      ────────────────────────────────────────────────────────────────────────── */}
      <section id="how-it-works" className="py-20 sm:py-28 border-t border-border relative z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-40px" }}
            transition={{ duration: 0.55, ease: "easeOut" }}
          >
            <div className="text-center max-w-3xl mx-auto mb-16 sm:mb-20">
              <span className="text-[11px] font-mono uppercase tracking-widest text-primary font-semibold bg-primary/10 px-2.5 py-1 rounded">
                Simple 4-Step Setup
              </span>
              <h2 className="text-3xl sm:text-5xl font-heading font-extrabold tracking-tight text-foreground mt-4 mb-4">
                From Comment to Conversion in Minutes
              </h2>
              <p className="text-base sm:text-lg text-muted-foreground leading-relaxed">
                No messy node-based flowcharts. Our structured step-by-step wizard guides you from Instagram connection to active, guarded automation.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {SETUP_STEPS.map((s, idx) => (
                <div
                  key={idx}
                  className="p-6 rounded-2xl bg-card border border-border relative overflow-hidden flex flex-col justify-between"
                >
                  <div>
                    <div className="text-4xl font-heading font-extrabold text-primary/30 mb-4">
                      {s.step}
                    </div>
                    <h3 className="text-lg font-heading font-bold text-foreground mb-2">
                      {s.title}
                    </h3>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      {s.description}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-12 text-center">
              <Link
                href="/login"
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl font-heading font-semibold text-sm bg-foreground text-background hover:opacity-90 transition-opacity"
              >
                <span>Build Your First Automation</span>
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ──────────────────────────────────────────────────────────────────────────
          5. DEDICATED TRAFFIC GUARD SECTION (#traffic-guard)
      ────────────────────────────────────────────────────────────────────────── */}
      <section id="traffic-guard" className="py-20 sm:py-28 border-t border-border bg-card/30 relative z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-40px" }}
            transition={{ duration: 0.55, ease: "easeOut" }}
          >
            <div className="text-center max-w-3xl mx-auto mb-16">
              <span className="text-[11px] font-mono uppercase tracking-widest text-primary font-semibold bg-primary/10 px-2.5 py-1 rounded">
                Creator Account Protection
              </span>
              <h2 className="text-3xl sm:text-5xl font-heading font-extrabold tracking-tight text-foreground mt-4 mb-4">
                Automation With More Control.
              </h2>
              <p className="text-base sm:text-lg text-muted-foreground leading-relaxed">
                Standard automation tools blast messages until Meta restricts your account. Traffic Guard operates in the background, enforcing safety thresholds and rate limits.
              </p>
            </div>

            {/* 4 Guard Pillars Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-12">
              <div className="p-7 rounded-2xl bg-card border border-border">
                <div className="w-10 h-10 rounded-lg bg-emerald-500/10 text-emerald-500 flex items-center justify-center mb-4">
                  <Zap className="w-5 h-5" />
                </div>
                <h3 className="text-lg font-heading font-bold text-foreground mb-2">
                  Comment Spike Monitoring &amp; Velocity Control
                </h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  When a Reel goes viral, incoming comments can spike into the thousands. Traffic Guard monitors incoming velocity and buffers outbound responses, helping your account stay within safe rate thresholds.
                </p>
              </div>

              <div className="p-7 rounded-2xl bg-card border border-border">
                <div className="w-10 h-10 rounded-lg bg-sky-500/10 text-sky-500 flex items-center justify-center mb-4">
                  <Sliders className="w-5 h-5" />
                </div>
                <h3 className="text-lg font-heading font-bold text-foreground mb-2">
                  Sliding-Window Rate Limiting
                </h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Outbound direct messages are regulated via hourly and daily sliding windows that strictly adhere to Meta&apos;s published Graph API quotas, designed to help prevent automated spam flags.
                </p>
              </div>

              <div className="p-7 rounded-2xl bg-card border border-border">
                <div className="w-10 h-10 rounded-lg bg-amber-500/10 text-amber-500 flex items-center justify-center mb-4">
                  <Lock className="w-5 h-5" />
                </div>
                <h3 className="text-lg font-heading font-bold text-foreground mb-2">
                  Atomic Deduplication &amp; Idempotency
                </h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Uses database reservations (<code className="font-mono text-xs">comment_private_reply_reservations</code>) to guarantee each follower receives at most one DM per post, regardless of how many times they comment.
                </p>
              </div>

              <div className="p-7 rounded-2xl bg-card border border-border">
                <div className="w-10 h-10 rounded-lg bg-red-500/10 text-red-500 flex items-center justify-center mb-4">
                  <ShieldAlert className="w-5 h-5" />
                </div>
                <h3 className="text-lg font-heading font-bold text-foreground mb-2">
                  Automated Protective Pauses
                </h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  If webhook delivery errors or abnormal traffic surges are detected, Traffic Guard can pause automations, log the incident, and protect your queue until you safely review.
                </p>
              </div>
            </div>

            {/* CRITICAL SAFETY DISCLAIMER CARD */}
            <div className="p-6 sm:p-8 rounded-2xl border border-amber-500/30 bg-amber-500/5 dark:bg-amber-950/15">
              <div className="flex items-start gap-4">
                <div className="p-2 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5">
                  <AlertTriangle className="w-5 h-5" />
                </div>
                <div className="space-y-2">
                  <h4 className="text-base font-heading font-bold text-foreground">
                    Platform Compliance &amp; Account Safety Notice
                  </h4>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    Open AutoDM is engineered to comply with the official Instagram Graph API and incorporates conservative safeguards including rate limits and protective pauses. However, Meta continuously updates its platform integrity algorithms. <strong className="text-foreground">No software tool can guarantee an account will never be restricted or flagged by Instagram.</strong>
                  </p>
                  <p className="text-xs text-muted-foreground leading-relaxed pt-1">
                    Account owners are responsible for ensuring their messaging content, volume, and engagement practices comply with Meta&apos;s Community Guidelines and Platform Terms. Avoid deceptive language, respect recipient opt-outs, and monitor your automation analytics regularly.
                  </p>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ──────────────────────────────────────────────────────────────────────────
          6. TRUST & META INTEGRATION SECTION
      ────────────────────────────────────────────────────────────────────────── */}
      <section className="py-20 sm:py-28 border-t border-border relative z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-40px" }}
            transition={{ duration: 0.55, ease: "easeOut" }}
          >
            <div className="text-center max-w-3xl mx-auto mb-16">
              <span className="text-[11px] font-mono uppercase tracking-widest text-primary font-semibold bg-primary/10 px-2.5 py-1 rounded">
                Platform Integrity
              </span>
              <h2 className="text-3xl sm:text-5xl font-heading font-extrabold tracking-tight text-foreground mt-4 mb-4">
                Built on Official Meta APIs. Zero Hacks.
              </h2>
              <p className="text-base sm:text-lg text-muted-foreground leading-relaxed">
                We believe in complete transparency. Open AutoDM communicates directly through official Meta developer endpoints, without unofficial browser emulators or scraped session tokens.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <div className="p-6 rounded-xl bg-card border border-border space-y-3">
                <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
                  <CheckCircle2 className="w-4 h-4" />
                </div>
                <h3 className="font-heading font-bold text-foreground text-base">
                  Official Webhooks
                </h3>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Direct integration with Meta&apos;s <code className="font-mono text-[11px]">instagram_manage_comments</code> and <code className="font-mono text-[11px]">instagram_manage_messages</code> webhooks.
                </p>
              </div>

              <div className="p-6 rounded-xl bg-card border border-border space-y-3">
                <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
                  <Lock className="w-4 h-4" />
                </div>
                <h3 className="font-heading font-bold text-foreground text-base">
                  Cryptographic Security
                </h3>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Every webhook payload is verified via HMAC-SHA256 signatures (<code className="font-mono text-[11px]">X-Hub-Signature-256</code>) using your encrypted Meta App Secret.
                </p>
              </div>

              <div className="p-6 rounded-xl bg-card border border-border space-y-3">
                <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
                  <Server className="w-4 h-4" />
                </div>
                <h3 className="font-heading font-bold text-foreground text-base">
                  Self-Hosted Data
                </h3>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Deployed on your own Cloudflare Worker and Supabase database. Your credentials and audience data are never exposed to third parties.
                </p>
              </div>

              <div className="p-6 rounded-xl bg-card border border-border space-y-3">
                <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
                  <ShieldCheck className="w-4 h-4" />
                </div>
                <h3 className="font-heading font-bold text-foreground text-base">
                  Compliant Callbacks
                </h3>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Full support for Meta&apos;s required deauthorization and data deletion callbacks (<code className="font-mono text-[11px]">/api/instagram/*</code>).
                </p>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ──────────────────────────────────────────────────────────────────────────
          7. REVIEWS & FEEDBACK SECTION (#reviews)
      ────────────────────────────────────────────────────────────────────────── */}
      <section id="reviews" className="py-20 sm:py-28 border-t border-border bg-card/30 relative z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-40px" }}
            transition={{ duration: 0.55, ease: "easeOut" }}
          >
            <div className="text-center max-w-3xl mx-auto mb-16">
              <span className="text-[11px] font-mono uppercase tracking-widest text-primary font-semibold bg-primary/10 px-2.5 py-1 rounded">
                Creator Community
              </span>
              <h2 className="text-3xl sm:text-5xl font-heading font-extrabold tracking-tight text-foreground mt-4 mb-4">
                Early Access &amp; Community Feedback
              </h2>
              <p className="text-base sm:text-lg text-muted-foreground leading-relaxed">
                Open AutoDM is currently in early-access community testing. We invite creator feedback to refine our safeguards and automation workflows.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 sm:gap-8 mb-12">
              {REVIEWS.map((rev, idx) => (
                <div
                  key={idx}
                  className="p-7 rounded-2xl bg-card border border-border flex flex-col justify-between shadow-xs"
                >
                  <div>
                    <div className="text-xs font-mono font-semibold uppercase tracking-wider text-primary mb-2">
                      {rev.tag}
                    </div>
                    <h4 className="font-heading font-bold text-foreground text-base mb-3">
                      {rev.headline}
                    </h4>
                    <p className="text-sm text-foreground/90 leading-relaxed mb-6">
                      {rev.quote}
                    </p>
                  </div>
                  <div className="pt-4 border-t border-border">
                    <div className="font-heading font-bold text-foreground text-sm">
                      {rev.name}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {rev.role}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Invitation for early tester feedback */}
            <div className="p-6 rounded-xl border border-border bg-card text-center max-w-xl mx-auto">
              <h3 className="font-heading font-bold text-foreground text-base mb-1">
                Are you testing Open AutoDM?
              </h3>
              <p className="text-xs text-muted-foreground mb-3">
                We value genuine community feedback. Share your thoughts or feature requests directly with the development team.
              </p>
              <a
                href="mailto:work.techhacksai@gmail.com"
                className="text-xs font-mono font-semibold text-primary hover:underline"
              >
                Contact Developer → work.techhacksai@gmail.com
              </a>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ──────────────────────────────────────────────────────────────────────────
          8. FAQ SECTION (#faq)
      ────────────────────────────────────────────────────────────────────────── */}
      <section id="faq" className="py-20 sm:py-28 border-t border-border relative z-10">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-40px" }}
            transition={{ duration: 0.55, ease: "easeOut" }}
          >
            <div className="text-center mb-16">
              <span className="text-[11px] font-mono uppercase tracking-widest text-primary font-semibold bg-primary/10 px-2.5 py-1 rounded">
                Frequently Asked Questions
              </span>
              <h2 className="text-3xl sm:text-5xl font-heading font-extrabold tracking-tight text-foreground mt-4 mb-4">
                Everything You Need to Know
              </h2>
              <p className="text-base text-muted-foreground leading-relaxed">
                Transparent answers regarding platform compliance, account safety, and technical setup.
              </p>
            </div>

            <div className="space-y-4">
              {FAQS.map((faq, index) => {
                const isOpen = openFaqIndex === index;
                return (
                  <div
                    key={index}
                    className="rounded-xl border border-border bg-card overflow-hidden transition-colors"
                  >
                    <button
                      onClick={() => setOpenFaqIndex(isOpen ? null : index)}
                      className="w-full p-5 text-left flex items-center justify-between gap-4 font-heading font-bold text-base text-foreground hover:bg-muted/30 transition-colors"
                    >
                      <span>{faq.question}</span>
                      <ChevronDown
                        className={`w-4 h-4 text-muted-foreground shrink-0 transition-transform duration-200 ${
                          isOpen ? "transform rotate-180" : ""
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
                          className="px-5 pb-5 text-sm text-muted-foreground leading-relaxed border-t border-border/50 pt-3"
                        >
                          {faq.answer}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                );
              })}
            </div>
          </motion.div>
        </div>
      </section>

      {/* ──────────────────────────────────────────────────────────────────────────
          9. FINAL CALL TO ACTION BANNER
      ────────────────────────────────────────────────────────────────────────── */}
      <section className="py-20 border-t border-border bg-card/60 relative z-10">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-40px" }}
            transition={{ duration: 0.55, ease: "easeOut" }}
          >
            <h2 className="text-3xl sm:text-5xl font-heading font-extrabold tracking-tight text-foreground mb-4">
              Ready to Turn Comments Into Conversations?
            </h2>
            <p className="text-base sm:text-lg text-muted-foreground max-w-2xl mx-auto mb-8 leading-relaxed">
              Get started today with open-source Instagram comment automation backed by real-time Traffic Guard protection.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link
                href="/login"
                className="inline-flex items-center justify-center gap-2 px-8 py-4 rounded-xl font-heading font-semibold text-base bg-foreground text-background hover:opacity-90 transition-opacity shadow-lg"
              >
                <span>Get Started</span>
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>

            {/* Consistent Instagram Safety Disclaimer */}
            <div className="mt-8 text-center max-w-xl mx-auto">
              <p className="text-[11.5px] text-muted-foreground/80 leading-relaxed">
                <span className="font-semibold text-foreground/90">Safety &amp; Compliance Notice:</span> open-autoDM uses official Meta Graph API webhooks and built-in Traffic Guard rate limiting and safeguards to help protect your account. No tool can guarantee immunity from platform restrictions; account owners remain responsible for ensuring messaging content and frequency comply with Meta Community Guidelines. open-autoDM is an independent open-source project and is not affiliated with, sponsored by, or endorsed by Meta Platforms, Inc. or Instagram.
              </p>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ──────────────────────────────────────────────────────────────────────────
          10. FOOTER
      ────────────────────────────────────────────────────────────────────────── */}
      <footer className="border-t border-border bg-card/40 relative z-10 pt-16 pb-12 text-sm text-muted-foreground">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-10 mb-12">
            {/* Col 1: Brand */}
            <div className="space-y-4">
              <Link href="/" className="flex items-center space-x-2.5">
                <LogoMark className="w-7 h-7" />
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
                  <a href="#features" className="hover:text-foreground transition-colors">
                    Features
                  </a>
                </li>
                <li>
                  <a href="#how-it-works" className="hover:text-foreground transition-colors">
                    How It Works
                  </a>
                </li>
                <li>
                  <a href="#traffic-guard" className="hover:text-foreground transition-colors">
                    Traffic Guard
                  </a>
                </li>
                <li>
                  <Link href="/pricing" className="hover:text-foreground transition-colors">
                    Pricing
                  </Link>
                </li>
                <li>
                  <a href="#reviews" className="hover:text-foreground transition-colors">
                    Reviews
                  </a>
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

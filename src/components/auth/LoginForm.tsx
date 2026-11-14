"use client";

import { useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { Loader2, LogIn, Mail, Copy, Check, Sparkles, ArrowRight, Lock } from "lucide-react";
import { createBrowserClient } from "@/lib/supabase";
import { LogoMark } from "@/components/ui/Logo";

type PlanKey = "trial" | "starter" | "creator-plus";

const PLAN_DETAILS: Record<PlanKey, { name: string; price: string; period: string; accounts: string }> = {
    trial: {
        name: "Free Trial",
        price: "$0",
        period: "30-Day Evaluation",
        accounts: "1 connected account",
    },
    starter: {
        name: "Starter",
        price: "$5 / mo",
        period: "Monthly",
        accounts: "1 connected account",
    },
    "creator-plus": {
        name: "Creator Plus",
        price: "$9 / mo",
        period: "Monthly",
        accounts: "Up to 3 connected accounts",
    },
};

function LoginFormInner() {
    const searchParams = useSearchParams();
    const planParam = searchParams.get("plan");
    const modeParam = searchParams.get("mode");

    const initialPlan: PlanKey =
        planParam === "starter" || planParam === "creator-plus" ? planParam : "trial";

    const [mode, setMode] = useState<"signin" | "request">(
        planParam || modeParam === "request" ? "request" : "signin"
    );
    const [selectedPlan, setSelectedPlan] = useState<PlanKey>(initialPlan);
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);

    const plan = PLAN_DETAILS[selectedPlan];
    const operatorEmail = "work.techhacksai@gmail.com";

    const emailSubject = `[Open AutoDM] Early Access Request — ${plan.name}`;
    const emailBody = `Hello Open AutoDM Team,\n\nI would like to request early access to the Open AutoDM automation console.\n\n- Requested Plan: ${plan.name} (${plan.price} · ${plan.period})\n- Connected Accounts: ${plan.accounts}\n- Instagram Handle: @[your_handle]\n- Account Type: [Creator / Business]\n- Primary Automation Goal: [e.g., Reel comment-to-DM, lead magnet delivery]\n- Preferred Login Email: [your_email]\n\nThank you!`;

    const mailtoUrl = `mailto:${operatorEmail}?subject=${encodeURIComponent(emailSubject)}&body=${encodeURIComponent(emailBody)}`;

    const handleCopyTemplate = async () => {
        try {
            if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
                await navigator.clipboard.writeText(
                    `To: ${operatorEmail}\nSubject: ${emailSubject}\n\n${emailBody}`
                );
                setCopied(true);
                setTimeout(() => setCopied(false), 3000);
            }
        } catch {
            // ignore clipboard errors
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        setError(null);
        const supabase = createBrowserClient();

        try {
            const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
            if (signInError) {
                setError(signInError.message);
                return;
            }
            window.location.href = "/dashboard";
        } catch {
            setError("Something went wrong. Try again.");
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: "easeOut", delay: 0.15 }}
            className="w-full max-w-sm bg-card border border-border rounded-xl shadow-xl shadow-black/5 dark:shadow-black/40 overflow-hidden"
        >
            {/* The warm sunset thread */}
            <div className="h-[2px] w-full ig-thread" />

            {/* Mode Toggle Header */}
            <div className="flex border-b border-border bg-muted/40 p-1 text-xs font-medium">
                <button
                    type="button"
                    onClick={() => {
                        setMode("signin");
                        setError(null);
                    }}
                    className={`flex-1 py-1.5 rounded-md transition-all text-center ${
                        mode === "signin"
                            ? "bg-card text-foreground font-semibold shadow-xs"
                            : "text-muted-foreground hover:text-foreground"
                    }`}
                >
                    Sign In
                </button>
                <button
                    type="button"
                    onClick={() => {
                        setMode("request");
                        setError(null);
                    }}
                    className={`flex-1 py-1.5 rounded-md transition-all text-center flex items-center justify-center gap-1.5 ${
                        mode === "request"
                            ? "bg-card text-foreground font-semibold shadow-xs"
                            : "text-muted-foreground hover:text-foreground"
                    }`}
                >
                    <Sparkles className="w-3 h-3 text-primary" />
                    <span>Request Access</span>
                </button>
            </div>

            <div className="p-7">
                {mode === "signin" ? (
                    <div>
                        <div className="flex flex-col mb-6">
                            <LogoMark className="w-8 h-8 mb-4" />
                            <h1 className="text-lg font-heading font-semibold tracking-tight text-foreground mb-1">
                                Welcome back
                            </h1>
                            <p className="text-[13px] text-muted-foreground">
                                Sign in to your automation console.
                            </p>
                        </div>

                        <form onSubmit={(e) => void handleSubmit(e)} className="flex flex-col space-y-3">
                            {error && <p className="text-[12.5px] text-destructive font-medium">{error}</p>}

                            <div>
                                <label className="micro-label block mb-1">Email</label>
                                <input
                                    type="email"
                                    required
                                    autoComplete="email"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    placeholder="you@example.com"
                                    className="w-full h-10 px-3 text-[13.5px] bg-background border border-border rounded-lg outline-none focus:border-foreground/30 focus-visible:ring-2 focus-visible:ring-ring/30 transition-colors"
                                />
                            </div>
                            <div>
                                <label className="micro-label block mb-1">Password</label>
                                <input
                                    type="password"
                                    required
                                    autoComplete="current-password"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    placeholder="••••••••••••"
                                    className="w-full h-10 px-3 text-[13.5px] bg-background border border-border rounded-lg outline-none focus:border-foreground/30 focus-visible:ring-2 focus-visible:ring-ring/30 transition-colors"
                                />
                            </div>

                            <button
                                type="submit"
                                disabled={isLoading}
                                className="flex items-center justify-center gap-2 w-full h-10 mt-1 text-[13.5px] font-semibold bg-foreground text-background rounded-lg hover:opacity-90 disabled:opacity-60 transition-opacity focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                            >
                                {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogIn className="w-4 h-4" />}
                                {isLoading ? "Signing in…" : "Sign in"}
                            </button>
                        </form>

                        <div className="mt-6 pt-5 border-t border-border space-y-2">
                            <p className="text-[11.5px] text-muted-foreground leading-relaxed">
                                Need early access? Open AutoDM instances are private.
                            </p>
                            <button
                                type="button"
                                onClick={() => setMode("request")}
                                className="inline-flex items-center gap-1.5 text-xs text-primary font-medium hover:underline focus:outline-none"
                            >
                                <span>Request early access from instance operator</span>
                                <ArrowRight className="w-3.5 h-3.5" />
                            </button>
                        </div>
                    </div>
                ) : (
                    <div>
                        <div className="flex flex-col mb-5">
                            <div className="inline-flex items-center gap-1.5 text-xs font-mono font-semibold text-primary mb-2">
                                <Sparkles className="w-3.5 h-3.5" />
                                <span>Early Access Request</span>
                            </div>
                            <h1 className="text-lg font-heading font-semibold tracking-tight text-foreground mb-1">
                                Request Early Access
                            </h1>
                            <p className="text-[12.5px] text-muted-foreground leading-relaxed">
                                Open AutoDM is in private early access. Public self-serve signups and payment checkouts are not open yet.
                            </p>
                        </div>

                        {/* Plan selection pills */}
                        <div className="mb-4">
                            <label className="text-[11px] font-mono uppercase font-semibold text-muted-foreground block mb-1.5">
                                Desired Plan
                            </label>
                            <div className="grid grid-cols-3 gap-1.5 p-1 rounded-lg bg-muted/50 border border-border">
                                {(["trial", "starter", "creator-plus"] as PlanKey[]).map((pKey) => {
                                    const p = PLAN_DETAILS[pKey];
                                    const isSel = selectedPlan === pKey;
                                    return (
                                        <button
                                            key={pKey}
                                            type="button"
                                            onClick={() => setSelectedPlan(pKey)}
                                            className={`py-1.5 px-1 rounded-md text-[11px] font-medium transition-all text-center flex flex-col items-center justify-center ${
                                                isSel
                                                    ? "bg-card text-foreground font-semibold shadow-xs border border-border"
                                                    : "text-muted-foreground hover:text-foreground"
                                            }`}
                                        >
                                            <span className="truncate w-full">{p.name}</span>
                                            <span className="text-[10px] text-primary font-mono">{p.price}</span>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Selected Plan Details Callout */}
                        <div className="p-3 rounded-lg border border-border bg-muted/30 mb-4 space-y-1 text-xs">
                            <div className="flex items-center justify-between font-semibold text-foreground">
                                <span>{plan.name}</span>
                                <span className="font-mono text-primary">{plan.price}</span>
                            </div>
                            <div className="text-[11.5px] text-muted-foreground">
                                {plan.period} &bull; {plan.accounts}
                            </div>
                        </div>

                        {/* Honest contact actions */}
                        <div className="space-y-2 mb-4">
                            <a
                                href={mailtoUrl}
                                className="flex items-center justify-center gap-2 w-full h-10 text-[13px] font-semibold bg-foreground text-background rounded-lg hover:opacity-90 transition-opacity shadow-sm"
                            >
                                <Mail className="w-4 h-4" />
                                <span>Email Operator to Request Access</span>
                            </a>

                            <button
                                type="button"
                                onClick={() => void handleCopyTemplate()}
                                className="flex items-center justify-center gap-1.5 w-full h-9 text-[12px] font-medium border border-border bg-background hover:bg-muted text-foreground rounded-lg transition-colors"
                            >
                                {copied ? (
                                    <>
                                        <Check className="w-3.5 h-3.5 text-emerald-500" />
                                        <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
                                            Request Template Copied!
                                        </span>
                                    </>
                                ) : (
                                    <>
                                        <Copy className="w-3.5 h-3.5 text-muted-foreground" />
                                        <span>Copy Email &amp; Request Template</span>
                                    </>
                                )}
                            </button>
                        </div>

                        {/* Operator Contact Display */}
                        <div className="p-2.5 rounded-lg border border-border/80 bg-background/50 text-[11px] text-muted-foreground text-center font-mono">
                            Operator: <a href={`mailto:${operatorEmail}`} className="text-foreground font-semibold hover:underline">{operatorEmail}</a>
                        </div>

                        <div className="mt-5 pt-4 border-t border-border flex items-center justify-between text-xs">
                            <span className="text-muted-foreground">Returning user?</span>
                            <button
                                type="button"
                                onClick={() => setMode("signin")}
                                className="text-primary font-medium hover:underline focus:outline-none"
                            >
                                Sign in to console
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </motion.div>
    );
}

/**
 * LoginForm with Suspense wrapper to safely support useSearchParams in Next.js App Router.
 */
export function LoginForm() {
    return (
        <Suspense
            fallback={
                <div className="w-full max-w-sm bg-card border border-border rounded-xl p-8 min-h-[380px] animate-pulse flex flex-col justify-center items-center text-muted-foreground text-xs font-mono">
                    Loading console...
                </div>
            }
        >
            <LoginFormInner />
        </Suspense>
    );
}

"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Loader2, LogIn } from "lucide-react";
import { createBrowserClient } from "@/lib/supabase";
import { LogoMark } from "@/components/ui/Logo";

/**
 * Sign-in only — there is deliberately NO registration flow.
 *
 * Accounts are created by the instance owner in the Supabase dashboard:
 * Authentication → Users → Add user (with "Auto Confirm User" checked).
 * Pair this with disabling public signups in Supabase
 * (Authentication → Sign In / Providers → "Allow new users to sign up" OFF)
 * so the API can't be used to self-register either.
 */
export function LoginForm() {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

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
            setError("Something went wrong. Please try again.");
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: "easeOut", delay: 0.2 }}
            className="w-full max-w-md p-8 sm:p-12 bg-white dark:bg-[#0A0A0A] border border-border rounded-[2rem] shadow-2xl shadow-black/10 dark:shadow-black/50 relative overflow-hidden group"
        >
            {/* Decorative glow */}
            <div className="absolute top-0 right-0 w-[300px] h-[300px] bg-primary/5 rounded-full blur-[80px] -translate-y-1/2 translate-x-1/2 pointer-events-none transition-all duration-700 ease-in-out group-hover:bg-primary/10"></div>

            <div className="flex flex-col mb-8 text-left relative z-10">
                <motion.div
                    initial={{ rotate: -10 }}
                    animate={{ rotate: 0 }}
                    transition={{ type: "spring", stiffness: 200, damping: 10 }}
                >
                    <LogoMark className="w-11 h-11 mb-8" />
                </motion.div>
                <h1 className="text-4xl font-heading font-bold tracking-tight text-foreground mb-3">
                    Welcome back
                </h1>
                <p className="text-muted-foreground text-[15px] font-medium tracking-tight">
                    Sign in to your self-hosted automation hub.
                </p>
            </div>

            <form onSubmit={(e) => void handleSubmit(e)} className="flex flex-col space-y-4 relative z-10">
                {error && <p className="text-sm text-destructive font-medium">{error}</p>}

                <input
                    type="email"
                    required
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="w-full px-4 py-3.5 text-sm bg-background border border-border rounded-2xl outline-none focus:border-primary/60 focus:ring-2 focus:ring-primary/20 transition-all font-medium"
                />
                <input
                    type="password"
                    required
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Your password"
                    className="w-full px-4 py-3.5 text-sm bg-background border border-border rounded-2xl outline-none focus:border-primary/60 focus:ring-2 focus:ring-primary/20 transition-all font-medium"
                />

                <button
                    type="submit"
                    disabled={isLoading}
                    className="relative overflow-hidden flex items-center justify-center w-full px-5 py-4 space-x-3 text-sm font-semibold transition-all duration-300 bg-foreground dark:bg-white text-background dark:text-black rounded-2xl hover:scale-[1.02] shadow-xl shadow-foreground/10 disabled:opacity-70 disabled:cursor-not-allowed disabled:hover:scale-100"
                >
                    {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <LogIn className="w-[18px] h-[18px]" />}
                    <span>{isLoading ? "Signing in..." : "Sign In"}</span>
                </button>
            </form>

            <div className="mt-8 text-center relative z-10">
                <p className="text-[12px] text-muted-foreground leading-relaxed font-medium">
                    No account? Access is invite-only — the instance owner creates users in the
                    Supabase dashboard <span className="text-foreground/70 font-semibold">(Authentication → Users → Add user)</span>.
                </p>
                <div className="mt-6 flex items-center justify-center space-x-2">
                    <div className="w-2 h-2 rounded-full bg-secondary animate-pulse"></div>
                    <p className="text-[12px] font-semibold text-foreground tracking-tight">
                        100% open source · Your data stays on your infrastructure.
                    </p>
                </div>
            </div>
        </motion.div>
    );
}

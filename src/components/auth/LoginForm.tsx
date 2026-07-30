"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Loader2, LogIn } from "lucide-react";
import { createBrowserClient } from "@/lib/supabase";
import { LogoMark } from "@/components/ui/Logo";

/**
 * Sign-in only - there is deliberately NO registration flow.
 * Accounts are created by the instance owner in the Supabase dashboard
 * (Authentication → Users → Add user), with public signups disabled.
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
            {/* The warm thread */}
            <div className="h-[2px] w-full ig-thread" />

            <div className="p-8">
                <div className="flex flex-col mb-7">
                    <LogoMark className="w-9 h-9 mb-5" />
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

                <div className="mt-6 pt-5 border-t border-border">
                    <p className="text-[11.5px] text-muted-foreground leading-relaxed">
                        No account? Access is invite-only - the instance owner creates users in the
                        Supabase dashboard <span className="text-foreground/70 font-medium">(Authentication → Users → Add user)</span>.
                    </p>
                </div>
            </div>
        </motion.div>
    );
}

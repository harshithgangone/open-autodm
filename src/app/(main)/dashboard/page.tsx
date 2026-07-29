"use client";

import Link from "next/link";
import { Bot, Send, Instagram, Wrench, CheckCircle2, Circle, ArrowRight, Sparkles } from "lucide-react";
import { useAutomations } from "@/hooks/useAutomations";
import { useInstagramAccounts } from "@/hooks/useInstagramAccounts";
import { useSetupStatus } from "@/hooks/useSetup";
import { cn } from "@/lib/utils";

export default function DashboardPage() {
    const { data: automations } = useAutomations();
    const { data: accounts } = useInstagramAccounts();
    const { data: setup } = useSetupStatus();

    const activeCount = automations?.filter(a => a.is_active).length ?? 0;
    const totalDms = automations?.reduce((sum, a) => sum + a.total_dms_sent, 0) ?? 0;
    const connectedAccount = accounts?.[0] ?? null;

    const checklist = [
        { label: "Meta app credentials saved", done: !!setup?.configured, href: "/setup" },
        { label: "Instagram account connected", done: !!connectedAccount, href: "/settings" },
        { label: "First automation created", done: (automations?.length ?? 0) > 0, href: "/automations" },
        { label: "First automation activated", done: activeCount > 0, href: "/automations" },
    ];
    const allDone = checklist.every(c => c.done);

    return (
        <div className="w-full max-w-7xl mx-auto space-y-8 pb-12">

            {/* Header Section */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl lg:text-4xl font-heading font-extrabold tracking-tight text-foreground flex items-center space-x-3">
                        <span>Welcome to</span>
                        <span className="bg-clip-text text-transparent bg-gradient-to-r from-[#f09433] via-[#e6683c] to-[#bc1888]">
                            open-autoDM
                        </span>
                    </h1>
                    <p className="text-muted-foreground mt-1 text-sm lg:text-base">
                        Your self-hosted Instagram automation hub — running on your own infrastructure.
                    </p>
                </div>

                <Link
                    href="/automations"
                    className="inline-flex items-center justify-center space-x-2 bg-foreground text-background hover:bg-foreground/90 px-5 py-2.5 rounded-xl font-semibold shadow-lg shadow-foreground/10 transition-transform active:scale-95"
                >
                    <Sparkles className="w-4 h-4" />
                    <span>New Automation</span>
                </Link>
            </div>

            {/* Real stats */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 lg:gap-6 pt-4">
                {[
                    { label: "Active Automations", value: String(activeCount), icon: Bot, color: "text-[#F97316]", bg: "bg-[#F97316]/10" },
                    { label: "Total Automations", value: String(automations?.length ?? 0), icon: Sparkles, color: "text-blue-500", bg: "bg-blue-500/10" },
                    { label: "DMs Delivered", value: totalDms.toLocaleString(), icon: Send, color: "text-green-500", bg: "bg-green-500/10" },
                    { label: "Connected Account", value: connectedAccount ? `@${connectedAccount.username}` : "—", icon: Instagram, color: "text-purple-500", bg: "bg-purple-500/10" }
                ].map((stat, i) => (
                    <div key={i} className="bg-card border border-border/50 rounded-2xl p-5 flex flex-col shadow-sm backdrop-blur-sm">
                        <div className="flex items-center justify-between mb-4">
                            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${stat.bg}`}>
                                <stat.icon className={`w-4 h-4 ${stat.color}`} />
                            </div>
                        </div>
                        <h3 className="text-2xl font-bold text-foreground font-heading truncate">{stat.value}</h3>
                        <p className="text-xs font-medium text-muted-foreground mt-1 uppercase tracking-wider">{stat.label}</p>
                    </div>
                ))}
            </div>

            {/* Main Workspace Area */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 pt-6">

                <div className="col-span-1 lg:col-span-2 space-y-6">
                    <div className="bg-card rounded-2xl border border-border/50 p-6 lg:p-8 relative overflow-hidden min-h-[400px]">
                        <div className="absolute top-0 right-0 w-[400px] h-[400px] bg-primary/5 blur-[120px] rounded-full pointer-events-none" />

                        <h2 className="text-xl font-heading font-bold mb-2 relative z-10">Getting Started</h2>
                        <p className="text-sm text-muted-foreground mb-8 relative z-10">
                            {allDone
                                ? "Everything is configured — your automations are live. 🎉"
                                : "Complete these steps to bring your automation hub online."}
                        </p>

                        <div className="space-y-3 relative z-10">
                            {checklist.map((item) => (
                                <Link key={item.label} href={item.href} className="block group">
                                    <div className={cn(
                                        "flex items-center justify-between p-4 rounded-xl border transition-colors",
                                        item.done
                                            ? "bg-emerald-500/5 border-emerald-500/20"
                                            : "bg-muted/30 border-border/50 hover:border-primary/40"
                                    )}>
                                        <div className="flex items-center space-x-3">
                                            {item.done
                                                ? <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />
                                                : <Circle className="w-5 h-5 text-muted-foreground/40 shrink-0" />}
                                            <span className={cn(
                                                "text-sm font-semibold",
                                                item.done ? "text-foreground/70 line-through decoration-emerald-500/40" : "text-foreground"
                                            )}>
                                                {item.label}
                                            </span>
                                        </div>
                                        {!item.done && (
                                            <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-primary group-hover:translate-x-0.5 transition-all" />
                                        )}
                                    </div>
                                </Link>
                            ))}
                        </div>
                    </div>
                </div>

                <div className="col-span-1 space-y-6">
                    <div className="bg-card rounded-2xl border border-border/50 p-6">
                        <h2 className="text-lg font-heading font-bold mb-4">System Status</h2>
                        <div className="space-y-3">
                            <div className="flex items-center justify-between p-3 rounded-xl bg-muted/40 border border-border/50">
                                <div className="flex items-center space-x-3">
                                    <span className={cn("w-2 h-2 rounded-full", setup?.configured ? "bg-green-500 animate-pulse" : "bg-amber-500")} />
                                    <span className="text-sm font-medium">Meta App</span>
                                </div>
                                <span className="text-xs text-muted-foreground bg-background px-2 py-1 rounded-md">
                                    {setup?.configured ? "Configured" : "Pending"}
                                </span>
                            </div>
                            <div className="flex items-center justify-between p-3 rounded-xl bg-muted/40 border border-border/50">
                                <div className="flex items-center space-x-3">
                                    <span className={cn("w-2 h-2 rounded-full", connectedAccount ? "bg-green-500 animate-pulse" : "bg-amber-500")} />
                                    <span className="text-sm font-medium">Instagram</span>
                                </div>
                                <span className="text-xs text-muted-foreground bg-background px-2 py-1 rounded-md">
                                    {connectedAccount ? "Connected" : "Not connected"}
                                </span>
                            </div>
                            <div className="flex items-center justify-between p-3 rounded-xl bg-muted/40 border border-border/50">
                                <div className="flex items-center space-x-3">
                                    <span className={cn("w-2 h-2 rounded-full", activeCount > 0 ? "bg-green-500 animate-pulse" : "bg-muted-foreground/40")} />
                                    <span className="text-sm font-medium">Automation Engine</span>
                                </div>
                                <span className="text-xs text-muted-foreground bg-background px-2 py-1 rounded-md">
                                    {activeCount > 0 ? `${activeCount} live` : "Idle"}
                                </span>
                            </div>
                        </div>

                        {!setup?.configured && (
                            <Link
                                href="/setup"
                                className="mt-5 flex items-center justify-center gap-2 w-full py-2.5 rounded-xl bg-[#F97316] text-white text-sm font-bold hover:bg-[#ea580c] transition-colors shadow-lg shadow-[#F97316]/20"
                            >
                                <Wrench className="w-4 h-4" />
                                Open Setup Wizard
                            </Link>
                        )}
                    </div>
                </div>

            </div>

        </div>
    );
}

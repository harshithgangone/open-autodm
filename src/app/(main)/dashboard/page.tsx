"use client";

import Link from "next/link";
import { useState, useMemo } from "react";
import {
    Bot,
    Send,
    Instagram,
    MessageCircle,
    Wrench,
    CheckCircle2,
    Circle,
    ArrowRight,
    Plus,
    Shield,
    Sparkles,
    Clock,
    Activity,
    AlertTriangle,
    ChevronDown,
    ExternalLink,
    RefreshCw,
    X,
} from "lucide-react";
import { useAutomations, useUpdateAutomation, type AutomationFromDB } from "@/hooks/useAutomations";
import { useContacts } from "@/hooks/useContacts";
import { useAnalytics } from "@/hooks/useAnalytics";
import { useActiveAccount } from "@/hooks/useActiveAccount";
import { useSetupStatus } from "@/hooks/useSetup";
import { useActivity, type ActivityItem } from "@/hooks/useActivity";
import { TrafficGuardCard } from "@/components/dashboard/TrafficGuardCard";
import { cn } from "@/lib/utils";

function formatRelativeTime(dateStr: string): string {
    const timestamp = new Date(dateStr).getTime();
    if (isNaN(timestamp)) return "Recent";
    const diffSec = Math.floor((Date.now() - timestamp) / 1000);
    if (diffSec < 60) return "Just now";
    if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
    if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
    return `${Math.floor(diffSec / 86400)}d ago`;
}

export default function DashboardPage() {
    const { account: connectedAccount, accountId, accounts, setActiveAccount, isLoading: isAccountLoading } = useActiveAccount();
    const { data: automations, isLoading: isAutomationsLoading, refetch: refetchAutomations } = useAutomations(accountId);
    const { data: setup } = useSetupStatus();
    const { data: contacts } = useContacts(accountId);
    const { data: activities, isLoading: isActivityLoading } = useActivity(accountId, 15);
    const updateMutation = useUpdateAutomation();

    // Chart period filter: 7 days or 30 days
    const [periodDays, setPeriodDays] = useState<7 | 30>(7);
    const [confirmActivateAuto, setConfirmActivateAuto] = useState<AutomationFromDB | null>(null);

    const analyticsRange = useMemo(() => {
        const now = Date.now();
        return {
            from: new Date(now - periodDays * 86400_000).toISOString(),
            to: new Date(now).toISOString(),
        };
    }, [periodDays]);

    const { data: analytics, isLoading: isAnalyticsLoading, refetch: refetchAnalytics } = useAnalytics({
        ...analyticsRange,
        automationId: "all",
        accountId,
    });

    const activeAutomations = useMemo(() => automations?.filter(a => a.is_active) ?? [], [automations]);
    const activeCount = activeAutomations.length;
    const totalAutomationsCount = automations?.length ?? 0;
    const totalDms = useMemo(() => automations?.reduce((sum, a) => sum + a.total_dms_sent, 0) ?? 0, [automations]);

    // Onboarding progress
    const checklist = useMemo(() => [
        { label: "Save your Meta app credentials", done: !!setup?.configured, href: "/setup" },
        { label: "Connect your Instagram account", done: !!connectedAccount, href: "/settings" },
        { label: "Create your first automation", done: totalAutomationsCount > 0, href: "/automations" },
        { label: "Configure opening DM & follow-up", done: automations?.some(a => a.dm_opening_message_enabled || a.follow_up_enabled) ?? false, href: "/automations" },
        { label: "Activate your automation", done: activeCount > 0, href: "/automations" },
    ], [setup?.configured, connectedAccount, totalAutomationsCount, automations, activeCount]);

    const completedSteps = checklist.filter(c => c.done).length;
    const allDone = completedSteps === checklist.length;
    const progressPercent = Math.round((completedSteps / checklist.length) * 100);

    // Performance metrics cards
    const stats = [
        {
            label: "Active Automations",
            value: `${activeCount}/${totalAutomationsCount}`,
            hint: activeCount > 0 ? `${activeCount} live and responding` : "No active automations",
            icon: Bot,
        },
        {
            label: `Comments · ${periodDays}d`,
            value: (analytics?.totals.comments ?? 0).toLocaleString(),
            hint: `${(analytics?.totals.comments ?? 0)} triggers recorded`,
            icon: MessageCircle,
        },
        {
            label: "DMs Delivered",
            value: totalDms.toLocaleString(),
            hint: `${(analytics?.totals.delivered ?? 0)} sent in past ${periodDays}d`,
            icon: Send,
        },
        {
            label: "Contacts Captured",
            value: (contacts?.length ?? 0).toLocaleString(),
            hint: `${(analytics?.totals.followsGained ?? 0)} followers gained`,
            icon: Sparkles,
        },
    ];

    // Activity timeline series
    const dailySeries = useMemo(() => {
        if (!analytics?.daily) return [];
        return analytics.daily.slice(-periodDays);
    }, [analytics?.daily, periodDays]);

    const maxChartValue = useMemo(() => {
        if (!dailySeries.length) return 10;
        const max = Math.max(...dailySeries.map(d => Math.max(d.comments, d.delivered)), 0);
        return max > 0 ? max : 10;
    }, [dailySeries]);

    const handleToggleAutomation = (auto: AutomationFromDB) => {
        if (auto.is_active) {
            // Turning off is safe without modal
            updateMutation.mutate({ id: auto.id, is_active: false });
        } else {
            // Turning on requires confirmation to prevent accidental live messages
            setConfirmActivateAuto(auto);
        }
    };

    const confirmActivation = () => {
        if (!confirmActivateAuto) return;
        updateMutation.mutate({ id: confirmActivateAuto.id, is_active: true });
        setConfirmActivateAuto(null);
    };

    return (
        <div className="w-full max-w-6xl mx-auto space-y-8 pb-16" data-testid="dashboard-page">

            {/* ── Confirmation Modal for Activating Automation ── */}
            {confirmActivateAuto && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
                    <div className="w-full max-w-md bg-card border border-border rounded-xl shadow-xl p-5 space-y-4">
                        <div className="flex items-start gap-3">
                            <div className="p-2 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400 shrink-0">
                                <AlertTriangle className="w-5 h-5" />
                            </div>
                            <div>
                                <h3 className="text-[14px] font-semibold text-foreground">Activate Automation?</h3>
                                <p className="text-[12.5px] text-muted-foreground mt-1">
                                    Activating <strong className="text-foreground">{confirmActivateAuto.name}</strong> will allow it to process new Instagram events and send automated replies to real users.
                                </p>
                            </div>
                        </div>
                        <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
                            <button
                                type="button"
                                onClick={() => setConfirmActivateAuto(null)}
                                className="px-3 py-1.5 rounded-lg border border-border text-[12.5px] font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={confirmActivation}
                                className="px-3.5 py-1.5 rounded-lg bg-primary text-primary-foreground text-[12.5px] font-semibold hover:opacity-90 transition-opacity"
                                data-testid="btn-confirm-activate"
                            >
                                Confirm & Activate
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Header Area ── */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border/60 pb-6">
                <div>
                    <div className="flex items-center gap-2 flex-wrap">
                        <h1 className="text-2xl font-heading font-semibold tracking-tight text-foreground">
                            {connectedAccount ? (
                                <>Welcome back, <span className="text-transparent bg-clip-text ig-thread">@{connectedAccount.username}</span></>
                            ) : (
                                "Welcome to open-autoDM"
                            )}
                        </h1>
                        {connectedAccount && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-secondary/15 text-secondary border border-secondary/20">
                                <span className="w-1.5 h-1.5 rounded-full bg-secondary animate-pulse" />
                                Connected
                            </span>
                        )}
                    </div>
                    <p className="text-[13px] text-muted-foreground mt-1">
                        High-performance, policy-compliant Instagram automation command center.
                    </p>
                </div>

                <div className="flex items-center gap-2.5 flex-wrap">
                    {/* Multi-Account Selector */}
                    {accounts.length > 1 && (
                        <div className="relative">
                            <select
                                value={accountId ?? ""}
                                onChange={(e) => setActiveAccount(e.target.value || null)}
                                className="h-9 pl-3 pr-8 rounded-lg bg-card border border-border text-[12.5px] font-medium text-foreground outline-none focus:ring-2 focus:ring-primary/20 appearance-none cursor-pointer"
                                data-testid="account-selector"
                            >
                                {accounts.map((acc) => (
                                    <option key={acc.id} value={acc.id}>
                                        @{acc.username || acc.name || acc.id}
                                    </option>
                                ))}
                            </select>
                            <ChevronDown className="w-3.5 h-3.5 text-muted-foreground absolute right-2.5 top-3 pointer-events-none" />
                        </div>
                    )}

                    <a
                        href="#traffic-guard"
                        className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-border bg-card text-[12.5px] font-medium text-foreground hover:bg-muted/50 transition-colors"
                        data-testid="link-traffic-guard"
                    >
                        <Shield className="w-3.5 h-3.5 text-secondary" />
                        Traffic Guard
                    </a>

                    <Link
                        href="/automations"
                        className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-lg bg-primary text-primary-foreground text-[12.5px] font-semibold hover:opacity-90 transition-opacity focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 shadow-sm"
                        data-testid="btn-new-automation"
                    >
                        <Plus className="w-3.5 h-3.5" />
                        New Automation
                    </Link>
                </div>
            </div>

            {/* ── Performance Overview Cards ── */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5" data-testid="performance-metrics-grid">
                {stats.map((stat) => (
                    <div
                        key={stat.label}
                        className="bg-card border border-border rounded-xl p-4.5 hover:border-foreground/20 transition-all flex flex-col justify-between"
                    >
                        <div className="flex items-center justify-between">
                            <span className="micro-label text-muted-foreground font-semibold">{stat.label}</span>
                            <div className="p-1.5 rounded-lg bg-muted/60 text-muted-foreground">
                                <stat.icon className="w-4 h-4" />
                            </div>
                        </div>
                        <div className="mt-3">
                            <p className="text-2xl lg:text-3xl font-heading font-semibold tracking-tight text-foreground tabular-nums">
                                {stat.value}
                            </p>
                            <p className="text-[11.5px] text-muted-foreground mt-0.5 truncate">{stat.hint}</p>
                        </div>
                    </div>
                ))}
            </div>

            {/* ── Activity Timeline & Performance Section ── */}
            <div className="bg-card border border-border rounded-xl p-5 space-y-4" data-testid="activity-chart-section">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border/50 pb-3">
                    <div>
                        <h2 className="text-[14px] font-heading font-semibold text-foreground flex items-center gap-2">
                            <Activity className="w-4 h-4 text-primary" />
                            Activity & Performance
                        </h2>
                        <p className="text-[12px] text-muted-foreground mt-0.5">
                            Daily comment triggers and delivered direct messages.
                        </p>
                    </div>

                    <div className="flex items-center gap-2">
                        <div className="inline-flex p-0.5 bg-muted rounded-lg border border-border" data-testid="period-filter">
                            <button
                                type="button"
                                onClick={() => setPeriodDays(7)}
                                className={cn(
                                    "px-2.5 py-1 text-[11.5px] font-semibold rounded-md transition-colors",
                                    periodDays === 7
                                        ? "bg-card text-foreground shadow-sm"
                                        : "text-muted-foreground hover:text-foreground"
                                )}
                                data-testid="btn-period-7d"
                            >
                                7 Days
                            </button>
                            <button
                                type="button"
                                onClick={() => setPeriodDays(30)}
                                className={cn(
                                    "px-2.5 py-1 text-[11.5px] font-semibold rounded-md transition-colors",
                                    periodDays === 30
                                        ? "bg-card text-foreground shadow-sm"
                                        : "text-muted-foreground hover:text-foreground"
                                )}
                                data-testid="btn-period-30d"
                            >
                                30 Days
                            </button>
                        </div>

                        <button
                            type="button"
                            onClick={() => { refetchAnalytics(); refetchAutomations(); }}
                            className="p-1.5 rounded-lg border border-border bg-card hover:bg-muted/50 text-muted-foreground transition-colors"
                            aria-label="Refresh metrics"
                        >
                            <RefreshCw className={cn("w-3.5 h-3.5", isAnalyticsLoading && "animate-spin")} />
                        </button>
                    </div>
                </div>

                {/* Bar chart or empty state */}
                {dailySeries.length > 0 && dailySeries.some(d => d.comments > 0 || d.delivered > 0) ? (
                    <div className="space-y-3 pt-2">
                        <div className="h-44 w-full flex items-end gap-1.5 sm:gap-2 pt-4 px-1" data-testid="daily-bar-chart">
                            {dailySeries.map((d) => {
                                const commentHeight = Math.max(4, Math.round((d.comments / maxChartValue) * 100));
                                const deliveredHeight = Math.max(4, Math.round((d.delivered / maxChartValue) * 100));
                                return (
                                    <div key={d.date} className="flex-1 flex flex-col items-center gap-1 group relative">
                                        {/* Hover Tooltip */}
                                        <div className="absolute -top-10 left-1/2 -translate-x-1/2 hidden group-hover:flex flex-col items-center z-20 pointer-events-none">
                                            <div className="bg-popover text-popover-foreground border border-border px-2 py-1 rounded text-[10px] font-medium shadow-md whitespace-nowrap">
                                                <span>{d.date}: </span>
                                                <span className="text-primary font-semibold">{d.comments} comments</span>,{" "}
                                                <span className="text-secondary font-semibold">{d.delivered} DMs</span>
                                            </div>
                                        </div>

                                        <div className="w-full flex items-end justify-center gap-0.5 h-36">
                                            <div
                                                style={{ height: `${d.comments > 0 ? commentHeight : 0}%` }}
                                                className="w-1/2 max-w-[12px] bg-primary/80 rounded-t transition-all group-hover:bg-primary"
                                                title={`Comments: ${d.comments}`}
                                            />
                                            <div
                                                style={{ height: `${d.delivered > 0 ? deliveredHeight : 0}%` }}
                                                className="w-1/2 max-w-[12px] bg-secondary/80 rounded-t transition-all group-hover:bg-secondary"
                                                title={`DMs Delivered: ${d.delivered}`}
                                            />
                                        </div>
                                        <span className="text-[10px] text-muted-foreground/70 truncate w-full text-center">
                                            {d.date.slice(5)}
                                        </span>
                                    </div>
                                );
                            })}
                        </div>

                        {/* Legend */}
                        <div className="flex items-center justify-center gap-5 text-[11.5px] text-muted-foreground pt-1 border-t border-border/40">
                            <span className="flex items-center gap-1.5">
                                <span className="w-2.5 h-2.5 rounded-sm bg-primary" />
                                Comments Received
                            </span>
                            <span className="flex items-center gap-1.5">
                                <span className="w-2.5 h-2.5 rounded-sm bg-secondary" />
                                Private DMs Delivered
                            </span>
                        </div>
                    </div>
                ) : (
                    <div className="py-10 text-center space-y-2" data-testid="chart-empty-state">
                        <div className="w-9 h-9 mx-auto rounded-full bg-muted flex items-center justify-center text-muted-foreground">
                            <Activity className="w-4 h-4" />
                        </div>
                        <p className="text-[13px] font-medium text-foreground">No traffic recorded in this period</p>
                        <p className="text-[11.5px] text-muted-foreground max-w-sm mx-auto">
                            When users leave comments or send DMs matching your active automations, real delivery metrics will appear here.
                        </p>
                    </div>
                )}
            </div>

            {/* ── Automations Overview & Recent Activity (2 columns) ── */}
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">

                {/* Automations Overview (3 cols) */}
                <div className="lg:col-span-3 bg-card border border-border rounded-xl p-5 space-y-4 flex flex-col justify-between" data-testid="automations-overview">
                    <div className="space-y-3">
                        <div className="flex items-center justify-between border-b border-border/50 pb-3">
                            <div>
                                <h2 className="text-[14px] font-heading font-semibold text-foreground">Automations</h2>
                                <p className="text-[12px] text-muted-foreground mt-0.5">
                                    {totalAutomationsCount} configured · {activeCount} active
                                </p>
                            </div>
                            <Link
                                href="/automations"
                                className="text-[12px] font-semibold text-primary hover:underline flex items-center gap-1"
                            >
                                Manage all <ArrowRight className="w-3 h-3" />
                            </Link>
                        </div>

                        {/* Automations List */}
                        {isAutomationsLoading ? (
                            <div className="py-8 text-center text-[12.5px] text-muted-foreground">Loading automations…</div>
                        ) : (automations?.length ?? 0) > 0 ? (
                            <div className="space-y-2">
                                {automations?.slice(0, 4).map((auto) => (
                                    <div
                                        key={auto.id}
                                        className="p-3 rounded-lg border border-border bg-muted/20 hover:border-foreground/20 transition-all flex items-center justify-between gap-3"
                                        data-testid={`automation-row-${auto.id}`}
                                    >
                                        <div className="min-w-0">
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <p className="text-[13px] font-semibold text-foreground truncate">{auto.name}</p>
                                                <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-muted text-muted-foreground border border-border">
                                                    {auto.type === "comment_dm" ? "Comment DM" : auto.type === "story_reply" ? "Story Reply" : "DM Keyword"}
                                                </span>
                                                {auto.follow_up_enabled && (
                                                    <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-primary/10 text-primary border border-primary/20">
                                                        Follow-up ({auto.follow_up_delay_minutes ?? 60}m)
                                                    </span>
                                                )}
                                            </div>
                                            <p className="text-[11.5px] text-muted-foreground mt-0.5 truncate">
                                                {auto.keywords?.length ? `Keywords: ${auto.keywords.join(", ")}` : "Triggers on all matching events"} · {auto.total_dms_sent} sent
                                            </p>
                                        </div>

                                        <div className="flex items-center gap-2.5 shrink-0">
                                            <span className={cn(
                                                "px-2 py-0.5 rounded-full text-[10.5px] font-semibold inline-flex items-center gap-1",
                                                auto.is_traffic_guard_paused
                                                    ? "bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30"
                                                    : auto.is_active
                                                        ? "bg-secondary/15 text-secondary border border-secondary/20"
                                                        : "bg-muted text-muted-foreground border border-border"
                                            )}>
                                                <span className={cn(
                                                    "w-1.5 h-1.5 rounded-full",
                                                    auto.is_traffic_guard_paused ? "bg-amber-500" : auto.is_active ? "bg-secondary" : "bg-muted-foreground"
                                                )} />
                                                {auto.is_traffic_guard_paused ? "Paused by Guard" : auto.is_active ? "Active" : "Inactive"}
                                            </span>

                                            <button
                                                type="button"
                                                role="switch"
                                                aria-checked={auto.is_active}
                                                onClick={() => handleToggleAutomation(auto)}
                                                className={cn(
                                                    "relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
                                                    auto.is_active ? "bg-secondary" : "bg-muted-foreground/30"
                                                )}
                                                data-testid={`toggle-automation-${auto.id}`}
                                            >
                                                <span className={cn(
                                                    "inline-block h-4 w-4 translate-y-[2px] rounded-full bg-white shadow-sm transition-transform duration-200",
                                                    auto.is_active ? "translate-x-[18px]" : "translate-x-[2px]"
                                                )} />
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="py-8 text-center space-y-2">
                                <p className="text-[13px] font-medium text-foreground">No automations configured</p>
                                <p className="text-[11.5px] text-muted-foreground max-w-xs mx-auto">
                                    Set up your first automated DM flow to turn post comments into engaged conversations.
                                </p>
                                <Link
                                    href="/automations"
                                    className="inline-flex items-center gap-1 text-[12px] font-semibold text-primary hover:underline pt-1"
                                >
                                    Create automation <ArrowRight className="w-3 h-3" />
                                </Link>
                            </div>
                        )}
                    </div>

                    <div className="pt-3 border-t border-border/40 text-[11.5px] text-muted-foreground flex items-center justify-between">
                        <span>Protected by Smart Comment Traffic Guard</span>
                        <Link href="/automations" className="hover:text-foreground">View all automations</Link>
                    </div>
                </div>

                {/* Recent Activity Feed (2 cols) */}
                <div className="lg:col-span-2 bg-card border border-border rounded-xl p-5 space-y-3 flex flex-col justify-between" data-testid="recent-activity-feed">
                    <div className="space-y-3">
                        <div className="flex items-center justify-between border-b border-border/50 pb-3">
                            <h2 className="text-[14px] font-heading font-semibold text-foreground flex items-center gap-1.5">
                                <Clock className="w-4 h-4 text-muted-foreground" />
                                Recent Activity
                            </h2>
                            <span className="text-[11px] text-muted-foreground font-medium">Real Event Trail</span>
                        </div>

                        {isActivityLoading ? (
                            <div className="py-8 text-center text-[12.5px] text-muted-foreground">Loading activity…</div>
                        ) : (activities?.length ?? 0) > 0 ? (
                            <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1 custom-scrollbar">
                                {activities?.map((act) => (
                                    <div
                                        key={act.id}
                                        className="p-2.5 rounded-lg border border-border/60 bg-muted/20 text-[12px] space-y-1"
                                        data-testid="activity-item"
                                    >
                                        <div className="flex items-center justify-between gap-2">
                                            <span className="font-semibold text-foreground truncate">{act.automationName}</span>
                                            <span className={cn(
                                                "px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider shrink-0",
                                                act.status === "sent" ? "bg-secondary/15 text-secondary" :
                                                act.status === "scheduled" ? "bg-primary/15 text-primary" :
                                                act.status === "held" ? "bg-amber-500/15 text-amber-600 dark:text-amber-400" :
                                                act.status === "waiting_response" ? "bg-amber-500/15 text-amber-600 dark:text-amber-400" :
                                                act.status === "failed" ? "bg-destructive/15 text-destructive" :
                                                "bg-muted text-muted-foreground"
                                            )}>
                                                {act.status}
                                            </span>
                                        </div>
                                        <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                                            <span className="capitalize">{act.type.replace(/_/g, " ")}</span>
                                            <span>{formatRelativeTime(act.timestamp)}</span>
                                        </div>
                                        {act.errorMessage && (
                                            <p className="text-[10.5px] text-destructive truncate">{act.errorMessage}</p>
                                        )}
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="py-8 text-center space-y-2">
                                <p className="text-[12.5px] font-medium text-foreground">No recent events</p>
                                <p className="text-[11px] text-muted-foreground">
                                    Triggered DMs, comments, and scheduled follow-ups will be listed here in real time.
                                </p>
                            </div>
                        )}
                    </div>

                    <div className="pt-2 border-t border-border/40 text-[11px] text-muted-foreground">
                        Private message contents are sanitized to protect privacy.
                    </div>
                </div>
            </div>

            {/* ── Smart Comment Traffic Guard Monitor Panel ── */}
            <div id="traffic-guard" className="pt-2">
                <TrafficGuardCard accountId={accountId} />
            </div>

            {/* ── Onboarding & System Health (2 columns) ── */}
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">

                {/* Getting started checklist (3 cols) */}
                <div className="lg:col-span-3 bg-card border border-border rounded-xl p-5 space-y-4">
                    <div>
                        <div className="flex items-center justify-between">
                            <h2 className="text-[14px] font-heading font-semibold text-foreground">Getting Started Guide</h2>
                            <span className="text-[12px] font-semibold text-primary tabular-nums">{progressPercent}% Completed</span>
                        </div>
                        {/* Progress Bar */}
                        <div className="w-full bg-muted rounded-full h-1.5 mt-2 overflow-hidden">
                            <div
                                className="bg-primary h-full transition-all duration-300 rounded-full"
                                style={{ width: `${progressPercent}%` }}
                            />
                        </div>
                    </div>

                    <div className="space-y-1.5">
                        {checklist.map((item) => (
                            <Link
                                key={item.label}
                                href={item.href}
                                className="block group focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 rounded-lg"
                            >
                                <div className={cn(
                                    "flex items-center justify-between h-10 px-3 rounded-lg border transition-colors",
                                    item.done
                                        ? "border-transparent bg-muted/40"
                                        : "border-border hover:border-foreground/25 hover:bg-muted/20"
                                )}>
                                    <div className="flex items-center gap-2.5 min-w-0">
                                        {item.done ? (
                                            <CheckCircle2 className="w-4 h-4 text-secondary shrink-0" />
                                        ) : (
                                            <Circle className="w-4 h-4 text-muted-foreground/40 shrink-0" />
                                        )}
                                        <span className={cn(
                                            "text-[12.5px] truncate",
                                            item.done ? "text-muted-foreground line-through" : "text-foreground font-medium"
                                        )}>
                                            {item.label}
                                        </span>
                                    </div>
                                    {!item.done && (
                                        <ArrowRight className="w-3.5 h-3.5 text-muted-foreground group-hover:text-foreground group-hover:translate-x-0.5 transition-all shrink-0" />
                                    )}
                                </div>
                            </Link>
                        ))}
                    </div>
                </div>

                {/* System & Service Status (2 cols) */}
                <div className="lg:col-span-2 bg-card border border-border rounded-xl p-5 space-y-4">
                    <h2 className="text-[14px] font-heading font-semibold text-foreground">Service Health</h2>
                    <div className="space-y-2">
                        {[
                            {
                                label: "Meta Graph API",
                                ok: !!setup?.configured,
                                detail: setup?.configured ? "Configured" : "Requires setup",
                            },
                            {
                                label: "Instagram Account",
                                ok: !!connectedAccount,
                                detail: connectedAccount ? `@${connectedAccount.username}` : "Not connected",
                            },
                            {
                                label: "Automation Engine",
                                ok: activeCount > 0,
                                detail: activeCount > 0 ? `${activeCount} live` : "Idle",
                            },
                            {
                                label: "Cloudflare Workers AI",
                                ok: true,
                                detail: "Free tier active",
                            },
                        ].map((row) => (
                            <div key={row.label} className="flex items-center justify-between h-10 px-3 rounded-lg bg-muted/40">
                                <div className="flex items-center gap-2.5">
                                    <span className={cn("w-1.5 h-1.5 rounded-full", row.ok ? "bg-secondary" : "bg-muted-foreground/40")} />
                                    <span className="text-[12.5px] font-medium text-foreground">{row.label}</span>
                                </div>
                                <span className="text-[11.5px] text-muted-foreground truncate max-w-[130px] font-medium">{row.detail}</span>
                            </div>
                        ))}
                    </div>

                    {!setup?.configured && (
                        <Link
                            href="/setup"
                            className="flex items-center justify-center gap-1.5 h-9 w-full rounded-lg bg-foreground text-background text-[12.5px] font-semibold hover:opacity-90 transition-opacity"
                        >
                            <Wrench className="w-3.5 h-3.5" />
                            Open Setup Wizard
                        </Link>
                    )}
                </div>
            </div>
        </div>
    );
}

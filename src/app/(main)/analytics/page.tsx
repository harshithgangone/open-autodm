"use client";

/**
 * Analytics - the engine's own event trail, visualized.
 *
 * Palette note: the categorical colors are validated (CVD separation, chroma,
 * contrast) per mode against the card surfaces - light and dark are separately
 * chosen steps, not an automatic flip. Series identity is never color-alone:
 * every chart ships a legend, hover tooltips, and the table view below.
 */

import { useMemo, useState } from "react";
import { useTheme } from "next-themes";
import {
    BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid,
    Tooltip, ResponsiveContainer,
} from "recharts";
import { Loader2, MessageCircle, Send, Image as ImageIcon, Users, UserCheck, AlertTriangle, ChartNoAxesColumn } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAnalytics } from "@/hooks/useAnalytics";

/* Validated categorical palette - fixed slot order, per-mode steps */
const PALETTE = {
    light: { comments: "#eb6834", dms: "#2a78d6", stories: "#1baf7a", delivered: "#4a3aa7", contacts: "#e87ba4" },
    dark: { comments: "#d95926", dms: "#3987e5", stories: "#199e70", delivered: "#9085e9", contacts: "#d55181" },
};

const RANGES = [
    { label: "7d", days: 7 },
    { label: "30d", days: 30 },
    { label: "90d", days: 90 },
] as const;

function fmtDay(iso: string): string {
    const d = new Date(iso + "T00:00:00Z");
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

function LegendRow({ items }: { items: { label: string; color: string }[] }) {
    return (
        <div className="flex items-center gap-4 flex-wrap">
            {items.map((it) => (
                <span key={it.label} className="inline-flex items-center gap-1.5 text-[11.5px] text-muted-foreground">
                    <span className="w-2.5 h-2.5 rounded-[3px]" style={{ backgroundColor: it.color }} />
                    {it.label}
                </span>
            ))}
        </div>
    );
}

interface TooltipEntry { name?: string; value?: number | string; color?: string }
function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: TooltipEntry[]; label?: string }) {
    if (!active || !payload?.length) return null;
    return (
        <div className="bg-popover border border-border rounded-lg px-3 py-2 shadow-lg">
            <p className="text-[11px] font-semibold text-foreground mb-1">{label ? fmtDay(String(label)) : ""}</p>
            {payload.map((p, i) => (
                <p key={i} className="text-[11.5px] text-muted-foreground flex items-center gap-1.5 tabular-nums">
                    <span className="w-2 h-2 rounded-[2px]" style={{ backgroundColor: p.color }} />
                    {p.name}: <span className="text-foreground font-medium">{p.value}</span>
                </p>
            ))}
        </div>
    );
}

export default function AnalyticsPage() {
    const { resolvedTheme } = useTheme();
    const colors = PALETTE[resolvedTheme === "light" ? "light" : "dark"];

    const [rangeDays, setRangeDays] = useState<number>(30);
    const [automationId, setAutomationId] = useState<string>("all");

    const { from, to } = useMemo(() => {
        const now = new Date();
        return {
            from: new Date(now.getTime() - rangeDays * 86400_000).toISOString(),
            to: now.toISOString(),
        };
    }, [rangeDays]);

    const { data, isLoading } = useAnalytics({ from, to, automationId });

    const gridStroke = resolvedTheme === "light" ? "#EDEDEF" : "#232329";
    const axisTick = { fontSize: 10.5, fill: "#898781" } as const;
    const surface = resolvedTheme === "light" ? "#FFFFFF" : "#101013";

    const totals = data?.totals;
    const funnel = totals
        ? [
              { label: "Triggered", value: totals.triggers },
              { label: "DMs delivered", value: totals.delivered },
              { label: "Button flows completed", value: totals.flowsCompleted },
              { label: "Follows gained", value: totals.followsGained },
          ]
        : [];
    const funnelMax = Math.max(1, ...funnel.map((f) => f.value));

    const tiles = totals
        ? [
              { label: "Triggers", value: totals.triggers, sub: `${totals.comments} comments · ${totals.dmKeywords} DMs · ${totals.storyReplies} stories`, icon: MessageCircle },
              { label: "DMs delivered", value: totals.delivered, sub: totals.failed > 0 ? `${totals.failed} failed` : "no failures", icon: Send },
              { label: "Follows gained", value: totals.followsGained, sub: `${totals.askToFollowShown} asked to follow`, icon: UserCheck },
              { label: "New contacts", value: totals.newContacts, sub: `${totals.newContactFollowers} already follow you`, icon: Users },
          ]
        : [];

    return (
        <div className="w-full max-w-5xl mx-auto space-y-4 pb-16">

            {/* Filter row */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                    <h1 className="text-xl font-heading font-semibold tracking-tight text-foreground">Analytics</h1>
                    <p className="text-[13px] text-muted-foreground mt-0.5">What your automations actually did.</p>
                </div>
                <div className="flex items-center gap-2">
                    <select
                        value={automationId}
                        onChange={(e) => setAutomationId(e.target.value)}
                        className="h-8 px-2.5 pr-7 text-[12.5px] font-medium bg-card border border-border rounded-lg outline-none focus:border-foreground/30 max-w-[220px] truncate"
                    >
                        <option value="all">All automations</option>
                        {(data?.automations ?? []).map((a) => (
                            <option key={a.id} value={a.id}>{a.name}</option>
                        ))}
                    </select>
                    <div className="inline-flex items-center bg-muted rounded-lg p-0.5">
                        {RANGES.map((r) => (
                            <button
                                key={r.label}
                                onClick={() => setRangeDays(r.days)}
                                className={cn(
                                    "h-7 px-3 rounded-[7px] text-[12px] font-medium transition-colors",
                                    rangeDays === r.days
                                        ? "bg-card text-foreground shadow-sm"
                                        : "text-muted-foreground hover:text-foreground"
                                )}
                            >
                                {r.label}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {isLoading || !data ? (
                <div className="py-24 flex justify-center">
                    <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                </div>
            ) : (
                <>
                    {data.truncated && (
                        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-500/10 text-[12px] font-medium text-amber-600 dark:text-amber-400">
                            <AlertTriangle className="w-3.5 h-3.5" />
                            Very large range - numbers are computed from the first 20,000 events.
                        </div>
                    )}

                    {/* Stat tiles */}
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                        {tiles.map((t) => (
                            <div key={t.label} className="bg-card border border-border rounded-xl p-4">
                                <div className="flex items-center justify-between">
                                    <span className="micro-label">{t.label}</span>
                                    <t.icon className="w-3.5 h-3.5 text-muted-foreground/60" />
                                </div>
                                <p className="text-2xl font-heading font-semibold tracking-tight text-foreground mt-2 tabular-nums">
                                    {t.value.toLocaleString()}
                                </p>
                                <p className="text-[11px] text-muted-foreground mt-0.5 truncate">{t.sub}</p>
                            </div>
                        ))}
                    </div>

                    {/* Funnel */}
                    <div className="bg-card border border-border rounded-xl p-5">
                        <h2 className="text-[13.5px] font-heading font-semibold text-foreground mb-1">Conversion funnel</h2>
                        <p className="text-[11.5px] text-muted-foreground mb-4">From trigger to gained follower, in this range.</p>
                        <div className="space-y-2">
                            {funnel.map((f, i) => {
                                const pct = (f.value / funnelMax) * 100;
                                const prev = i > 0 ? funnel[i - 1]!.value : null;
                                const conv = prev && prev > 0 ? Math.round((f.value / prev) * 100) : null;
                                return (
                                    <div key={f.label} className="flex items-center gap-3">
                                        <span className="w-44 shrink-0 text-[12px] text-muted-foreground">{f.label}</span>
                                        <div className="flex-1 h-5 rounded-[4px] bg-muted/50 overflow-hidden">
                                            <div
                                                className="h-full rounded-[4px] transition-all duration-500"
                                                style={{ width: `${Math.max(pct, f.value > 0 ? 2 : 0)}%`, backgroundColor: colors.comments }}
                                            />
                                        </div>
                                        <span className="w-20 shrink-0 text-right text-[12.5px] font-semibold text-foreground tabular-nums">
                                            {f.value.toLocaleString()}
                                            {conv !== null && <span className="text-[10px] text-muted-foreground font-normal ml-1">{conv}%</span>}
                                        </span>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* Daily triggers - stacked bars */}
                    <div className="bg-card border border-border rounded-xl p-5">
                        <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
                            <div>
                                <h2 className="text-[13.5px] font-heading font-semibold text-foreground">Triggers per day</h2>
                                <p className="text-[11.5px] text-muted-foreground mt-0.5">Comments, DM keywords, and story replies that matched an automation.</p>
                            </div>
                            <LegendRow items={[
                                { label: "Comments", color: colors.comments },
                                { label: "DM keywords", color: colors.dms },
                                { label: "Story replies", color: colors.stories },
                            ]} />
                        </div>
                        <div className="h-56">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={data.daily} margin={{ top: 4, right: 4, bottom: 0, left: -18 }} barCategoryGap="25%">
                                    <CartesianGrid stroke={gridStroke} vertical={false} />
                                    <XAxis dataKey="date" tickFormatter={fmtDay} tick={axisTick} axisLine={false} tickLine={false} minTickGap={28} />
                                    <YAxis tick={axisTick} axisLine={false} tickLine={false} allowDecimals={false} />
                                    <Tooltip content={<ChartTooltip />} cursor={{ fill: gridStroke, opacity: 0.35 }} />
                                    <Bar dataKey="comments" name="Comments" stackId="t" fill={colors.comments} stroke={surface} strokeWidth={1} />
                                    <Bar dataKey="dms" name="DM keywords" stackId="t" fill={colors.dms} stroke={surface} strokeWidth={1} />
                                    <Bar dataKey="stories" name="Story replies" stackId="t" fill={colors.stories} stroke={surface} strokeWidth={1} radius={[3, 3, 0, 0]} />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </div>

                    {/* Deliveries + contacts - lines */}
                    <div className="bg-card border border-border rounded-xl p-5">
                        <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
                            <div>
                                <h2 className="text-[13.5px] font-heading font-semibold text-foreground">Deliveries &amp; new contacts per day</h2>
                                <p className="text-[11.5px] text-muted-foreground mt-0.5">DMs that reached inboxes, and audience members captured for the first time.</p>
                            </div>
                            <LegendRow items={[
                                { label: "DMs delivered", color: colors.delivered },
                                { label: "New contacts", color: colors.contacts },
                            ]} />
                        </div>
                        <div className="h-56">
                            <ResponsiveContainer width="100%" height="100%">
                                <LineChart data={data.daily} margin={{ top: 4, right: 4, bottom: 0, left: -18 }}>
                                    <CartesianGrid stroke={gridStroke} vertical={false} />
                                    <XAxis dataKey="date" tickFormatter={fmtDay} tick={axisTick} axisLine={false} tickLine={false} minTickGap={28} />
                                    <YAxis tick={axisTick} axisLine={false} tickLine={false} allowDecimals={false} />
                                    <Tooltip content={<ChartTooltip />} cursor={{ stroke: gridStroke }} />
                                    <Line type="monotone" dataKey="delivered" name="DMs delivered" stroke={colors.delivered} strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
                                    <Line type="monotone" dataKey="contacts" name="New contacts" stroke={colors.contacts} strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
                                </LineChart>
                            </ResponsiveContainer>
                        </div>
                    </div>

                    {/* Per-automation table */}
                    <div className="bg-card border border-border rounded-xl overflow-hidden">
                        <div className="px-5 py-3.5 border-b border-border">
                            <h2 className="text-[13.5px] font-heading font-semibold text-foreground">By automation</h2>
                        </div>
                        {data.perAutomation.length === 0 ? (
                            <div className="p-10 text-center">
                                <ChartNoAxesColumn className="w-6 h-6 mx-auto mb-2 text-muted-foreground/30" />
                                <p className="text-[13px] text-muted-foreground">No automations yet - create one and the numbers start here.</p>
                            </div>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-left whitespace-nowrap">
                                    <thead className="text-muted-foreground uppercase tracking-widest text-[10px] font-bold border-b border-border">
                                        <tr>
                                            <th className="px-5 py-2.5">Automation</th>
                                            <th className="px-5 py-2.5">Type</th>
                                            <th className="px-5 py-2.5 text-right">Triggers</th>
                                            <th className="px-5 py-2.5 text-right">Delivered</th>
                                            <th className="px-5 py-2.5 text-right">Flows completed</th>
                                            <th className="px-5 py-2.5 text-right">Follows</th>
                                            <th className="px-5 py-2.5 text-right">Failed</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-border/60">
                                        {data.perAutomation.map((a) => {
                                            const TypeIcon = a.type === "dm_reply" ? Send : a.type === "story_reply" ? ImageIcon : MessageCircle;
                                            return (
                                                <tr key={a.id} className="hover:bg-muted/30 transition-colors">
                                                    <td className="px-5 py-3">
                                                        <div className="flex items-center gap-2 min-w-0">
                                                            <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", a.isActive ? "bg-secondary" : "bg-muted-foreground/30")} />
                                                            <span className="text-[13px] font-medium text-foreground truncate max-w-[220px]">{a.name}</span>
                                                        </div>
                                                    </td>
                                                    <td className="px-5 py-3">
                                                        <span className="inline-flex items-center gap-1.5 text-[11.5px] text-muted-foreground">
                                                            <TypeIcon className="w-3 h-3" />
                                                            {a.type === "comment_dm" ? "Comment" : a.type === "dm_reply" ? "DM" : "Story"}
                                                        </span>
                                                    </td>
                                                    <td className="px-5 py-3 text-right text-[13px] font-medium tabular-nums">{a.triggers.toLocaleString()}</td>
                                                    <td className="px-5 py-3 text-right text-[13px] tabular-nums">{a.delivered.toLocaleString()}</td>
                                                    <td className="px-5 py-3 text-right text-[13px] tabular-nums">{a.flowsCompleted.toLocaleString()}</td>
                                                    <td className="px-5 py-3 text-right text-[13px] tabular-nums">{a.follows.toLocaleString()}</td>
                                                    <td className={cn("px-5 py-3 text-right text-[13px] tabular-nums", a.failed > 0 ? "text-destructive font-medium" : "text-muted-foreground")}>{a.failed.toLocaleString()}</td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>

                    <p className="text-[11px] text-muted-foreground px-1">
                        &ldquo;Follows gained&rdquo; counts button flows where the ask-to-follow card was shown and the person
                        then passed the follow re-check. Contact follow status reflects the last check, not history.
                    </p>
                </>
            )}
        </div>
    );
}

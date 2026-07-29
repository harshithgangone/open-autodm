"use client";

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Search, Users, MessageCircle, Send, Image as ImageIcon, MousePointerClick, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { useContacts, type ContactFromDB } from "@/hooks/useContacts";

/**
 * Contacts — every unique audience member captured through an automation:
 * they commented a trigger keyword, DM'd one, story-replied one, or tapped a
 * flow button. Enriched with username + follow status from Instagram's
 * profile API as the engine interacts with them.
 */

const TRIGGER_CONFIG: Record<string, { label: string; icon: React.ComponentType<{ className?: string }>; className: string }> = {
    comment: { label: "Comment", icon: MessageCircle, className: "bg-[#F97316]/10 text-[#F97316] border-[#F97316]/20" },
    dm: { label: "DM Keyword", icon: Send, className: "bg-blue-500/10 text-blue-500 border-blue-500/20" },
    story_reply: { label: "Story Reply", icon: ImageIcon, className: "bg-green-500/10 text-green-500 border-green-500/20" },
    button: { label: "Button Tap", icon: MousePointerClick, className: "bg-purple-500/10 text-purple-400 border-purple-500/20" },
};

const AVATAR_GRADIENTS = [
    "from-pink-500 to-orange-400",
    "from-violet-500 to-indigo-400",
    "from-emerald-500 to-teal-400",
    "from-amber-500 to-red-400",
    "from-sky-500 to-blue-500",
];

function avatarGradient(seed: string): string {
    let hash = 0;
    for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
    return AVATAR_GRADIENTS[hash % AVATAR_GRADIENTS.length]!;
}

function relationshipBadge(contact: ContactFromDB) {
    if (contact.follows_business === true) {
        return <span className="inline-flex items-center px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider border bg-green-500/10 text-green-500 border-green-500/20">Follows You</span>;
    }
    if (contact.follows_business === false) {
        return <span className="inline-flex items-center px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider border bg-amber-500/10 text-amber-500 border-amber-500/20">Not Following</span>;
    }
    return <span className="inline-flex items-center px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider border bg-muted/40 text-muted-foreground border-border/50">Unknown</span>;
}

function formatDate(iso: string): string {
    return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function ContactsList() {
    const { data: contacts, isLoading, refetch, isFetching } = useContacts();
    const [search, setSearch] = useState("");

    const filtered = useMemo(() => {
        if (!contacts) return [];
        const q = search.trim().toLowerCase();
        if (!q) return contacts;
        return contacts.filter((c) =>
            (c.username ?? "").toLowerCase().includes(q) ||
            c.audience_ig_user_id.includes(q) ||
            (c.automations?.name ?? "").toLowerCase().includes(q)
        );
    }, [contacts, search]);

    if (isLoading) {
        return (
            <div className="flex flex-col space-y-4">
                {[1, 2, 3].map((i) => (
                    <div key={i} className="h-20 rounded-xl bg-muted/30 border border-border/40 animate-pulse" />
                ))}
            </div>
        );
    }

    if (!contacts || contacts.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center p-12 text-center border border-border border-dashed rounded-xl">
                <div className="w-16 h-16 rounded-xl bg-primary/10 flex items-center justify-center mb-6">
                    <Users className="w-8 h-8 text-primary" />
                </div>
                <h3 className="text-xl font-heading font-bold mb-2 text-foreground">No Contacts Yet</h3>
                <p className="text-muted-foreground max-w-sm">
                    Every person who triggers one of your automations — a comment, DM keyword, story reply,
                    or button tap — appears here automatically, with their follow status.
                </p>
            </div>
        );
    }

    return (
        <div className="flex flex-col space-y-4 w-full animate-in fade-in duration-500">
            {/* Toolbar */}
            <div className="flex flex-col sm:flex-row gap-4 items-center justify-between bg-card p-3 rounded-xl border border-border">
                <div className="relative w-full sm:max-w-xs">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <input
                        type="text"
                        placeholder="Search username or automation…"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="w-full bg-background border border-border/50 rounded-xl pl-9 pr-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                    />
                </div>
                <div className="flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-end">
                    <span className="text-xs font-semibold text-muted-foreground">
                        {filtered.length} contact{filtered.length !== 1 ? "s" : ""}
                    </span>
                    <button
                        onClick={() => void refetch()}
                        className="flex items-center justify-center space-x-2 px-4 py-2 border border-border/50 rounded-xl bg-background hover:bg-muted/50 transition-colors text-sm font-medium"
                    >
                        <RefreshCw className={cn("w-4 h-4", isFetching && "animate-spin")} />
                        <span>Refresh</span>
                    </button>
                </div>
            </div>

            {/* Table */}
            <div className="w-full overflow-x-auto bg-card border border-border rounded-xl">
                <table className="w-full text-left text-sm whitespace-nowrap">
                    <thead className="bg-muted/30 text-muted-foreground uppercase tracking-widest text-[10px] font-bold border-b border-border/50">
                        <tr>
                            <th className="px-5 py-3">User</th>
                            <th className="px-5 py-3">Relationship</th>
                            <th className="px-5 py-3">Captured Via</th>
                            <th className="px-5 py-3">Automation</th>
                            <th className="px-5 py-3">Interactions</th>
                            <th className="px-5 py-3">Last Active</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-border/30">
                        {filtered.map((contact, i) => {
                            const trigger = contact.last_trigger_type ? TRIGGER_CONFIG[contact.last_trigger_type] : null;
                            const TriggerIcon = trigger?.icon ?? MessageCircle;
                            const display = contact.username ? `@${contact.username}` : `IG user ${contact.audience_ig_user_id.slice(-6)}`;
                            const initial = (contact.username ?? contact.audience_ig_user_id).charAt(0).toUpperCase();

                            return (
                                <motion.tr
                                    key={contact.id}
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: Math.min(i * 0.04, 0.4) }}
                                    className="group hover:bg-muted/30 transition-colors"
                                >
                                    <td className="px-5 py-3">
                                        <div className="flex items-center space-x-3">
                                            <div className={cn("w-8 h-8 rounded-full bg-gradient-to-tr flex items-center justify-center shrink-0", avatarGradient(contact.audience_ig_user_id))}>
                                                <span className="text-white font-bold text-[11px] tracking-wider">{initial}</span>
                                            </div>
                                            <div className="flex flex-col">
                                                <span className="font-bold text-foreground group-hover:text-primary transition-colors">{display}</span>
                                                <span className="text-muted-foreground text-[10px] font-mono">IGSID …{contact.audience_ig_user_id.slice(-8)}</span>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-5 py-3">{relationshipBadge(contact)}</td>
                                    <td className="px-5 py-3">
                                        {trigger ? (
                                            <span className={cn("inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider border", trigger.className)}>
                                                <TriggerIcon className="w-3 h-3" />
                                                {trigger.label}
                                            </span>
                                        ) : (
                                            <span className="text-muted-foreground text-xs">—</span>
                                        )}
                                    </td>
                                    <td className="px-5 py-3 font-medium text-foreground/80 max-w-[220px] truncate">
                                        {contact.automations?.name ?? "—"}
                                    </td>
                                    <td className="px-5 py-3">
                                        <span className="font-bold font-heading">{contact.total_triggers}</span>
                                    </td>
                                    <td className="px-5 py-3 text-muted-foreground">{formatDate(contact.last_interaction_at)}</td>
                                </motion.tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

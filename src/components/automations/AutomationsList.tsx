"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { MousePointerClick, Clock, CheckSquare, Sparkles, Pencil, Layers, Instagram, AlertTriangle, Trash2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AutomationFromDB } from "@/hooks/useAutomations";

// Human-readable labels and styles for automation types
const TYPE_CONFIG: Record<string, { label: string; className: string }> = {
    comment_dm: { label: "COMMENT TO DM", className: "bg-[#F97316]/10 text-[#F97316] border border-[#F97316]/20" },
    dm_reply:   { label: "DM AUTO REPLY", className: "bg-blue-500/10 text-blue-500 border border-blue-500/20" },
    story_reply: { label: "STORY REPLY",  className: "bg-green-500/10 text-green-500 border border-green-500/20" },
};

function triggerDescription(automation: AutomationFromDB): string {
    const keywords = automation.keywords;
    if (!keywords || keywords.length === 0 || keywords.includes("*ANY*")) {
        return "Any trigger";
    }
    return `Keyword "${keywords[0]}"${keywords.length > 1 ? ` +${keywords.length - 1} more` : ""}`;
}

interface AutomationsListProps {
    automations: AutomationFromDB[];
    isLoading: boolean;
    onToggle: (id: string, currentlyActive: boolean) => void;
    onDelete: (id: string) => void;
    onEdit: (automation: AutomationFromDB) => void;
    deleteError?: string | null;
}

export function AutomationsList({ automations, isLoading, onToggle, onDelete, onEdit, deleteError }: AutomationsListProps) {
    const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

    if (isLoading) {
        return (
            <div className="flex flex-col space-y-4">
                {[1, 2, 3].map((i) => (
                    <div key={i} className="h-28 rounded-2xl bg-muted/30 border border-border/40 animate-pulse" />
                ))}
            </div>
        );
    }

    if (automations.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center p-12 text-center border border-border/50 border-dashed rounded-3xl bg-muted/10">
                <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-6">
                    <Sparkles className="w-8 h-8 text-primary" />
                </div>
                <h3 className="text-xl font-heading font-bold mb-2 text-foreground">No Automations Yet</h3>
                <p className="text-muted-foreground max-w-sm mb-6">
                    Create your first automation to start passively turning your audience into leads and customers.
                </p>
            </div>
        );
    }

    return (
        <div className="flex flex-col space-y-4 w-full">
            {deleteError && (
                <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-destructive/10 border border-destructive/20 text-sm text-destructive font-medium">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    {deleteError}
                </div>
            )}

            {automations.map((automation, idx) => {
                const isActive = automation.is_active;
                const typeConfig = TYPE_CONFIG[automation.type] ?? { label: automation.type.toUpperCase(), className: "" };
                const isConfirmingDelete = confirmDeleteId === automation.id;
                const hasPost = !!automation.post_id;
                const thumbUrl = automation.post_thumbnail_url;

                return (
                    <motion.div
                        key={automation.id}
                        initial={{ opacity: 0, y: 15 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: idx * 0.06 }}
                        className={cn(
                            "group relative bg-card/60 backdrop-blur-sm rounded-2xl border shadow-sm transition-all duration-300 hover:shadow-md hover:bg-card overflow-hidden",
                            isActive ? "border-primary/20 hover:border-primary/40" : "border-border/50 opacity-80"
                        )}
                    >
                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-5">
                            {/* Left — thumbnail + info */}
                            <div className="flex items-center gap-4 flex-1 min-w-0">
                                {/* Post thumbnail or all-posts badge */}
                                <div className="shrink-0">
                                    {hasPost && thumbUrl ? (
                                        <div className="w-14 h-14 rounded-xl overflow-hidden ring-1 ring-border/50 bg-muted">
                                            <img
                                                src={thumbUrl}
                                                alt="Post"
                                                className="w-full h-full object-cover"
                                            />
                                        </div>
                                    ) : hasPost ? (
                                        <div className="w-14 h-14 rounded-xl bg-muted/60 border border-border/50 flex items-center justify-center">
                                            <Instagram className="w-5 h-5 text-muted-foreground/50" />
                                        </div>
                                    ) : (
                                        <div className="w-14 h-14 rounded-xl bg-primary/5 border border-primary/15 flex items-center justify-center">
                                            <Layers className="w-5 h-5 text-primary/50" />
                                        </div>
                                    )}
                                </div>

                                <div className="flex flex-col space-y-1.5 min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <h3 className="text-base font-bold text-foreground font-heading leading-tight group-hover:text-primary transition-colors truncate max-w-[200px]">
                                            {automation.name}
                                        </h3>
                                        <span className={cn(
                                            "text-[10px] font-extrabold px-2 py-0.5 rounded-[4px] tracking-wide uppercase shrink-0",
                                            typeConfig.className
                                        )}>
                                            {typeConfig.label}
                                        </span>
                                    </div>

                                    {/* Post info row */}
                                    <p className="text-xs text-muted-foreground font-medium truncate max-w-xs">
                                        {hasPost
                                            ? (automation.post_caption
                                                ? `Post: ${automation.post_caption.slice(0, 60)}${automation.post_caption.length > 60 ? "…" : ""}`
                                                : "Specific post")
                                            : "All posts"}
                                    </p>

                                    <div className="flex items-center text-xs font-medium text-muted-foreground gap-3">
                                        <div className="flex items-center">
                                            <MousePointerClick className="w-3 h-3 mr-1 opacity-70" />
                                            {triggerDescription(automation)}
                                        </div>
                                        <div className="items-center hidden sm:flex">
                                            <Clock className="w-3 h-3 mr-1 opacity-70" />
                                            {new Date(automation.updated_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Right — stats + actions */}
                            <div className="flex items-center justify-between md:justify-end gap-6 shrink-0">
                                <div className="flex flex-col items-start md:items-end">
                                    <span className="text-[10px] uppercase font-bold tracking-widest text-muted-foreground mb-0.5">Total DMs Sent</span>
                                    <span className="text-xl font-bold font-heading">{automation.total_dms_sent.toLocaleString()}</span>
                                </div>

                                <div className="flex items-center gap-3">
                                    {/* Toggle Switch — frozen when inactive (must activate via form) */}
                                    <div className="relative group/toggle">
                                        <button
                                            onClick={() => isActive ? onToggle(automation.id, isActive) : undefined}
                                            disabled={!isActive}
                                            className={cn(
                                                "relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-background",
                                                isActive ? "bg-[#F97316] cursor-pointer" : "bg-muted cursor-not-allowed opacity-50"
                                            )}
                                            title={isActive ? "Click to deactivate" : "Open edit form to activate"}
                                        >
                                            <span className="sr-only">Toggle automation</span>
                                            <span
                                                className={cn(
                                                    "pointer-events-none inline-flex items-center justify-center h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out",
                                                    isActive ? "translate-x-5" : "translate-x-0"
                                                )}
                                            >
                                                {isActive && <CheckSquare className="w-3 h-3 text-[#F97316]" />}
                                            </span>
                                        </button>
                                        {!isActive && (
                                            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-max max-w-[160px] text-center px-2 py-1 text-[10px] font-semibold bg-popover border border-border rounded-lg shadow-lg opacity-0 group-hover/toggle:opacity-100 transition-opacity pointer-events-none z-10">
                                                Open edit to activate
                                            </div>
                                        )}
                                    </div>

                                    <div className="flex items-center gap-1 border-l border-border pl-3">
                                        <button
                                            onClick={() => onEdit(automation)}
                                            className="p-2 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded-lg transition-colors"
                                            title="Edit automation"
                                        >
                                            <Pencil className="w-4 h-4" />
                                        </button>
                                        <button
                                            onClick={() => setConfirmDeleteId(automation.id)}
                                            className="p-2 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg transition-colors"
                                            title="Delete automation"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Inline delete confirmation banner */}
                        <AnimatePresence>
                            {isConfirmingDelete && (
                                <motion.div
                                    initial={{ height: 0, opacity: 0 }}
                                    animate={{ height: "auto", opacity: 1 }}
                                    exit={{ height: 0, opacity: 0 }}
                                    transition={{ duration: 0.18 }}
                                    className="overflow-hidden"
                                >
                                    <div className="flex items-center justify-between gap-3 px-5 py-3 bg-destructive/5 border-t border-destructive/20">
                                        <div className="flex items-center gap-2 text-sm font-medium text-destructive">
                                            <AlertTriangle className="w-4 h-4 shrink-0" />
                                            Delete <span className="font-bold">"{automation.name}"</span>? This cannot be undone.
                                        </div>
                                        <div className="flex items-center gap-2 shrink-0">
                                            <button
                                                onClick={() => setConfirmDeleteId(null)}
                                                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-border hover:bg-muted transition-colors"
                                            >
                                                <X className="w-3 h-3" /> Cancel
                                            </button>
                                            <button
                                                onClick={() => { setConfirmDeleteId(null); onDelete(automation.id); }}
                                                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-white bg-destructive hover:bg-destructive/90 rounded-lg transition-colors"
                                            >
                                                <Trash2 className="w-3 h-3" /> Delete
                                            </button>
                                        </div>
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </motion.div>
                );
            })}
        </div>
    );
}

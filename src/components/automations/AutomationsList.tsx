"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { MessageCircle, Send, Image as ImageIcon, Clock, Sparkles, Pencil, Layers, Instagram, AlertTriangle, Trash2, X, MousePointerClick } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AutomationFromDB } from "@/hooks/useAutomations";

const TYPE_CONFIG: Record<string, { label: string; icon: React.ComponentType<{ className?: string }>; className: string }> = {
    comment_dm: { label: "Comment → DM", icon: MessageCircle, className: "bg-[#F97316]/10 text-[#F97316]" },
    dm_reply: { label: "DM Reply", icon: Send, className: "bg-blue-500/10 text-blue-500" },
    story_reply: { label: "Story Reply", icon: ImageIcon, className: "bg-emerald-500/10 text-emerald-500" },
};

function triggerDescription(automation: AutomationFromDB): string {
    const keywords = automation.keywords;
    if (!keywords || keywords.length === 0 || keywords.includes("*ANY*")) {
        return "Any trigger";
    }
    return `"${keywords[0]}"${keywords.length > 1 ? ` +${keywords.length - 1}` : ""}`;
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
            <div className="flex flex-col space-y-2">
                {[1, 2, 3].map((i) => (
                    <div key={i} className="h-[72px] rounded-xl bg-muted/40 border border-border animate-pulse" />
                ))}
            </div>
        );
    }

    if (automations.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center p-14 text-center border border-border border-dashed rounded-xl">
                <div className="w-11 h-11 rounded-xl bg-muted flex items-center justify-center mb-4">
                    <Sparkles className="w-5 h-5 text-muted-foreground" />
                </div>
                <h3 className="text-[15px] font-heading font-semibold mb-1 text-foreground">No automations yet</h3>
                <p className="text-[13px] text-muted-foreground max-w-xs">
                    Create one to reply to comments, DMs, or story replies automatically.
                </p>
            </div>
        );
    }

    return (
        <div className="flex flex-col space-y-2 w-full">
            {deleteError && (
                <div className="flex items-center gap-2 px-3.5 py-2.5 rounded-lg bg-destructive/10 text-[13px] text-destructive font-medium">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                    {deleteError}
                </div>
            )}

            {automations.map((automation, idx) => {
                const isActive = automation.is_active;
                const typeConfig = TYPE_CONFIG[automation.type] ?? { label: automation.type, icon: MessageCircle, className: "bg-muted text-muted-foreground" };
                const TypeIcon = typeConfig.icon;
                const isConfirmingDelete = confirmDeleteId === automation.id;
                const hasPost = !!automation.post_id;
                const thumbUrl = automation.post_thumbnail_url;

                return (
                    <motion.div
                        key={automation.id}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: Math.min(idx * 0.04, 0.3) }}
                        className={cn(
                            "group relative bg-card rounded-xl border transition-colors overflow-hidden",
                            isActive ? "border-border hover:border-foreground/20" : "border-border opacity-70"
                        )}
                    >
                        <div className="flex items-center justify-between gap-4 p-3.5">
                            {/* Left — thumb + info */}
                            <div className="flex items-center gap-3 flex-1 min-w-0">
                                <div className="shrink-0">
                                    {automation.type !== "comment_dm" ? (
                                        <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center", typeConfig.className)}>
                                            <TypeIcon className="w-4 h-4" />
                                        </div>
                                    ) : hasPost && thumbUrl ? (
                                        <div className="w-10 h-10 rounded-lg overflow-hidden bg-muted">
                                            <img src={thumbUrl} alt="Post" className="w-full h-full object-cover" />
                                        </div>
                                    ) : hasPost ? (
                                        <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center">
                                            <Instagram className="w-4 h-4 text-muted-foreground/60" />
                                        </div>
                                    ) : (
                                        <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center">
                                            <Layers className="w-4 h-4 text-muted-foreground/60" />
                                        </div>
                                    )}
                                </div>

                                <div className="flex flex-col gap-1 min-w-0">
                                    <div className="flex items-center gap-2 min-w-0">
                                        <h3 className="text-[13.5px] font-semibold text-foreground leading-tight truncate">
                                            {automation.name}
                                        </h3>
                                        <span className={cn("text-[10px] font-semibold px-1.5 py-0.5 rounded shrink-0", typeConfig.className)}>
                                            {typeConfig.label}
                                        </span>
                                    </div>
                                    <div className="flex items-center text-[12px] text-muted-foreground gap-3 min-w-0">
                                        <span className="flex items-center gap-1 truncate">
                                            <MousePointerClick className="w-3 h-3 opacity-60 shrink-0" />
                                            {triggerDescription(automation)}
                                        </span>
                                        {automation.type === "comment_dm" && (
                                            <span className="truncate hidden sm:inline">
                                                {hasPost ? (automation.post_caption ? automation.post_caption.slice(0, 44) : "Specific post") : "All posts"}
                                            </span>
                                        )}
                                        <span className="items-center gap-1 hidden md:flex shrink-0">
                                            <Clock className="w-3 h-3 opacity-60" />
                                            {new Date(automation.updated_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                                        </span>
                                    </div>
                                </div>
                            </div>

                            {/* Right — stats + actions */}
                            <div className="flex items-center gap-4 shrink-0">
                                <div className="hidden sm:flex flex-col items-end">
                                    <span className="text-[15px] font-heading font-semibold tabular-nums leading-tight">{automation.total_dms_sent.toLocaleString()}</span>
                                    <span className="text-[10px] text-muted-foreground uppercase tracking-wider">DMs</span>
                                </div>

                                <div className="flex items-center gap-1">
                                    {/* Toggle — frozen when inactive (activate via edit) */}
                                    <div className="relative group/toggle mr-1">
                                        <button
                                            onClick={() => isActive ? onToggle(automation.id, isActive) : undefined}
                                            disabled={!isActive}
                                            role="switch"
                                            aria-checked={isActive}
                                            className={cn(
                                                "relative inline-flex h-5 w-9 shrink-0 rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
                                                isActive ? "bg-secondary cursor-pointer" : "bg-muted cursor-not-allowed"
                                            )}
                                            title={isActive ? "Pause automation" : "Open edit to activate"}
                                        >
                                            <span className={cn(
                                                "pointer-events-none inline-block h-4 w-4 translate-y-[2px] rounded-full bg-white shadow-sm transition-transform",
                                                isActive ? "translate-x-[18px]" : "translate-x-[2px]"
                                            )} />
                                        </button>
                                        {!isActive && (
                                            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 w-max px-2 py-1 text-[10px] font-medium bg-popover border border-border rounded-md shadow-sm opacity-0 group-hover/toggle:opacity-100 transition-opacity pointer-events-none z-10">
                                                Open edit to activate
                                            </div>
                                        )}
                                    </div>

                                    <button
                                        onClick={() => onEdit(automation)}
                                        className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-colors"
                                        title="Edit automation"
                                    >
                                        <Pencil className="w-3.5 h-3.5" />
                                    </button>
                                    <button
                                        onClick={() => setConfirmDeleteId(automation.id)}
                                        className="p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-md transition-colors"
                                        title="Delete automation"
                                    >
                                        <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* Inline delete confirmation */}
                        <AnimatePresence>
                            {isConfirmingDelete && (
                                <motion.div
                                    initial={{ height: 0, opacity: 0 }}
                                    animate={{ height: "auto", opacity: 1 }}
                                    exit={{ height: 0, opacity: 0 }}
                                    transition={{ duration: 0.15 }}
                                    className="overflow-hidden"
                                >
                                    <div className="flex items-center justify-between gap-3 px-3.5 py-2.5 bg-destructive/5 border-t border-destructive/20">
                                        <span className="text-[13px] text-destructive font-medium truncate">
                                            Delete &ldquo;{automation.name}&rdquo;? This can&apos;t be undone.
                                        </span>
                                        <div className="flex items-center gap-1.5 shrink-0">
                                            <button
                                                onClick={() => setConfirmDeleteId(null)}
                                                className="inline-flex items-center gap-1 h-7 px-2.5 text-[12px] font-medium rounded-md border border-border hover:bg-muted transition-colors"
                                            >
                                                <X className="w-3 h-3" /> Cancel
                                            </button>
                                            <button
                                                onClick={() => { setConfirmDeleteId(null); onDelete(automation.id); }}
                                                className="inline-flex items-center gap-1 h-7 px-2.5 text-[12px] font-semibold text-white bg-destructive hover:bg-destructive/90 rounded-md transition-colors"
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

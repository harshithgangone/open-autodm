"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Clock, AlertTriangle, Sparkles, Bot, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AutomationFlowData } from "../NewAutomationModal";

interface Step5FollowUpMessagesProps {
    data: AutomationFlowData;
    onChange: (patch: Partial<AutomationFlowData>) => void;
}

const DELAY_OPTIONS = [
    { label: "10 minutes", minutes: 10 },
    { label: "20 minutes", minutes: 20 },
    { label: "1 hour", minutes: 60 },
    { label: "2 hours", minutes: 120 },
];

export function Step5FollowUpMessages({ data, onChange }: Step5FollowUpMessagesProps) {
    const [isGeneratingAi, setIsGeneratingAi] = useState(false);
    const [aiError, setAiError] = useState<string | null>(null);

    const handleGenerateAiFollowUp = async (mode: 'custom' | 'auto') => {
        setIsGeneratingAi(true);
        setAiError(null);
        try {
            const prompt = mode === 'custom' ? data.followUpAiInstructions : "Generate a warm, non-intrusive 1-sentence follow-up check-in asking if they checked the resource";
            const res = await fetch("/api/ai/generate", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    type: "follow_up",
                    prompt,
                    context: {
                        creatorHandle: "Creator",
                        triggerKeyword: data.keywords[0] ?? "LINK",
                        postCaption: data.postCaption,
                    },
                }),
            });
            const json = (await res.json()) as { success?: boolean; draft?: string; error?: string };
            if (!res.ok || !json.success) {
                setAiError(json.error || "Failed to generate follow-up draft");
            } else if (json.draft) {
                onChange({ followUpMessage: json.draft });
            }
        } catch {
            setAiError("Network error generating follow-up draft");
        } finally {
            setIsGeneratingAi(false);
        }
    };

    return (
        <div className="space-y-6" data-testid="step-5-follow-up-messages">
            {/* Step Header */}
            <div className="space-y-1">
                <h3 className="text-base font-semibold text-foreground flex items-center gap-2">
                    <Clock className="w-4 h-4 text-primary" />
                    Step 5: Follow-up Messages (Final Configuration)
                </h3>
                <p className="text-[13px] text-muted-foreground">
                    Send an automated, compliant check-in message after a qualifying recipient interaction.
                </p>
            </div>

            {/* Main Toggle Card */}
            <div className="rounded-xl border border-border bg-card overflow-hidden" data-testid="card-follow-up-config">
                <div className="flex items-center justify-between p-4 bg-muted/30 border-b border-border">
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center shrink-0">
                            <Clock className="w-4 h-4 text-foreground" />
                        </div>
                        <div>
                            <p className="text-[13px] font-semibold text-foreground">Follow-up Message</p>
                            <p className="text-[11.5px] text-muted-foreground">
                                Send a scheduled check-in DM (Off by default)
                            </p>
                        </div>
                    </div>

                    <button
                        type="button"
                        role="switch"
                        aria-checked={data.followUpEnabled}
                        onClick={() => onChange({ followUpEnabled: !data.followUpEnabled })}
                        className={cn(
                            "w-10 h-6 rounded-full transition-colors relative p-0.5 shrink-0 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
                            data.followUpEnabled ? "bg-primary" : "bg-muted-foreground/30"
                        )}
                        data-testid="toggle-follow-up"
                    >
                        <div
                            className={cn(
                                "w-5 h-5 rounded-full bg-white transition-transform shadow-xs",
                                data.followUpEnabled ? "translate-x-4" : "translate-x-0"
                            )}
                        />
                    </button>
                </div>

                <AnimatePresence>
                    {data.followUpEnabled && (
                        <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.18 }}
                            className="overflow-hidden"
                        >
                            <div className="p-4 space-y-4 bg-background">
                                {/* Instagram Messaging Compliance Disclosure */}
                                <div className="p-3.5 rounded-lg border border-amber-500/30 bg-amber-500/10 flex items-start gap-2.5 text-[12px] text-amber-800 dark:text-amber-200">
                                    <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                                    <div className="space-y-1">
                                        <p className="font-semibold text-amber-700 dark:text-amber-300">
                                            Instagram Messaging Compliance
                                        </p>
                                        <p className="leading-relaxed">
                                            Meta allows strictly ONE private reply per comment. Follow-up messages are only scheduled after the recipient qualifies the conversation by tapping your reveal button or replying, and must be sent within the 24-hour messaging window.
                                        </p>
                                    </div>
                                </div>

                                {/* Delay Selector */}
                                <div className="space-y-2">
                                    <label className="text-[12px] font-semibold text-foreground block">
                                        Delay before follow-up
                                    </label>
                                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2" data-testid="follow-up-delay-selector">
                                        {DELAY_OPTIONS.map((opt) => (
                                            <button
                                                key={opt.minutes}
                                                type="button"
                                                onClick={() => onChange({ followUpDelayMinutes: opt.minutes })}
                                                className={cn(
                                                    "px-3 py-2 rounded-lg text-[12px] font-semibold border transition-all text-center",
                                                    (data.followUpDelayMinutes ?? 60) === opt.minutes
                                                        ? "bg-primary text-primary-foreground border-primary shadow-xs"
                                                        : "bg-muted/40 text-muted-foreground border-border hover:text-foreground hover:bg-muted/70"
                                                )}
                                                data-testid={`delay-option-${opt.minutes}`}
                                            >
                                                {opt.label}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {/* AI Assist Drawer */}
                                <div className="p-3 rounded-lg border border-primary/20 bg-primary/5 space-y-2.5">
                                    <div className="flex items-center justify-between">
                                        <label className="text-[12px] font-semibold text-primary flex items-center gap-1.5">
                                            <Sparkles className="w-3.5 h-3.5" /> What should the follow-up ask?
                                        </label>
                                        <span className="text-[10px] text-muted-foreground">Free AI suggestions</span>
                                    </div>
                                    <textarea
                                        value={data.followUpAiInstructions}
                                        onChange={(e) => onChange({ followUpAiInstructions: e.target.value })}
                                        rows={2}
                                        maxLength={400}
                                        placeholder="e.g. Ask warmly if they found the workout plan helpful or have any questions..."
                                        className="w-full bg-background border border-border rounded-lg p-2.5 text-[12.5px] text-foreground outline-none focus:border-primary/40 resize-none"
                                        data-testid="textarea-follow-up-ai-instructions"
                                    />
                                    <div className="flex items-center gap-2">
                                        <button
                                            type="button"
                                            onClick={() => handleGenerateAiFollowUp('custom')}
                                            disabled={isGeneratingAi || !data.followUpAiInstructions.trim()}
                                            className="text-[11.5px] font-semibold text-primary-foreground bg-primary hover:opacity-90 disabled:opacity-40 px-3 py-1.5 rounded-md flex items-center gap-1.5"
                                            data-testid="btn-generate-custom-followup"
                                        >
                                            {isGeneratingAi ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                                            Generate draft
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => handleGenerateAiFollowUp('auto')}
                                            disabled={isGeneratingAi}
                                            className="text-[11.5px] font-semibold text-foreground bg-muted hover:bg-muted/80 disabled:opacity-40 px-3 py-1.5 rounded-md border border-border"
                                            data-testid="btn-generate-auto-followup"
                                        >
                                            <Bot className="w-3.5 h-3.5 text-muted-foreground" />
                                            Auto-draft
                                        </button>
                                    </div>
                                    {aiError && <p className="text-[11px] text-destructive">{aiError}</p>}
                                </div>

                                {/* Follow-up Message Content */}
                                <div className="space-y-1.5">
                                    <label className="text-[12px] font-semibold text-foreground flex items-center justify-between">
                                        <span>Message Content</span>
                                        <span className="text-[10px] text-muted-foreground tabular-nums">
                                            {data.followUpMessage.length}/1000
                                        </span>
                                    </label>
                                    <textarea
                                        value={data.followUpMessage}
                                        onChange={(e) => onChange({ followUpMessage: e.target.value })}
                                        rows={3}
                                        maxLength={1000}
                                        placeholder="Hey {username}, did you get a chance to check the details I sent you?"
                                        className="w-full bg-muted/40 border border-border rounded-lg p-2.5 text-[13px] text-foreground outline-none focus:border-foreground/30 focus:ring-1 focus:ring-foreground/20 resize-none transition-all"
                                        data-testid="textarea-follow-up-message"
                                    />
                                    <p className="text-[11px] text-muted-foreground">
                                        Tip: <code className="px-1 bg-muted rounded font-mono text-[10px]">{"{username}"}</code> is replaced with their handle.
                                    </p>
                                </div>

                                {/* Rendered preview */}
                                <div className="space-y-1 pt-1">
                                    <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                                        Rendered preview (@alex)
                                    </p>
                                    <div className="p-3 bg-muted/20 rounded-lg border border-border text-[12.5px] text-foreground leading-relaxed">
                                        {(data.followUpMessage || "Hey {username}, did you get a chance to check the details I sent you?").replace(/\{username\}/gi, "alex")}
                                    </div>
                                </div>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </div>
    );
}

"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Sliders, MessageCircle, Bot, Sparkles, Send, Plus, X, AlertTriangle, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AutomationFlowData } from "../NewAutomationModal";

interface Step3ResponseBehaviorProps {
    data: AutomationFlowData;
    onChange: (patch: Partial<AutomationFlowData>) => void;
}

export function Step3ResponseBehavior({ data, onChange }: Step3ResponseBehaviorProps) {
    const isComment = data.type === "comment-dm" || data.type === "comment_dm";

    // AI Assist state for public reply options
    const [isGeneratingAiReplies, setIsGeneratingAiReplies] = useState(false);
    const [publicRepliesError, setPublicRepliesError] = useState<string | null>(null);

    const handleGenerateAiPublicReplies = async (mode: 'custom' | 'auto') => {
        setIsGeneratingAiReplies(true);
        setPublicRepliesError(null);
        try {
            const prompt = mode === 'custom' ? data.publicReplyAiInstructions : "Generate warm, natural 1-sentence Instagram comment replies confirming we sent them a DM";
            const res = await fetch("/api/ai/generate", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    type: "public_reply",
                    prompt,
                    count: 5,
                    context: {
                        creatorHandle: "Creator",
                        triggerKeyword: data.keywords[0] ?? "LINK",
                        postCaption: data.postCaption,
                    },
                }),
            });
            const json = (await res.json()) as { success?: boolean; variations?: string[]; error?: string };
            if (!res.ok || !json.success) {
                setPublicRepliesError(json.error || "Failed to generate AI replies");
            } else if (json.variations && json.variations.length > 0) {
                onChange({
                    publicReplyOptions: json.variations,
                    customReplies: json.variations,
                });
            }
        } catch {
            setPublicRepliesError("Network or server error generating AI variations");
        } finally {
            setIsGeneratingAiReplies(false);
        }
    };

    return (
        <div className="space-y-6" data-testid="step-3-response-behavior">
            {/* Step Header */}
            <div className="space-y-1">
                <h3 className="text-base font-semibold text-foreground flex items-center gap-2">
                    <Sliders className="w-4 h-4 text-primary" />
                    Step 3: Response Behavior
                </h3>
                <p className="text-[13px] text-muted-foreground">
                    Control how Auto DMs, opening prompts, public comment replies, and AI responses operate.
                </p>
            </div>

            {/* 1. Auto DM Master Toggle */}
            <div className="rounded-xl border border-border bg-card p-4 flex items-center justify-between gap-3" data-testid="card-auto-dm">
                <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                        <Send className="w-4 h-4 text-primary" />
                    </div>
                    <div>
                        <p className="text-[13px] font-semibold text-foreground">Auto DM</p>
                        <p className="text-[12px] text-muted-foreground">
                            Send automated direct messages when the qualifying trigger occurs
                        </p>
                    </div>
                </div>

                <button
                    type="button"
                    role="switch"
                    aria-checked={data.isAutoDmEnabled}
                    onClick={() => onChange({ isAutoDmEnabled: !data.isAutoDmEnabled })}
                    className={cn(
                        "w-10 h-6 rounded-full transition-colors relative p-0.5 shrink-0 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
                        data.isAutoDmEnabled ? "bg-primary" : "bg-muted-foreground/30"
                    )}
                    data-testid="toggle-auto-dm"
                >
                    <div
                        className={cn(
                            "w-5 h-5 rounded-full bg-white transition-transform shadow-xs",
                            data.isAutoDmEnabled ? "translate-x-4" : "translate-x-0"
                        )}
                    />
                </button>
            </div>

            {/* 2. Opening Interactive Message Enablement */}
            {data.isAutoDmEnabled && (
                <div className="rounded-xl border border-border bg-card p-4 flex items-center justify-between gap-3" data-testid="card-opening-message-toggle">
                    <div className="flex items-start gap-3">
                        <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center shrink-0 mt-0.5">
                            <Sparkles className="w-4 h-4 text-foreground" />
                        </div>
                        <div>
                            <p className="text-[13px] font-semibold text-foreground">Interactive Opening Message</p>
                            <p className="text-[12px] text-muted-foreground">
                                Deliver an opening message with a reveal tap button first. When disabled, your first response is sent immediately.
                            </p>
                        </div>
                    </div>

                    <button
                        type="button"
                        role="switch"
                        aria-checked={data.dmOpeningMessageEnabled}
                        onClick={() => onChange({ dmOpeningMessageEnabled: !data.dmOpeningMessageEnabled })}
                        className={cn(
                            "w-10 h-6 rounded-full transition-colors relative p-0.5 shrink-0 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
                            data.dmOpeningMessageEnabled ? "bg-primary" : "bg-muted-foreground/30"
                        )}
                        data-testid="toggle-opening-message"
                    >
                        <div
                            className={cn(
                                "w-5 h-5 rounded-full bg-white transition-transform shadow-xs",
                                data.dmOpeningMessageEnabled ? "translate-x-4" : "translate-x-0"
                            )}
                        />
                    </button>
                </div>
            )}

            {/* 3. Public Comment Replies (Comment Automations only, independently optional) */}
            {isComment && (
                <div className="rounded-xl border border-border bg-card overflow-hidden" data-testid="card-public-reply">
                    <div className="flex items-center justify-between p-4 bg-muted/30 border-b border-border">
                        <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center shrink-0">
                                <MessageCircle className="w-4 h-4 text-foreground" />
                            </div>
                            <div>
                                <p className="text-[13px] font-semibold text-foreground">Public Comment Reply</p>
                                <p className="text-[11.5px] text-muted-foreground">
                                    Post an automated public reply under their comment confirming their DM was sent (Off by default)
                                </p>
                            </div>
                        </div>

                        <button
                            type="button"
                            role="switch"
                            aria-checked={data.publicReplyEnabled}
                            onClick={() => onChange({ publicReplyEnabled: !data.publicReplyEnabled })}
                            className={cn(
                                "w-10 h-6 rounded-full transition-colors relative p-0.5 shrink-0 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
                                data.publicReplyEnabled ? "bg-primary" : "bg-muted-foreground/30"
                            )}
                            data-testid="toggle-public-reply"
                        >
                            <div
                                className={cn(
                                    "w-5 h-5 rounded-full bg-white transition-transform shadow-xs",
                                    data.publicReplyEnabled ? "translate-x-4" : "translate-x-0"
                                )}
                            />
                        </button>
                    </div>

                    <AnimatePresence>
                        {data.publicReplyEnabled && (
                            <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: "auto", opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                transition={{ duration: 0.18 }}
                                className="overflow-hidden"
                            >
                                <div className="p-4 space-y-4 bg-background">
                                    {/* Mode selector: Manual Template Variations vs AI assist */}
                                    <div className="flex rounded-lg border border-border p-1 bg-muted/30" data-testid="public-reply-mode-tabs">
                                        <button
                                            type="button"
                                            onClick={() => onChange({ publicReplyMode: "manual" })}
                                            className={cn(
                                                "flex-1 text-[12px] font-semibold py-1.5 rounded-md transition-colors",
                                                data.publicReplyMode === "manual"
                                                    ? "bg-background text-foreground shadow-xs"
                                                    : "text-muted-foreground hover:text-foreground"
                                            )}
                                            data-testid="tab-public-manual"
                                        >
                                            Template Variations ({data.publicReplyOptions.length})
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => onChange({ publicReplyMode: "ai_generated" })}
                                            className={cn(
                                                "flex-1 text-[12px] font-semibold py-1.5 rounded-md transition-colors flex items-center justify-center gap-1.5",
                                                data.publicReplyMode === "ai_generated"
                                                    ? "bg-background text-primary shadow-xs"
                                                    : "text-muted-foreground hover:text-foreground"
                                            )}
                                            data-testid="tab-public-ai"
                                        >
                                            <Sparkles className="w-3.5 h-3.5 text-primary" />
                                            AI Assist Mode
                                        </button>
                                    </div>

                                    {/* AI Assist Mode Box */}
                                    {data.publicReplyMode === "ai_generated" && (
                                        <div className="space-y-2.5 p-3.5 rounded-lg border border-primary/20 bg-primary/5">
                                            <div className="flex items-center justify-between">
                                                <label className="text-[12px] font-semibold text-primary flex items-center gap-1.5">
                                                    <Sparkles className="w-3.5 h-3.5" /> What should the AI say?
                                                </label>
                                                <span className="text-[10px] text-muted-foreground">Free Cloudflare AI</span>
                                            </div>
                                            <textarea
                                                value={data.publicReplyAiInstructions}
                                                onChange={(e) => onChange({ publicReplyAiInstructions: e.target.value })}
                                                rows={2}
                                                maxLength={400}
                                                placeholder="e.g. Reply enthusiastically confirming the guide is in their DMs, asking them to check requests..."
                                                className="w-full bg-background border border-border rounded-lg p-2.5 text-[12.5px] text-foreground outline-none focus:border-primary/40 resize-none"
                                                data-testid="textarea-public-ai-instructions"
                                            />
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <button
                                                    type="button"
                                                    onClick={() => handleGenerateAiPublicReplies('custom')}
                                                    disabled={isGeneratingAiReplies || !data.publicReplyAiInstructions.trim()}
                                                    className="text-[11.5px] font-semibold text-primary-foreground bg-primary hover:opacity-90 disabled:opacity-40 px-3 py-1.5 rounded-md flex items-center gap-1.5 transition-opacity"
                                                    data-testid="btn-generate-custom-public-replies"
                                                >
                                                    {isGeneratingAiReplies ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                                                    Generate from instructions
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => handleGenerateAiPublicReplies('auto')}
                                                    disabled={isGeneratingAiReplies}
                                                    className="text-[11.5px] font-semibold text-foreground bg-muted hover:bg-muted/80 disabled:opacity-40 px-3 py-1.5 rounded-md flex items-center gap-1.5 border border-border transition-colors"
                                                    data-testid="btn-generate-auto-public-replies"
                                                >
                                                    <Bot className="w-3.5 h-3.5 text-muted-foreground" />
                                                    Auto-generate for me
                                                </button>
                                            </div>
                                            {publicRepliesError && (
                                                <p className="text-[11px] text-destructive flex items-center gap-1">
                                                    <AlertTriangle className="w-3 h-3 shrink-0" /> {publicRepliesError}
                                                </p>
                                            )}
                                        </div>
                                    )}

                                    {/* Variations List */}
                                    <div className="space-y-2">
                                        <div className="space-y-1.5">
                                            {data.publicReplyOptions.map((opt, i) => (
                                                <div key={i} className="flex items-center gap-1.5">
                                                    <input
                                                        value={opt}
                                                        onChange={(e) => {
                                                            const copy = [...data.publicReplyOptions];
                                                            copy[i] = e.target.value;
                                                            onChange({ publicReplyOptions: copy, customReplies: copy });
                                                        }}
                                                        placeholder="e.g. Sent you a DM! Check requests 📬"
                                                        className="flex-1 h-8 bg-muted/40 border border-border rounded-lg px-3 text-[12.5px] text-foreground outline-none focus:border-foreground/30 transition-all"
                                                        data-testid={`public-reply-input-${i}`}
                                                    />
                                                    {data.publicReplyOptions.length > 1 && (
                                                        <button
                                                            type="button"
                                                            onClick={() => {
                                                                const filtered = data.publicReplyOptions.filter((_, idx) => idx !== i);
                                                                onChange({ publicReplyOptions: filtered, customReplies: filtered });
                                                            }}
                                                            className="p-2 text-muted-foreground hover:text-destructive shrink-0"
                                                            aria-label="Remove variation"
                                                        >
                                                            <X className="w-3.5 h-3.5" />
                                                        </button>
                                                    )}
                                                </div>
                                            ))}
                                        </div>

                                        {data.publicReplyOptions.length < 5 && (
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    const appended = [...data.publicReplyOptions, "Check your DMs! 📬"];
                                                    onChange({ publicReplyOptions: appended, customReplies: appended });
                                                }}
                                                className="text-[12px] text-primary font-semibold flex items-center gap-1 hover:opacity-80 pt-1"
                                                data-testid="btn-add-public-reply-variation"
                                            >
                                                <Plus className="w-3 h-3" /> Add variation
                                            </button>
                                        )}
                                        <p className="text-[11px] text-muted-foreground">
                                            Variations are rotated deterministically across comments to keep comment activity organic.
                                        </p>
                                    </div>
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            )}

            {/* 4. Runtime AI Direct Message Responses */}
            <div className="rounded-xl border border-border bg-card overflow-hidden" data-testid="card-runtime-ai">
                <div className="flex items-center justify-between p-4 bg-muted/30 border-b border-border">
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                            <Bot className="w-4 h-4 text-primary" />
                        </div>
                        <div>
                            <p className="text-[13px] font-semibold text-foreground">Runtime AI DM Assistant</p>
                            <p className="text-[11.5px] text-muted-foreground">
                                Use Cloudflare Workers AI free tier to dynamically answer questions in DM responses
                            </p>
                        </div>
                    </div>

                    <button
                        type="button"
                        role="switch"
                        aria-checked={data.aiRuntimeModeEnabled}
                        onClick={() => onChange({ aiRuntimeModeEnabled: !data.aiRuntimeModeEnabled })}
                        className={cn(
                            "w-10 h-6 rounded-full transition-colors relative p-0.5 shrink-0 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
                            data.aiRuntimeModeEnabled ? "bg-primary" : "bg-muted-foreground/30"
                        )}
                        data-testid="toggle-runtime-ai"
                    >
                        <div
                            className={cn(
                                "w-5 h-5 rounded-full bg-white transition-transform shadow-xs",
                                data.aiRuntimeModeEnabled ? "translate-x-4" : "translate-x-0"
                            )}
                        />
                    </button>
                </div>

                <AnimatePresence>
                    {data.aiRuntimeModeEnabled && (
                        <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.18 }}
                            className="overflow-hidden"
                        >
                            <div className="p-4 space-y-3 bg-background">
                                <label className="text-[12px] font-semibold text-foreground flex items-center justify-between">
                                    <span>AI Instructions & Tone Guidelines</span>
                                    <span className="text-[10px] text-muted-foreground">Model: @cf/meta/llama-3.2-3b-instruct</span>
                                </label>
                                <textarea
                                    value={data.aiRuntimeInstructions}
                                    onChange={(e) => onChange({ aiRuntimeInstructions: e.target.value })}
                                    rows={3}
                                    maxLength={600}
                                    placeholder="e.g. Act as a friendly assistant answering questions about our product. Be concise, warm, and helpful. Do not promise discounts."
                                    className="w-full bg-muted/40 border border-border rounded-lg p-2.5 text-[12.5px] text-foreground outline-none focus:border-foreground/30 focus:ring-1 focus:ring-foreground/20 resize-none transition-all"
                                    data-testid="textarea-runtime-ai-instructions"
                                />
                                <p className="text-[11px] text-muted-foreground">
                                    Runs on Cloudflare Workers AI free tier (10,000 Neurons/day free). Falls back to static template responses if quota is exhausted.
                                </p>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </div>
    );
}

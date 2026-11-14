"use client";

import { useState } from "react";
import { AlertTriangle, X, Zap, Hash, MessageSquare, Layers } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AutomationFlowData } from "../NewAutomationModal";

interface Step1TriggerProps {
    data: AutomationFlowData;
    onChange: (patch: Partial<AutomationFlowData>) => void;
    onChangePost?: () => void;
}

export function Step1Trigger({ data, onChange, onChangePost }: Step1TriggerProps) {
    const isComment = data.type === "comment-dm" || data.type === "comment_dm";
    const [keywordInput, setKeywordInput] = useState("");

    const addKeyword = (raw: string) => {
        const trimmed = raw.trim().toUpperCase();
        if (trimmed && !data.keywords.includes(trimmed)) {
            onChange({ keywords: [...data.keywords, trimmed] });
        }
        setKeywordInput("");
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === "Enter" || e.key === ",") {
            e.preventDefault();
            addKeyword(keywordInput);
        } else if (e.key === "Backspace" && !keywordInput && data.keywords.length > 0) {
            onChange({ keywords: data.keywords.slice(0, -1) });
        }
    };

    const removeKeyword = (kwToRemove: string) => {
        onChange({ keywords: data.keywords.filter(k => k !== kwToRemove) });
    };

    const hasNoKeywordsInSpecificMode = !data.keywordsAnyMode && data.keywords.length === 0;

    return (
        <div className="space-y-6" data-testid="step-1-trigger">
            {/* Step Header */}
            <div className="space-y-1">
                <h3 className="text-base font-semibold text-foreground flex items-center gap-2">
                    <MessageSquare className="w-4 h-4 text-primary" />
                    Step 1: When someone comments
                </h3>
                <p className="text-[13px] text-muted-foreground">
                    Name your automation and decide which comments should trigger your automated response.
                </p>
            </div>

            {/* Automation Name */}
            <div className="space-y-1.5 p-4 rounded-xl border border-border bg-card">
                <label className="text-[12px] font-semibold text-foreground flex items-center justify-between">
                    <span>Automation Name</span>
                    <span className="text-[11px] text-muted-foreground font-normal">Internal label</span>
                </label>
                <input
                    type="text"
                    value={data.name}
                    onChange={(e) => onChange({ name: e.target.value })}
                    placeholder="e.g. Free Guide Funnel"
                    className="w-full h-9 bg-background border border-border rounded-lg px-3 text-[13px] text-foreground placeholder:text-muted-foreground/60 outline-none focus:border-foreground/30 focus:ring-1 focus:ring-foreground/20 transition-all"
                    data-testid="automation-name-input"
                />
            </div>

            {/* Post Target Context (Comment automations) */}
            {isComment && (
                <div className="space-y-2 p-4 rounded-xl border border-border bg-card">
                    <div className="flex items-center justify-between">
                        <label className="text-[12px] font-semibold text-foreground">Post / Reel Target</label>
                        {onChangePost && (
                            <button
                                type="button"
                                onClick={onChangePost}
                                className="text-[11.5px] font-medium text-primary hover:underline cursor-pointer"
                                data-testid="btn-change-post"
                            >
                                Change post
                            </button>
                        )}
                    </div>

                    {data.postThumbnailUrl ? (
                        <div className="flex items-center gap-3 p-2.5 bg-muted/30 rounded-lg border border-border/60">
                            <img
                                src={data.postThumbnailUrl}
                                alt="Post thumbnail"
                                className="w-11 h-11 object-cover rounded-md shrink-0 border border-border"
                            />
                            <div className="min-w-0 flex-1">
                                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                                    Specific post selected
                                </p>
                                <p className="text-[12.5px] text-foreground truncate mt-0.5 font-medium">
                                    {data.postCaption ? data.postCaption.slice(0, 90) : "No caption"}
                                </p>
                            </div>
                        </div>
                    ) : (
                        <div className="flex items-center gap-2.5 p-3 bg-muted/30 rounded-lg border border-border/60">
                            <Layers className="w-4 h-4 text-primary shrink-0" />
                            <div className="min-w-0 flex-1">
                                <p className="text-[12.5px] font-medium text-foreground">
                                    Triggers on all posts & reels
                                </p>
                                <p className="text-[11px] text-muted-foreground">
                                    Any post receiving the qualifying comment will initiate the flow.
                                </p>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* Trigger Mode Selection */}
            <div className="space-y-3 p-4 rounded-xl border border-border bg-card">
                <label className="text-[12px] font-semibold text-foreground block">
                    Trigger Mode
                </label>

                {/* Tabs: Specific keyword vs Any comment */}
                <div className="grid grid-cols-2 gap-2 p-1 bg-muted/40 rounded-lg border border-border" data-testid="trigger-mode-tabs">
                    <button
                        type="button"
                        onClick={() => onChange({ keywordsAnyMode: false })}
                        className={cn(
                            "py-2 px-3 rounded-md text-[12.5px] font-semibold transition-all flex items-center justify-center gap-2",
                            !data.keywordsAnyMode
                                ? "bg-background text-foreground shadow-xs border border-border"
                                : "text-muted-foreground hover:text-foreground"
                        )}
                        data-testid="tab-trigger-specific"
                    >
                        <Hash className="w-3.5 h-3.5" />
                        Specific keyword
                    </button>
                    <button
                        type="button"
                        onClick={() => onChange({ keywordsAnyMode: true })}
                        className={cn(
                            "py-2 px-3 rounded-md text-[12.5px] font-semibold transition-all flex items-center justify-center gap-2",
                            data.keywordsAnyMode
                                ? "bg-background text-foreground shadow-xs border border-border"
                                : "text-muted-foreground hover:text-foreground"
                        )}
                        data-testid="tab-trigger-any"
                    >
                        <Zap className="w-3.5 h-3.5" />
                        Any comment
                    </button>
                </div>

                {/* Option 1: Specific keyword mode */}
                {!data.keywordsAnyMode && (
                    <div className="space-y-2 pt-1" data-testid="specific-keywords-section">
                        <div
                            className={cn(
                                "flex flex-wrap gap-1.5 p-2 bg-background border rounded-lg min-h-[46px] transition-colors focus-within:ring-1 focus-within:ring-foreground/20",
                                hasNoKeywordsInSpecificMode
                                    ? "border-destructive/60 bg-destructive/5"
                                    : "border-border focus-within:border-foreground/30"
                            )}
                        >
                            {data.keywords.map((kw) => (
                                <span
                                    key={kw}
                                    className="inline-flex items-center gap-1.5 bg-primary/10 text-primary text-[12px] font-semibold px-2.5 py-1 rounded-md"
                                    data-testid={`keyword-chip-${kw}`}
                                >
                                    {kw}
                                    <button
                                        type="button"
                                        onClick={() => removeKeyword(kw)}
                                        className="opacity-60 hover:opacity-100 hover:text-destructive transition-opacity"
                                        aria-label={`Remove keyword ${kw}`}
                                        data-testid={`remove-keyword-${kw}`}
                                    >
                                        <X className="w-3 h-3" />
                                    </button>
                                </span>
                            ))}

                            <input
                                value={keywordInput}
                                onChange={(e) => setKeywordInput(e.target.value)}
                                onKeyDown={handleKeyDown}
                                onBlur={() => keywordInput.trim() && addKeyword(keywordInput)}
                                placeholder={data.keywords.length === 0 ? "Type keyword (e.g. LINK) and press Enter…" : "Add another keyword…"}
                                className="flex-1 min-w-[140px] bg-transparent text-[13px] text-foreground outline-none placeholder:text-muted-foreground/60 px-1 py-0.5"
                                data-testid="keyword-text-input"
                            />
                        </div>

                        <p className="text-[11px] text-muted-foreground">
                            Separate keywords with <kbd className="px-1 py-0.5 bg-muted rounded text-[10px] font-mono">Enter</kbd> or <kbd className="px-1 py-0.5 bg-muted rounded text-[10px] font-mono">,</kbd>. Matches case-insensitively as a whole standalone word.
                        </p>

                        {hasNoKeywordsInSpecificMode && (
                            <div className="flex items-center gap-1.5 text-[12px] text-destructive font-medium p-2 rounded-lg bg-destructive/10" data-testid="keyword-validation-error">
                                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                                <span>Please add at least one trigger keyword before continuing (or select &ldquo;Any comment&rdquo;).</span>
                            </div>
                        )}
                    </div>
                )}

                {/* Option 2: Any comment mode */}
                {data.keywordsAnyMode && (
                    <div className="p-3.5 rounded-lg border border-amber-500/30 bg-amber-500/10 text-amber-900 dark:text-amber-200 space-y-2" data-testid="any-comment-warning">
                        <div className="flex items-start gap-2">
                            <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                            <div className="space-y-1">
                                <p className="text-[12.5px] font-semibold leading-tight text-amber-700 dark:text-amber-300">
                                    Explicit Opt-in: Any comment triggers an automated DM
                                </p>
                                <p className="text-[12px] leading-relaxed text-amber-700/90 dark:text-amber-300/90">
                                    Every qualifying top-level comment on {data.postId && data.postId !== "all" ? "this post" : "your posts"} will trigger this automation.
                                </p>
                            </div>
                        </div>
                        <div className="text-[11px] text-muted-foreground pt-1 border-t border-amber-500/20">
                            Built-in protections remain active: one DM per user deduplication, 1-private-reply-per-comment constraint, rate limits, and recipient opt-out suppression.
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

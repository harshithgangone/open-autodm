"use client";

import { CheckCircle2, AlertTriangle, Hash, Zap, Users, Send, MessageCircle, Clock, Link as LinkIcon, Edit3, Loader2 } from "lucide-react";
import type { AutomationFlowData } from "../NewAutomationModal";

interface Step6ReviewSaveProps {
    data: AutomationFlowData;
    onJumpToStep: (stepNumber: number) => void;
    onSave: (activate: boolean) => void;
    isPending: boolean;
    pendingAction: 'save' | 'activate' | null;
    saveError: string | null;
    isEditMode: boolean;
}

export function Step6ReviewSave({
    data,
    onJumpToStep,
    onSave,
    isPending,
    pendingAction,
    saveError,
    isEditMode,
}: Step6ReviewSaveProps) {
    const isComment = data.type === "comment-dm" || data.type === "comment_dm";

    // Gather all attached links across responses
    const allLinks: Array<{ title: string; url: string }> = [];
    for (const r of data.dmResponses) {
        if (r.buttons && r.buttons.length > 0) {
            for (const b of r.buttons) {
                if (b.link) allLinks.push({ title: b.title, url: b.link });
            }
        } else if (r.buttonLink) {
            allLinks.push({ title: r.buttonTitle || "Open link", url: r.buttonLink });
        }
        if (r.cardButtons && r.cardButtons.length > 0) {
            for (const b of r.cardButtons) {
                if (b.link) allLinks.push({ title: b.title, url: b.link });
            }
        }
    }

    return (
        <div className="space-y-6" data-testid="step-6-review-save">
            {/* Step Header */}
            <div className="space-y-1">
                <h3 className="text-base font-semibold text-foreground flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-primary" />
                    Step 6: Review & Save Automation
                </h3>
                <p className="text-[13px] text-muted-foreground">
                    Review your configured automation settings before saving or activating.
                </p>
            </div>

            {/* Error Notification */}
            {saveError && (
                <div className="p-3.5 rounded-xl border border-destructive/40 bg-destructive/10 text-destructive flex items-start gap-2.5 text-[12.5px]" data-testid="review-save-error">
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                    <div>
                        <p className="font-semibold">Unable to save automation</p>
                        <p className="text-[12px] opacity-90 mt-0.5">{saveError}</p>
                    </div>
                </div>
            )}

            {/* Summary Cards Grid */}
            <div className="space-y-3" data-testid="review-summary-cards">
                {/* 1. Trigger Summary */}
                <div className="p-4 rounded-xl border border-border bg-card flex items-start justify-between gap-3" data-testid="summary-card-trigger">
                    <div className="space-y-1.5 min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                            <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                                Step 1 · Trigger
                            </span>
                        </div>
                        <p className="text-[13.5px] font-semibold text-foreground">
                            {data.name || "Untitled automation"}
                        </p>
                        <div className="flex items-center gap-2 flex-wrap pt-0.5">
                            {data.keywordsAnyMode ? (
                                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md bg-amber-500/10 text-amber-700 dark:text-amber-300 text-[11.5px] font-medium border border-amber-500/20">
                                    <Zap className="w-3 h-3" /> Any comment mode
                                </span>
                            ) : (
                                <>
                                    <span className="text-[12px] text-muted-foreground">Keywords:</span>
                                    {data.keywords.map((kw) => (
                                        <span key={kw} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-primary/10 text-primary text-[11px] font-semibold">
                                            <Hash className="w-2.5 h-2.5" /> {kw}
                                        </span>
                                    ))}
                                </>
                            )}
                        </div>
                        {isComment && (
                            <p className="text-[11.5px] text-muted-foreground pt-0.5">
                                Target: {data.postId && data.postId !== "all" ? "Specific post selected" : "All posts & Reels"}
                            </p>
                        )}
                    </div>
                    <button
                        type="button"
                        onClick={() => onJumpToStep(1)}
                        className="p-1.5 text-muted-foreground hover:text-foreground rounded-lg transition-colors shrink-0 flex items-center gap-1 text-[11.5px] font-medium"
                        aria-label="Edit Trigger step"
                        data-testid="btn-edit-step-1"
                    >
                        <Edit3 className="w-3.5 h-3.5" /> Edit
                    </button>
                </div>

                {/* 2. Recipient Rules Summary */}
                <div className="p-4 rounded-xl border border-border bg-card flex items-start justify-between gap-3" data-testid="summary-card-recipients">
                    <div className="space-y-1 min-w-0 flex-1">
                        <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                            Step 2 · Recipient Rules
                        </span>
                        <div className="flex items-center gap-2 pt-0.5">
                            <Users className="w-3.5 h-3.5 text-muted-foreground" />
                            <span className="text-[13px] text-foreground font-medium">
                                {isComment ? "Delivered via comment private reply" : "Delivered to Instagram inbox"}
                            </span>
                        </div>
                        <p className="text-[12px] text-muted-foreground">
                            Require follow: {data.askToFollowEnabled ? "Enabled (followers only, check card sent to non-followers)" : "Disabled (sent to all qualifying commenters)"}
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={() => onJumpToStep(2)}
                        className="p-1.5 text-muted-foreground hover:text-foreground rounded-lg transition-colors shrink-0 flex items-center gap-1 text-[11.5px] font-medium"
                        aria-label="Edit Recipient Rules step"
                        data-testid="btn-edit-step-2"
                    >
                        <Edit3 className="w-3.5 h-3.5" /> Edit
                    </button>
                </div>

                {/* 3. Response Behavior Summary */}
                <div className="p-4 rounded-xl border border-border bg-card flex items-start justify-between gap-3" data-testid="summary-card-behavior">
                    <div className="space-y-1 min-w-0 flex-1">
                        <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                            Step 3 · Response Behavior
                        </span>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1 text-[12px]">
                            <div className="flex items-center gap-1.5">
                                <Send className="w-3.5 h-3.5 text-muted-foreground" />
                                <span>Auto DM: <strong>{data.isAutoDmEnabled ? "Active" : "Disabled"}</strong></span>
                            </div>
                            <div className="flex items-center gap-1.5">
                                <MessageCircle className="w-3.5 h-3.5 text-muted-foreground" />
                                <span>Public Reply: <strong>{data.publicReplyEnabled ? `Enabled (${data.publicReplyMode})` : "Disabled"}</strong></span>
                            </div>
                            <div className="flex items-center gap-1.5">
                                <span className="w-2 h-2 rounded-full bg-primary" />
                                <span>Opening DM: <strong>{data.dmOpeningMessageEnabled ? "Interactive" : "Direct response"}</strong></span>
                            </div>
                            <div className="flex items-center gap-1.5">
                                <span className="w-2 h-2 rounded-full bg-muted-foreground" />
                                <span>Runtime AI: <strong>{data.aiRuntimeModeEnabled ? "Active" : "Off"}</strong></span>
                            </div>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={() => onJumpToStep(3)}
                        className="p-1.5 text-muted-foreground hover:text-foreground rounded-lg transition-colors shrink-0 flex items-center gap-1 text-[11.5px] font-medium"
                        aria-label="Edit Behavior step"
                        data-testid="btn-edit-step-3"
                    >
                        <Edit3 className="w-3.5 h-3.5" /> Edit
                    </button>
                </div>

                {/* 4. DM Messages & Links Summary */}
                <div className="p-4 rounded-xl border border-border bg-card flex items-start justify-between gap-3" data-testid="summary-card-messages">
                    <div className="space-y-1.5 min-w-0 flex-1">
                        <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                            Step 4 · DM Message & Links
                        </span>
                        {data.dmOpeningMessageEnabled && (
                            <div className="text-[12px] text-foreground bg-muted/30 p-2.5 rounded-lg border border-border/60">
                                <span className="font-semibold text-muted-foreground block text-[11px] mb-0.5">Opening DM:</span>
                                <p className="line-clamp-2 italic">{data.dmOpeningMessage}</p>
                                {data.dmOpeningMessageButtonTitle && (
                                    <span className="inline-block mt-1.5 text-[10.5px] font-semibold bg-background border border-border px-2 py-0.5 rounded-md">
                                        Tap button: &ldquo;{data.dmOpeningMessageButtonTitle}&rdquo;
                                    </span>
                                )}
                            </div>
                        )}

                        <div className="pt-1">
                            <span className="text-[12px] text-muted-foreground">
                                Sequential responses: <strong>{data.dmResponses.length}</strong> configured
                            </span>
                            {allLinks.length > 0 && (
                                <div className="flex items-center gap-1.5 flex-wrap pt-1">
                                    <LinkIcon className="w-3 h-3 text-primary" />
                                    <span className="text-[11px] text-muted-foreground">Attached links:</span>
                                    {allLinks.map((l, i) => (
                                        <span key={i} className="text-[11px] font-semibold bg-primary/10 text-primary px-2 py-0.5 rounded-md">
                                            {l.title}
                                        </span>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={() => onJumpToStep(4)}
                        className="p-1.5 text-muted-foreground hover:text-foreground rounded-lg transition-colors shrink-0 flex items-center gap-1 text-[11.5px] font-medium"
                        aria-label="Edit Messages step"
                        data-testid="btn-edit-step-4"
                    >
                        <Edit3 className="w-3.5 h-3.5" /> Edit
                    </button>
                </div>

                {/* 5. Follow-up Messages Summary */}
                <div className="p-4 rounded-xl border border-border bg-card flex items-start justify-between gap-3" data-testid="summary-card-followup">
                    <div className="space-y-1 min-w-0 flex-1">
                        <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                            Step 5 · Follow-up Messages
                        </span>
                        <div className="flex items-center gap-2 pt-0.5">
                            <Clock className="w-3.5 h-3.5 text-muted-foreground" />
                            <span className="text-[13px] text-foreground font-medium">
                                Status: <strong>{data.followUpEnabled ? `Enabled (${data.followUpDelayMinutes} min delay)` : "Disabled"}</strong>
                            </span>
                        </div>
                        {data.followUpEnabled && (
                            <p className="text-[12px] text-muted-foreground line-clamp-1 italic pt-0.5">
                                &ldquo;{data.followUpMessage}&rdquo;
                            </p>
                        )}
                    </div>
                    <button
                        type="button"
                        onClick={() => onJumpToStep(5)}
                        className="p-1.5 text-muted-foreground hover:text-foreground rounded-lg transition-colors shrink-0 flex items-center gap-1 text-[11.5px] font-medium"
                        aria-label="Edit Follow-up step"
                        data-testid="btn-edit-step-5"
                    >
                        <Edit3 className="w-3.5 h-3.5" /> Edit
                    </button>
                </div>
            </div>

            {/* Bottom Save Action Controls */}
            <div className="p-4 rounded-xl border border-border bg-muted/30 flex flex-col sm:flex-row items-center justify-between gap-3 pt-4" data-testid="review-action-footer">
                <button
                    type="button"
                    onClick={() => onJumpToStep(5)}
                    disabled={isPending}
                    className="w-full sm:w-auto h-9 px-4 rounded-lg border border-border text-[12.5px] font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-50"
                    data-testid="btn-review-back"
                >
                    Back to Follow-up
                </button>

                <div className="flex items-center gap-2 w-full sm:w-auto">
                    {/* Save as Draft */}
                    <button
                        type="button"
                        disabled={isPending}
                        onClick={() => onSave(false)}
                        className="flex-1 sm:flex-none h-9 px-4 rounded-lg border border-border bg-card text-[12.5px] font-semibold text-foreground hover:bg-muted transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5"
                        data-testid="btn-save-draft"
                    >
                        {isPending && pendingAction === 'save' ? (
                            <>
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                Saving…
                            </>
                        ) : (
                            isEditMode ? "Save changes (Inactive)" : "Save as draft"
                        )}
                    </button>

                    {/* Save & Activate */}
                    <button
                        type="button"
                        disabled={isPending}
                        onClick={() => onSave(true)}
                        className="flex-1 sm:flex-none h-9 px-4 rounded-lg bg-primary text-primary-foreground text-[12.5px] font-semibold hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center justify-center gap-1.5 shadow-xs"
                        data-testid="btn-save-activate"
                    >
                        {isPending && pendingAction === 'activate' ? (
                            <>
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                Activating…
                            </>
                        ) : (
                            isEditMode ? "Save & Activate" : "Create & Activate"
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}

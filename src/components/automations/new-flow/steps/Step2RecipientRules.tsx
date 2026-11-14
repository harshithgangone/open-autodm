"use client";

import { motion, AnimatePresence } from "framer-motion";
import { UserCheck, Users, ShieldAlert, Sparkles, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AutomationFlowData } from "../NewAutomationModal";

interface Step2RecipientRulesProps {
    data: AutomationFlowData;
    onChange: (patch: Partial<AutomationFlowData>) => void;
}

export function Step2RecipientRules({ data, onChange }: Step2RecipientRulesProps) {
    const isComment = data.type === "comment-dm" || data.type === "comment_dm";

    return (
        <div className="space-y-6" data-testid="step-2-recipient-rules">
            {/* Step Header */}
            <div className="space-y-1">
                <h3 className="text-base font-semibold text-foreground flex items-center gap-2">
                    <Users className="w-4 h-4 text-primary" />
                    Step 2: Send DM To & Recipient Rules
                </h3>
                <p className="text-[13px] text-muted-foreground">
                    Define who receives the direct message and set eligibility requirements.
                </p>
            </div>

            {/* Recipient Target Card */}
            <div className="p-4 rounded-xl border border-border bg-card space-y-3">
                <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                        <Users className="w-4 h-4 text-primary" />
                    </div>
                    <div className="space-y-1">
                        <h4 className="text-[13px] font-semibold text-foreground">
                            Recipient Destination
                        </h4>
                        <p className="text-[12px] text-muted-foreground leading-relaxed">
                            {isComment
                                ? "Delivered directly to the commenter via Instagram's official comment private-reply channel (100% compliant with Meta platform policies)."
                                : "Delivered directly into the user's Instagram DM inbox."}
                        </p>
                    </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2 border-t border-border">
                    <div className="flex items-center gap-2 text-[12px] text-muted-foreground bg-muted/30 px-3 py-2 rounded-lg">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                        <span>One DM per user deduplication</span>
                    </div>
                    <div className="flex items-center gap-2 text-[12px] text-muted-foreground bg-muted/30 px-3 py-2 rounded-lg">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                        <span>Opt-out suppression protection</span>
                    </div>
                </div>
            </div>

            {/* Require Follow Gate (Follower Eligibility) */}
            <div className="rounded-xl border border-border bg-card overflow-hidden" data-testid="card-require-follow">
                <div className="flex items-center justify-between p-4 bg-muted/30 border-b border-border">
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center shrink-0">
                            <UserCheck className="w-4 h-4 text-foreground" />
                        </div>
                        <div>
                            <p className="text-[13px] font-semibold text-foreground">Require follow</p>
                            <p className="text-[11.5px] text-muted-foreground">
                                Deliver responses only after verifying the user follows your Instagram account
                            </p>
                        </div>
                    </div>

                    {/* Toggle Button */}
                    <button
                        type="button"
                        role="switch"
                        aria-checked={data.askToFollowEnabled}
                        onClick={() => onChange({ askToFollowEnabled: !data.askToFollowEnabled })}
                        className={cn(
                            "w-10 h-6 rounded-full transition-colors relative p-0.5 shrink-0 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
                            data.askToFollowEnabled ? "bg-primary" : "bg-muted-foreground/30"
                        )}
                        data-testid="toggle-require-follow"
                    >
                        <div
                            className={cn(
                                "w-5 h-5 rounded-full bg-white transition-transform shadow-xs",
                                data.askToFollowEnabled ? "translate-x-4" : "translate-x-0"
                            )}
                        />
                    </button>
                </div>

                <AnimatePresence>
                    {data.askToFollowEnabled && (
                        <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.18 }}
                            className="overflow-hidden"
                        >
                            <div className="p-4 space-y-3.5 bg-background">
                                <div className="space-y-1.5">
                                    <label className="text-[12px] font-semibold text-foreground flex items-center justify-between">
                                        <span>&ldquo;Not following&rdquo; Card Message</span>
                                        <span className="text-[10px] text-muted-foreground tabular-nums">
                                            {data.askToFollowMessage.length}/80 chars
                                        </span>
                                    </label>
                                    <textarea
                                        value={data.askToFollowMessage}
                                        onChange={(e) => onChange({ askToFollowMessage: e.target.value })}
                                        rows={2}
                                        maxLength={80}
                                        placeholder="Hey! It seems you're not following me yet 😊"
                                        className="w-full bg-muted/40 border border-border rounded-lg p-2.5 text-[13px] text-foreground placeholder:text-muted-foreground/60 outline-none focus:border-foreground/30 focus:ring-1 focus:ring-foreground/20 resize-none transition-all"
                                        data-testid="input-not-following-message"
                                    />
                                    <p className="text-[11px] text-muted-foreground">
                                        Max 80 characters (Instagram card title limitation).
                                    </p>
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    <div className="space-y-1.5">
                                        <label className="text-[12px] font-semibold text-foreground">
                                            Profile Button Label
                                        </label>
                                        <input
                                            value={data.askToFollowVisitProfileButton}
                                            onChange={(e) => onChange({ askToFollowVisitProfileButton: e.target.value })}
                                            maxLength={20}
                                            placeholder="Visit Profile"
                                            className="w-full h-9 bg-muted/40 border border-border rounded-lg px-3 text-[13px] text-foreground outline-none focus:border-foreground/30 focus:ring-1 focus:ring-foreground/20 transition-all"
                                            data-testid="input-profile-button-label"
                                        />
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className="text-[12px] font-semibold text-foreground">
                                            Confirm Button Label
                                        </label>
                                        <input
                                            value={data.askToFollowConfirmButton}
                                            onChange={(e) => onChange({ askToFollowConfirmButton: e.target.value })}
                                            maxLength={20}
                                            placeholder="I'm following ✅"
                                            className="w-full h-9 bg-muted/40 border border-border rounded-lg px-3 text-[13px] text-foreground outline-none focus:border-foreground/30 focus:ring-1 focus:ring-foreground/20 transition-all"
                                            data-testid="input-confirm-button-label"
                                        />
                                    </div>
                                </div>

                                <div className="flex items-start gap-2 p-3 bg-primary/5 rounded-lg border border-primary/20 text-[11.5px] text-foreground/80">
                                    <Sparkles className="w-3.5 h-3.5 text-primary shrink-0 mt-0.5" />
                                    <span>
                                        Existing followers skip this step automatically. Non-followers tap the profile button to follow you, then tap confirm to receive your link responses.
                                    </span>
                                </div>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </div>
    );
}

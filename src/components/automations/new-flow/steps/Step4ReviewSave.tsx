"use client";

import React from "react";
import { motion } from "framer-motion";
import {
  Check,
  CheckCircle2,
  Edit2,
  MessageCircle,
  Film,
  Send,
  Image as ImageIcon,
  ExternalLink,
  Clock,
  UserCheck,
  AlertCircle,
  AlertTriangle,
  Layers,
  Sparkles,
  Loader2,
  Calendar,
  ShieldCheck,
  ShieldAlert,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { AutomationFlowData, CardButton } from "../NewAutomationModal";
import { hasComplexBranches } from "@/lib/automation/flowGraph";

interface Step4ReviewSaveProps {
  data: AutomationFlowData;
  onEditStep: (stepIndex: number) => void;
  onSave: (activate: boolean) => void;
  isPending?: boolean;
  pendingAction?: "save" | "activate" | null;
  saveError?: string | null;
  creatorProfilePicUrl?: string | null;
}

export function Step4ReviewSave({
  data,
  onEditStep,
  onSave,
  isPending = false,
  pendingAction = null,
  saveError = null,
  creatorProfilePicUrl,
}: Step4ReviewSaveProps) {
  const isComment = !data.type || data.type === "comment-dm" || data.type === "comment_dm";
  const isReel = data.type === "reel-dm" || data.type === "reel_dm";
  const isDm = data.type === "dm-reply" || data.type === "dm_reply";
  const isStory = data.type === "story-reply" || data.type === "story_reply";

  const buttons: CardButton[] = data.dmResponses[0]?.buttons || [];
  const excludedKeywords = data.excludedKeywords || [];
  const isLegacyComplex = hasComplexBranches(data.flowGraph);

  const getTriggerLabel = () => {
    if (isReel) return "Shared Reel Trigger";
    if (isDm) return "Direct Message Keyword";
    if (isStory) return "Story Reply";
    return "Comment on Post or Reel";
  };

  const getTriggerIcon = () => {
    if (isReel) return Film;
    if (isDm) return Send;
    if (isStory) return ImageIcon;
    return MessageCircle;
  };

  const TriggerIcon = getTriggerIcon();

  const previewText = (data.dmOpeningMessage || "").replace(/\{username\}/g, "@alex_creator");
  const previewFollowUp = (data.followUpMessage || "").replace(/\{username\}/g, "@alex_creator");

  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-6 md:p-8 max-w-5xl w-full mx-auto space-y-8" data-testid="step-4-review-save">
      {/* Step Header */}
      <div>
        <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
          Step 4: Review & Launch
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Review your automation details below. You can jump directly to any step to make changes.
        </p>
      </div>

      {saveError && (
        <div
          className="p-4 rounded-xl bg-destructive/10 border border-destructive/30 flex items-start gap-3 text-destructive text-sm"
          data-testid="save-error-banner"
        >
          <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
          <div>
            <h4 className="font-bold">Unable to save automation</h4>
            <p className="mt-0.5 leading-relaxed">{saveError}</p>
          </div>
        </div>
      )}

      {/* Legacy Branching Notice */}
      {isLegacyComplex && (
        <div className="p-4 rounded-xl bg-blue-500/10 border border-blue-500/30 flex items-start gap-3 text-blue-700 dark:text-blue-300 text-xs">
          <Sparkles className="w-4 h-4 shrink-0 mt-0.5 text-blue-500" />
          <div>
            <h5 className="font-bold">Advanced Branching Preserved</h5>
            <p className="mt-0.5 leading-relaxed">
              This automation includes custom branching nodes created in an earlier version. Your custom branch structure will be safely preserved when saved.
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* ── LEFT: Review Summary Cards ── */}
        <div className="lg:col-span-7 space-y-4">
          {/* Card 1: Setup & Target */}
          <div className="p-5 rounded-xl bg-card border border-border space-y-3.5 relative shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                Step 1 · Setup & Target
              </span>
              <button
                type="button"
                onClick={() => onEditStep(0)}
                className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
                data-testid="btn-edit-step-1"
              >
                <Edit2 className="w-3 h-3" /> Edit
              </button>
            </div>

            <div>
              <h3 className="text-base font-bold text-foreground">{data.name || "Untitled Automation"}</h3>
              <div className="flex flex-wrap items-center gap-2 mt-1.5">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-primary/10 text-primary text-xs font-semibold">
                  <TriggerIcon className="w-3.5 h-3.5" />
                  {getTriggerLabel()}
                </span>
                {data.postId === "all" ? (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-muted text-muted-foreground text-xs font-medium">
                    <Layers className="w-3 h-3" /> All Posts & Reels
                  </span>
                ) : data.postId === "next_post" ? (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-amber-500/10 text-amber-600 dark:text-amber-400 text-xs font-semibold">
                    <Calendar className="w-3 h-3" /> Next Upcoming Post
                  </span>
                ) : data.postId ? (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-muted text-foreground text-xs font-medium">
                    {data.postThumbnailUrl && (
                      <img
                        src={data.postThumbnailUrl}
                        alt="thumb"
                        className="w-4 h-4 rounded object-cover"
                      />
                    )}
                    Specific Post Target
                  </span>
                ) : null}
              </div>
            </div>
          </div>

          {/* Card 2: Trigger Rules */}
          <div className="p-5 rounded-xl bg-card border border-border space-y-3.5 relative shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                Step 2 · Trigger Rules
              </span>
              <button
                type="button"
                onClick={() => onEditStep(1)}
                className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
                data-testid="btn-edit-step-2"
              >
                <Edit2 className="w-3 h-3" /> Edit
              </button>
            </div>

            <div className="space-y-2 text-xs">
              {data.keywordsAnyMode ? (
                <div className="flex items-center gap-2 text-foreground font-semibold">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                  <span>Triggers on ANY comment or message (Broad Match)</span>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="flex items-start gap-2">
                    <ShieldCheck className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-semibold text-foreground">Include Keywords: </span>
                      <span className="text-muted-foreground">
                        {data.keywords.length > 0 ? data.keywords.join(", ") : "None specified"}
                      </span>
                    </div>
                  </div>

                  {excludedKeywords.length > 0 && (
                    <div className="flex items-start gap-2">
                      <ShieldAlert className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                      <div>
                        <span className="font-semibold text-foreground">Excluded Keywords: </span>
                        <span className="text-muted-foreground">{excludedKeywords.join(", ")}</span>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {isComment && (
                <div className="pt-2 border-t border-border flex items-center justify-between">
                  <span className="text-muted-foreground">Public comment reply:</span>
                  <span className="font-semibold text-foreground">
                    {data.publicReplyEnabled
                      ? `Enabled (${data.publicReplyOptions.length} variations)`
                      : "Disabled"}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Card 3: DM Message & Delivery */}
          <div className="p-5 rounded-xl bg-card border border-border space-y-3.5 relative shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                Step 3 · DM Message & Delivery
              </span>
              <button
                type="button"
                onClick={() => onEditStep(2)}
                className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
                data-testid="btn-edit-step-3"
              >
                <Edit2 className="w-3 h-3" /> Edit
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="p-3 rounded-lg bg-muted/50 border border-border text-foreground font-normal leading-relaxed whitespace-pre-wrap">
                {data.dmOpeningMessage || "No message text"}
              </div>

              {buttons.length > 0 && (
                <div>
                  <span className="font-semibold text-muted-foreground block mb-1">
                    Attached Buttons ({buttons.length}/3):
                  </span>
                  <div className="space-y-1">
                    {buttons.map((b, i) => (
                      <div key={b.id || i} className="flex items-center justify-between text-muted-foreground">
                        <span className="font-medium text-foreground">{b.title}</span>
                        <span className="text-[11px] truncate max-w-[200px]">{b.link}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="pt-2 border-t border-border grid grid-cols-2 gap-2">
                <div>
                  <span className="text-muted-foreground">Ask to follow:</span>{" "}
                  <span className="font-semibold text-foreground">
                    {data.askToFollowEnabled ? "Yes (Gate enabled)" : "No"}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground">Follow-up check-in:</span>{" "}
                  <span className="font-semibold text-foreground">
                    {data.followUpEnabled ? `Yes (after ${data.followUpDelayMinutes}m)` : "No"}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Action Launch Bar */}
          <div className="pt-4 flex flex-col sm:flex-row items-center gap-3">
            <button
              type="button"
              disabled={isPending}
              onClick={() => onSave(false)}
              className="w-full sm:w-auto px-5 py-2.5 rounded-xl border border-border text-foreground font-semibold text-xs hover:bg-muted transition-colors disabled:opacity-50"
              data-testid="btn-review-save-draft"
            >
              {pendingAction === "save" && isPending ? (
                <span className="flex items-center gap-1.5">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" /> Saving draft...
                </span>
              ) : (
                "Save as Draft"
              )}
            </button>

            <button
              type="button"
              disabled={isPending}
              onClick={() => onSave(true)}
              className="w-full sm:flex-1 py-2.5 px-6 rounded-xl bg-primary text-primary-foreground font-bold text-xs hover:opacity-90 shadow-md transition-all flex items-center justify-center gap-2 disabled:opacity-50"
              data-testid="btn-review-activate"
            >
              {pendingAction === "activate" && isPending ? (
                <span className="flex items-center gap-1.5">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" /> Activating...
                </span>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  Save & Activate Automation
                </>
              )}
            </button>
          </div>
        </div>

        {/* ── RIGHT: Simulated Phone Inbox Preview ── */}
        <div className="lg:col-span-5 sticky top-4 flex flex-col items-center">
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-3 flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-primary" />
            Final Follower Experience
          </p>

          <div className="w-[280px] sm:w-[300px] h-[580px] rounded-[38px] border-[5px] border-neutral-800 bg-[#0c0c0e] shadow-2xl overflow-hidden flex flex-col text-white relative">
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-28 h-5 bg-neutral-900 rounded-b-xl z-20" />

            {/* Chat Header */}
            <div className="pt-7 px-4 pb-3 border-b border-white/10 flex items-center gap-2.5 shrink-0 bg-neutral-950/80 backdrop-blur-md">
              <div className="w-7 h-7 rounded-full bg-gradient-to-tr from-amber-500 to-pink-500 flex items-center justify-center text-[10px] font-bold text-white shrink-0">
                {creatorProfilePicUrl ? (
                  <img
                    src={creatorProfilePicUrl}
                    alt="Creator"
                    className="w-full h-full rounded-full object-cover"
                  />
                ) : (
                  "IG"
                )}
              </div>
              <div className="flex-1 min-w-0">
                <h5 className="text-xs font-bold leading-none truncate">Your Account</h5>
                <span className="text-[9px] text-white/40">Active in Chat</span>
              </div>
            </div>

            {/* Message Thread */}
            <div className="flex-1 overflow-y-auto p-3.5 space-y-3 flex flex-col scrollbar-none">
              {/* Trigger pill */}
              <div className="text-center my-1">
                <span className="text-[9px] px-2 py-0.5 rounded-full bg-white/10 text-white/50">
                  Trigger: {data.keywordsAnyMode ? "Any comment" : data.keywords[0] || "Keyword"}
                </span>
              </div>

              {/* Primary DM Bubble */}
              <div className="self-end max-w-[85%] space-y-1.5">
                <div className="bg-[#3797f0] text-white px-3.5 py-2.5 rounded-2xl rounded-br-sm text-xs leading-relaxed whitespace-pre-wrap shadow-sm">
                  {previewText}
                </div>

                {buttons.length > 0 && (
                  <div className="bg-white/10 border border-white/15 rounded-xl overflow-hidden divide-y divide-white/10">
                    {buttons.map((btn, i) => (
                      <div
                        key={btn.id || i}
                        className="py-2 px-3 text-center text-xs font-semibold text-white/95 flex items-center justify-center gap-1.5"
                      >
                        <span>{btn.title || `Button ${i + 1}`}</span>
                        <ExternalLink className="w-2.5 h-2.5 opacity-60" />
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Follow Gate */}
              {data.askToFollowEnabled && (
                <div className="self-end max-w-[85%] space-y-1 pt-1">
                  <span className="text-[8px] text-white/40 uppercase tracking-widest block text-right">
                    If non-follower
                  </span>
                  <div className="bg-neutral-800 text-white p-3 rounded-2xl rounded-br-sm text-[11px] space-y-2 border border-white/10">
                    <p>{data.askToFollowMessage || "Hey! It seems you're not following me yet 😊"}</p>
                    <div className="grid grid-cols-2 gap-1.5 pt-1">
                      <div className="bg-white/10 py-1 rounded text-center text-[10px] font-semibold">
                        {data.askToFollowVisitProfileButton || "Visit Profile"}
                      </div>
                      <div className="bg-primary py-1 rounded text-center text-[10px] font-semibold">
                        {data.askToFollowConfirmButton || "I'm following"}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Follow-up */}
              {data.followUpEnabled && (
                <div className="self-end max-w-[85%] space-y-1 pt-2">
                  <span className="text-[8px] text-white/40 uppercase tracking-widest block text-right">
                    +{data.followUpDelayMinutes}m Follow-up
                  </span>
                  <div className="bg-[#3797f0]/85 text-white px-3 py-2 rounded-2xl rounded-br-sm text-xs leading-relaxed whitespace-pre-wrap">
                    {previewFollowUp}
                  </div>
                </div>
              )}
            </div>

            {/* Bottom Bar */}
            <div className="p-3 border-t border-white/10 bg-neutral-950/60 flex items-center gap-2">
              <div className="flex-1 h-7 rounded-full bg-white/10 px-3 flex items-center text-[10px] text-white/30">
                Message...
              </div>
              <div className="w-6 h-6 rounded-full bg-[#3797f0] flex items-center justify-center text-white">
                <Send className="w-3 h-3" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

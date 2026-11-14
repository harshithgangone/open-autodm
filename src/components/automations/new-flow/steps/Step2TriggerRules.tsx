"use client";

import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  MessageCircle,
  Plus,
  X,
  Sparkles,
  AlertTriangle,
  CheckCircle2,
  HelpCircle,
  Wand2,
  ShieldCheck,
  ShieldAlert,
  RotateCcw,
  Film,
  Send,
  Loader2,
  Image as ImageIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { AutomationFlowData } from "../NewAutomationModal";

interface Step2TriggerRulesProps {
  data: AutomationFlowData;
  onUpdate: (patch: Partial<AutomationFlowData>) => void;
  validationError?: string | null;
}

const TESTED_PUBLIC_REPLIES = [
  "Sent you a DM! Check your requests 📥",
  "Check your inbox! Just sent it over ✨",
  "Just messaged you the link! 🚀",
  "Sent to your DMs! Let me know if you got it 📬",
  "All sent! Check your message requests 🙌",
];

const SUGGESTED_INCLUDE_KEYWORDS = ["LINK", "GUIDE", "VIP", "INFO", "YES", "SEND"];
const SUGGESTED_EXCLUDE_KEYWORDS = ["SCAM", "FAKE", "HATE", "SPAM", "BOT", "REPORT"];

export function Step2TriggerRules({
  data,
  onUpdate,
  validationError,
}: Step2TriggerRulesProps) {
  const [includeInput, setIncludeInput] = useState("");
  const [excludeInput, setExcludeInput] = useState("");
  const [replyInput, setReplyInput] = useState("");
  const [isAiGenerating, setIsAiGenerating] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  const isComment = !data.type || data.type === "comment-dm" || data.type === "comment_dm";
  const isReel = data.type === "reel-dm" || data.type === "reel_dm";
  const isDm = data.type === "dm-reply" || data.type === "dm_reply";
  const isStory = data.type === "story-reply" || data.type === "story_reply";

  // Include Keywords handler
  const handleAddIncludeKeyword = () => {
    const val = includeInput.trim().toUpperCase();
    if (val && !data.keywords.includes(val)) {
      onUpdate({
        keywords: [...data.keywords, val],
        keywordsAnyMode: false,
      });
      setIncludeInput("");
    }
  };

  const handleRemoveIncludeKeyword = (kw: string) => {
    onUpdate({ keywords: data.keywords.filter((k) => k !== kw) });
  };

  // Exclude Keywords handler
  const excludedKeywords = data.excludedKeywords || [];
  const handleAddExcludeKeyword = () => {
    const val = excludeInput.trim().toUpperCase();
    if (val && !excludedKeywords.includes(val)) {
      onUpdate({
        excludedKeywords: [...excludedKeywords, val],
      });
      setExcludeInput("");
    }
  };

  const handleRemoveExcludeKeyword = (kw: string) => {
    onUpdate({
      excludedKeywords: excludedKeywords.filter((k) => k !== kw),
    });
  };

  // Any mode toggle handler
  const handleToggleAnyMode = (enabled: boolean) => {
    onUpdate({
      keywordsAnyMode: enabled,
      ...(enabled ? { keywords: [] } : {}),
    });
  };

  // Public reply handlers
  const handleAddPublicReply = () => {
    const text = replyInput.trim();
    if (text) {
      const updated = [...data.publicReplyOptions, text];
      onUpdate({
        publicReplyOptions: updated,
        customReplies: updated,
      });
      setReplyInput("");
      setAiError(null);
    }
  };

  const handleRemovePublicReply = (index: number) => {
    const updated = data.publicReplyOptions.filter((_, i) => i !== index);
    onUpdate({
      publicReplyOptions: updated,
      customReplies: updated,
    });
  };

  const handleApplyTemplates = () => {
    onUpdate({
      publicReplyOptions: [...TESTED_PUBLIC_REPLIES],
      customReplies: [...TESTED_PUBLIC_REPLIES],
    });
    setAiError(null);
  };

  const handleGenerateAiReplies = async () => {
    if (isAiGenerating) return;
    setIsAiGenerating(true);
    setAiError(null);
    try {
      const res = await fetch("/api/ai/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "public_replies",
          type: "public_replies",
          prompt: "Generate warm, natural 1-sentence Instagram comment replies confirming we sent them a DM",
          automationName: data.name || "Comment Funnel",
          postCaption: data.postCaption || "",
          count: 5,
        }),
      });

      const json = (await res.json()) as {
        success?: boolean;
        variations?: string[];
        options?: string[];
        error?: string;
      };

      if (!res.ok || !json.success) {
        setAiError(json.error || "Failed to generate AI comment replies. Please try again.");
      } else {
        const replies = (json.variations && json.variations.length > 0)
          ? json.variations
          : (json.options && json.options.length > 0 ? json.options : []);

        if (replies.length > 0) {
          onUpdate({
            publicReplyOptions: replies,
            customReplies: replies,
          });
        } else {
          setAiError("No replies were generated. Please try again.");
        }
      }
    } catch {
      setAiError("Network error generating AI replies. Please try again.");
    } finally {
      setIsAiGenerating(false);
    }
  };

  const getStepHeadline = () => {
    if (isReel) return "Configure Reel DM Trigger Rules";
    if (isDm) return "Choose which Direct Messages to answer";
    if (isStory) return "Choose which Story replies to answer";
    return "Choose which comments should get an automatic reply";
  };

  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-6 md:p-8 max-w-3xl w-full mx-auto space-y-8" data-testid="step-2-trigger-rules">
      {/* Step Header */}
      <div>
        <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
          Step 2: Trigger Rules
        </h2>
        <p className="text-sm text-muted-foreground mt-1">{getStepHeadline()}</p>
      </div>

      {validationError && (
        <div
          className="p-3.5 rounded-xl bg-destructive/10 border border-destructive/30 flex items-start gap-3 text-destructive text-sm"
          data-testid="step-2-error"
        >
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <p className="font-medium">{validationError}</p>
        </div>
      )}

      {/* ── COMMENT TRIGGERS ── */}
      {isComment && (
        <div className="space-y-6">
          {/* Row A: Any Comment Toggle */}
          <div className="p-4 rounded-xl bg-card border border-border space-y-3">
            <div className="flex items-center justify-between gap-4">
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-foreground">
                    Reply to any comment
                  </span>
                  {data.keywordsAnyMode && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                      Broad Match Active
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Replies to every comment regardless of what the user says. Best for general giveaways or high-engagement posts.
                </p>
              </div>

              {/* Toggle switch */}
              <button
                type="button"
                role="switch"
                aria-checked={data.keywordsAnyMode}
                onClick={() => handleToggleAnyMode(!data.keywordsAnyMode)}
                className={cn(
                  "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2",
                  data.keywordsAnyMode ? "bg-primary" : "bg-muted"
                )}
                data-testid="toggle-any-comment"
              >
                <span
                  className={cn(
                    "pointer-events-none inline-block h-5 w-5 transform rounded-full bg-background shadow-lg ring-0 transition duration-200 ease-in-out",
                    data.keywordsAnyMode ? "translate-x-5" : "translate-x-0"
                  )}
                />
              </button>
            </div>

            {data.keywordsAnyMode && (
              <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-xs text-amber-700 dark:text-amber-300 flex items-start gap-2.5">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <p className="leading-relaxed">
                  <strong>Notice:</strong> Every comment will receive your automated DM. Specific keyword matching is bypassed. Make sure your message copy is welcoming to anyone who comments.
                </p>
              </div>
            )}
          </div>

          {/* Row B: Specific Keyword Matching (When Any mode is OFF) */}
          {!data.keywordsAnyMode && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="space-y-6"
            >
              {/* Keywords to INCLUDE */}
              <div className="p-4 sm:p-5 rounded-xl bg-card border border-border space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                      <ShieldCheck className="w-4 h-4 text-emerald-500" />
                      Keywords to INCLUDE <span className="text-destructive">*</span>
                    </h3>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Send the DM only if the comment contains at least one of these words.
                    </p>
                  </div>
                  <span className="text-xs font-semibold text-muted-foreground">
                    {data.keywords.length} active
                  </span>
                </div>

                {/* Input box */}
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={includeInput}
                    onChange={(e) => setIncludeInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleAddIncludeKeyword();
                      }
                    }}
                    placeholder="Type keyword (e.g. LINK) and press Enter"
                    className="flex-1 px-3.5 py-2.5 rounded-xl bg-muted/60 border border-border text-sm uppercase tracking-wide focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary"
                    data-testid="input-keyword-include"
                  />
                  <button
                    type="button"
                    onClick={handleAddIncludeKeyword}
                    className="px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-xs font-semibold hover:opacity-90 transition-opacity"
                    data-testid="btn-add-keyword-include"
                  >
                    Add
                  </button>
                </div>

                {/* Suggested chips */}
                <div className="flex flex-wrap items-center gap-1.5 pt-1">
                  <span className="text-[11px] text-muted-foreground font-medium mr-1">Suggestions:</span>
                  {SUGGESTED_INCLUDE_KEYWORDS.map((sug) => (
                    <button
                      key={sug}
                      type="button"
                      onClick={() => {
                        if (!data.keywords.includes(sug)) {
                          onUpdate({ keywords: [...data.keywords, sug], keywordsAnyMode: false });
                        }
                      }}
                      className="text-[11px] font-semibold px-2 py-0.5 rounded-md bg-muted text-muted-foreground hover:text-foreground hover:bg-muted/80 transition-colors"
                    >
                      +{sug}
                    </button>
                  ))}
                </div>

                {/* Chips list */}
                <div className="flex flex-wrap gap-2 pt-1" data-testid="include-keywords-chips">
                  {data.keywords.map((kw) => (
                    <span
                      key={kw}
                      className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-xs font-bold"
                    >
                      {kw}
                      <button
                        type="button"
                        onClick={() => handleRemoveIncludeKeyword(kw)}
                        className="hover:text-foreground transition-colors p-0.5 rounded"
                        aria-label={`Remove keyword ${kw}`}
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                  {data.keywords.length === 0 && (
                    <p className="text-xs text-destructive italic font-medium">
                      ⚠️ No keywords added. You must add at least one keyword or enable &quot;Reply to any comment&quot; above.
                    </p>
                  )}
                </div>
              </div>

              {/* Keywords to EXCLUDE */}
              <div className="p-4 sm:p-5 rounded-xl bg-card border border-border space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                      <ShieldAlert className="w-4 h-4 text-amber-500" />
                      Keywords to EXCLUDE (Optional)
                    </h3>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Never reply to comments containing any of these words (e.g. spam, complaints).
                    </p>
                  </div>
                  <span className="text-xs font-semibold text-muted-foreground">
                    {excludedKeywords.length} active
                  </span>
                </div>

                {/* Input box */}
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={excludeInput}
                    onChange={(e) => setExcludeInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleAddExcludeKeyword();
                      }
                    }}
                    placeholder="Type excluded word (e.g. SCAM, FAKE) and press Enter"
                    className="flex-1 px-3.5 py-2.5 rounded-xl bg-muted/60 border border-border text-sm uppercase tracking-wide focus:outline-none focus:ring-2 focus:ring-amber-500/40 focus:border-amber-500"
                    data-testid="input-keyword-exclude"
                  />
                  <button
                    type="button"
                    onClick={handleAddExcludeKeyword}
                    className="px-4 py-2.5 rounded-xl bg-muted border border-border text-foreground hover:bg-muted/80 text-xs font-semibold transition-colors"
                    data-testid="btn-add-keyword-exclude"
                  >
                    Add
                  </button>
                </div>

                {/* Suggestions */}
                <div className="flex flex-wrap items-center gap-1.5 pt-1">
                  <span className="text-[11px] text-muted-foreground font-medium mr-1">Suggestions:</span>
                  {SUGGESTED_EXCLUDE_KEYWORDS.map((sug) => (
                    <button
                      key={sug}
                      type="button"
                      onClick={() => {
                        if (!excludedKeywords.includes(sug)) {
                          onUpdate({ excludedKeywords: [...excludedKeywords, sug] });
                        }
                      }}
                      className="text-[11px] font-semibold px-2 py-0.5 rounded-md bg-muted text-muted-foreground hover:text-foreground hover:bg-muted/80 transition-colors"
                    >
                      +{sug}
                    </button>
                  ))}
                </div>

                {/* Exclude chips list */}
                <div className="flex flex-wrap gap-2 pt-1" data-testid="exclude-keywords-chips">
                  {excludedKeywords.map((kw) => (
                    <span
                      key={kw}
                      className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 text-xs font-bold"
                    >
                      {kw}
                      <button
                        type="button"
                        onClick={() => handleRemoveExcludeKeyword(kw)}
                        className="hover:text-foreground transition-colors p-0.5 rounded"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                  {excludedKeywords.length === 0 && (
                    <p className="text-xs text-muted-foreground italic">
                      No excluded words configured. Comments won&apos;t be filtered by negative keywords.
                    </p>
                  )}
                </div>
              </div>
            </motion.div>
          )}

          {/* Row C: Public Comment Reply (Optional) */}
          <div className="p-4 sm:p-5 rounded-xl bg-card border border-border space-y-4">
            <div className="flex items-center justify-between gap-4">
              <div className="space-y-0.5">
                <span className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <MessageCircle className="w-4 h-4 text-primary" />
                  Also reply publicly to the user&apos;s comment
                </span>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Post a visible comment reply telling the user to check their DMs. Great for Instagram algorithm engagement.
                </p>
              </div>

              <button
                type="button"
                role="switch"
                aria-checked={data.publicReplyEnabled}
                onClick={() => onUpdate({ publicReplyEnabled: !data.publicReplyEnabled })}
                className={cn(
                  "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2",
                  data.publicReplyEnabled ? "bg-primary" : "bg-muted"
                )}
                data-testid="toggle-public-reply"
              >
                <span
                  className={cn(
                    "pointer-events-none inline-block h-5 w-5 transform rounded-full bg-background shadow-lg ring-0 transition duration-200 ease-in-out",
                    data.publicReplyEnabled ? "translate-x-5" : "translate-x-0"
                  )}
                />
              </button>
            </div>

            {data.publicReplyEnabled && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                className="space-y-3 pt-3 border-t border-border"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-muted-foreground">
                    Reply variations (Rotates automatically to prevent spam)
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleApplyTemplates}
                      className="text-[11px] font-semibold text-muted-foreground hover:text-foreground px-2 py-1 rounded bg-muted hover:bg-muted/80 transition-colors"
                      data-testid="btn-insert-templates"
                    >
                      Insert 5 Templates
                    </button>
                    <button
                      type="button"
                      onClick={handleGenerateAiReplies}
                      disabled={isAiGenerating}
                      className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary px-2.5 py-1 rounded bg-primary/10 hover:bg-primary/20 transition-colors disabled:opacity-50"
                      data-testid="btn-generate-ai-replies"
                    >
                      {isAiGenerating ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <Sparkles className="w-3 h-3" />
                      )}
                      {isAiGenerating ? "Generating..." : "Generate with AI"}
                    </button>
                  </div>
                </div>

                {aiError && (
                  <p className="text-[11px] text-destructive flex items-center gap-1 mt-1" data-testid="ai-error-message">
                    <AlertTriangle className="w-3 h-3 shrink-0" />
                    {aiError}
                  </p>
                )}

                <div className="space-y-2">
                  {data.publicReplyOptions.map((reply, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-muted/50 border border-border text-xs"
                    >
                      <input
                        type="text"
                        value={reply}
                        onChange={(e) => {
                          const copy = [...data.publicReplyOptions];
                          copy[idx] = e.target.value;
                          onUpdate({ publicReplyOptions: copy, customReplies: copy });
                        }}
                        className="flex-1 bg-transparent border-0 p-0 text-xs text-foreground focus:outline-none focus:ring-0"
                        data-testid={`input-public-reply-${idx}`}
                        aria-label={`Public reply variation ${idx + 1}`}
                      />
                      <button
                        type="button"
                        onClick={() => handleRemovePublicReply(idx)}
                        className="text-muted-foreground hover:text-destructive p-1 rounded"
                        aria-label="Remove reply"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}

                  <div className="flex gap-2 pt-1">
                    <input
                      type="text"
                      value={replyInput}
                      onChange={(e) => setReplyInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          handleAddPublicReply();
                        }
                      }}
                      placeholder="Add custom comment reply..."
                      className="flex-1 px-3 py-2 rounded-lg bg-muted border border-border text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                    <button
                      type="button"
                      onClick={handleAddPublicReply}
                      className="px-3 py-2 rounded-lg bg-muted border border-border text-foreground hover:bg-muted/80 text-xs font-semibold"
                    >
                      Add
                    </button>
                  </div>
                </div>
              </motion.div>
            )}
          </div>
        </div>
      )}

      {/* ── REEL DM TRIGGERS ── */}
      {isReel && (
        <div className="space-y-6">
          <div className="p-4 rounded-xl bg-card border border-border space-y-4">
            <h3 className="text-sm font-semibold text-foreground">
              When should this Reel DM trigger?
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => onUpdate({ keywordsAnyMode: true, keywords: [] })}
                className={cn(
                  "p-3.5 rounded-xl border text-left transition-all",
                  data.keywordsAnyMode
                    ? "border-primary bg-primary/5 ring-1 ring-primary/40"
                    : "border-border bg-card hover:bg-muted/40"
                )}
                data-testid="reel-trigger-any"
              >
                <span className="text-xs font-bold text-foreground block">
                  Any Reel Share (Default)
                </span>
                <span className="text-[11px] text-muted-foreground mt-0.5 block leading-normal">
                  Replies automatically whenever a user shares the Reel into your DMs, even with no text.
                </span>
              </button>

              <button
                type="button"
                onClick={() => onUpdate({ keywordsAnyMode: false })}
                className={cn(
                  "p-3.5 rounded-xl border text-left transition-all",
                  !data.keywordsAnyMode
                    ? "border-primary bg-primary/5 ring-1 ring-primary/40"
                    : "border-border bg-card hover:bg-muted/40"
                )}
                data-testid="reel-trigger-keywords"
              >
                <span className="text-xs font-bold text-foreground block">
                  Only with Specific Keywords
                </span>
                <span className="text-[11px] text-muted-foreground mt-0.5 block leading-normal">
                  Replies only if the user accompanies the Reel share with a keyword.
                </span>
              </button>
            </div>

            {!data.keywordsAnyMode && (
              <div className="space-y-3 pt-3 border-t border-border">
                <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Keywords to match
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={includeInput}
                    onChange={(e) => setIncludeInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleAddIncludeKeyword();
                      }
                    }}
                    placeholder="e.g. RECIPE, INFO"
                    className="flex-1 px-3 py-2 rounded-lg bg-muted border border-border text-xs uppercase"
                  />
                  <button
                    type="button"
                    onClick={handleAddIncludeKeyword}
                    className="px-3 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-semibold"
                  >
                    Add
                  </button>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {data.keywords.map((kw) => (
                    <span
                      key={kw}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-muted text-xs font-bold"
                    >
                      {kw}
                      <button type="button" onClick={() => handleRemoveIncludeKeyword(kw)}>
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── DM / STORY TRIGGERS ── */}
      {(isDm || isStory) && (
        <div className="space-y-6">
          <div className="p-4 sm:p-5 rounded-xl bg-card border border-border space-y-4">
            <div>
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-500" />
                Trigger Keywords <span className="text-destructive">*</span>
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Respond when an incoming {isStory ? "story reply" : "direct message"} contains any of these words.
              </p>
            </div>

            <div className="flex gap-2">
              <input
                type="text"
                value={includeInput}
                onChange={(e) => setIncludeInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleAddIncludeKeyword();
                  }
                }}
                placeholder="Type keyword and press Enter"
                className="flex-1 px-3.5 py-2.5 rounded-xl bg-muted/60 border border-border text-sm uppercase tracking-wide focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary"
                data-testid="input-keyword-dm"
              />
              <button
                type="button"
                onClick={handleAddIncludeKeyword}
                className="px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-xs font-semibold hover:opacity-90"
              >
                Add
              </button>
            </div>

            <div className="flex flex-wrap gap-2">
              {data.keywords.map((kw) => (
                <span
                  key={kw}
                  className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-xs font-bold"
                >
                  {kw}
                  <button type="button" onClick={() => handleRemoveIncludeKeyword(kw)}>
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

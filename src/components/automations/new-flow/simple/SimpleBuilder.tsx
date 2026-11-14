"use client";

import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  MessageCircle,
  Send,
  Film,
  Image,
  ChevronDown,
  ChevronRight,
  Plus,
  Trash2,
  Sparkles,
  ExternalLink,
  ShieldAlert,
  Clock,
  CheckCircle2,
  ArrowRight,
  AlertCircle,
  HelpCircle,
  Layers,
  Wand2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { AutomationFlowData, DMResponse, CardButton } from "../NewAutomationModal";
import { AUTOMATION_TYPES } from "../constants";

interface SimpleBuilderProps {
  data: AutomationFlowData;
  onUpdate: (patch: Partial<AutomationFlowData>) => void;
  onSave: (activate: boolean) => void;
  isPending?: boolean;
  pendingAction?: 'save' | 'activate' | null;
  saveError?: string | null;
  isEditMode?: boolean;
  onOpenVisualCanvas?: () => void;
}

export function SimpleBuilder({
  data,
  onUpdate,
  onSave,
  isPending = false,
  pendingAction = null,
  saveError = null,
  isEditMode = false,
  onOpenVisualCanvas,
}: SimpleBuilderProps) {
  const [activeStage, setActiveStage] = useState<number>(1);
  const [keywordInput, setKeywordInput] = useState("");
  const [activeVariationTab, setActiveVariationTab] = useState(0);

  // Expandable advanced disclosure states
  const [expandTriggerAdvanced, setExpandTriggerAdvanced] = useState(false);
  const [expandDmAdvanced, setExpandDmAdvanced] = useState(false);

  const isComment = data.type === "comment-dm" || data.type === "comment_dm";
  const isReel = data.type === "reel-dm" || data.type === "reel_dm";
  const isDm = data.type === "dm-reply" || data.type === "dm_reply";
  const isStory = data.type === "story-reply" || data.type === "story_reply";

  // Keyword handling
  const addKeyword = () => {
    const val = keywordInput.trim().toUpperCase();
    if (val && !data.keywords.includes(val)) {
      onUpdate({ keywords: [...data.keywords, val], keywordsAnyMode: false });
      setKeywordInput("");
    }
  };

  const removeKeyword = (kw: string) => {
    onUpdate({ keywords: data.keywords.filter((k) => k !== kw) });
  };

  // Link button handling on first response (up to 3 Meta limit)
  const firstResponse = data.dmResponses[0];
  const buttons: CardButton[] = firstResponse?.buttons || [];

  const handleAddLinkButton = () => {
    if (buttons.length >= 3) return;
    const newBtn: CardButton = {
      id: `btn_${Date.now()}`,
      title: buttons.length === 0 ? "Get Link" : `Link ${buttons.length + 1}`,
      link: "https://",
    };
    const updatedButtons = [...buttons, newBtn];
    const newResponses: DMResponse[] = [
      {
        id: firstResponse?.id || `resp_${Date.now()}`,
        type: "text",
        content: firstResponse?.content || data.dmOpeningMessage,
        buttons: updatedButtons,
      },
      ...data.dmResponses.slice(1),
    ];
    onUpdate({ dmResponses: newResponses });
  };

  const handleUpdateButton = (idx: number, patch: Partial<CardButton>) => {
    const updated = [...buttons];
    if (updated[idx]) {
      updated[idx] = { ...updated[idx]!, ...patch };
      const newResponses: DMResponse[] = [
        {
          id: firstResponse?.id || `resp_${Date.now()}`,
          type: "text",
          content: firstResponse?.content || data.dmOpeningMessage,
          buttons: updated,
        },
        ...data.dmResponses.slice(1),
      ];
      onUpdate({ dmResponses: newResponses });
    }
  };

  const handleRemoveButton = (idx: number) => {
    const updated = buttons.filter((_, i) => i !== idx);
    const newResponses: DMResponse[] = [
      {
        id: firstResponse?.id || `resp_${Date.now()}`,
        type: "text",
        content: firstResponse?.content || data.dmOpeningMessage,
        buttons: updated,
      },
      ...data.dmResponses.slice(1),
    ];
    onUpdate({ dmResponses: newResponses });
  };

  const stages = [
    { num: 1, title: "Trigger", desc: "What starts the flow" },
    { num: 2, title: "First DM", desc: "Private response & links" },
    { num: 3, title: "Follow-up", desc: "Optional check-in message" },
    { num: 4, title: "Review & Save", desc: "Confirm and save" },
  ];

  return (
    <div className="flex flex-col h-full overflow-hidden bg-background">
      {/* Compact Top Navigation Stepper */}
      <div className="border-b border-border bg-card/60 px-6 py-3 shrink-0 flex items-center justify-between gap-4">
        <div className="flex items-center gap-2 overflow-x-auto scrollbar-none">
          {stages.map((st) => {
            const isActive = activeStage === st.num;
            const isCompleted = activeStage > st.num;
            return (
              <button
                key={st.num}
                onClick={() => setActiveStage(st.num)}
                className={cn(
                  "flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all shrink-0",
                  isActive
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : isCompleted
                    ? "bg-muted text-foreground hover:bg-muted/80"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/40"
                )}
              >
                <span
                  className={cn(
                    "w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold",
                    isActive
                      ? "bg-primary-foreground text-primary"
                      : isCompleted
                      ? "bg-emerald-500 text-white"
                      : "bg-muted-foreground/30 text-foreground"
                  )}
                >
                  {isCompleted ? "✓" : st.num}
                </span>
                <span>{st.title}</span>
              </button>
            );
          })}
        </div>

        {onOpenVisualCanvas && (
          <button
            onClick={onOpenVisualCanvas}
            className="hidden sm:flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground px-2.5 py-1.5 rounded-lg border border-border hover:bg-muted/60 transition-colors"
          >
            <Layers className="w-3.5 h-3.5 text-primary" />
            <span>Open in Flow Builder</span>
          </button>
        )}
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto p-6 md:p-8 max-w-3xl w-full mx-auto space-y-6">
        {saveError && (
          <div className="p-3.5 rounded-xl bg-destructive/10 border border-destructive/30 flex items-start gap-3 text-destructive text-xs">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">Unable to save automation</p>
              <p className="mt-0.5 leading-relaxed">{saveError}</p>
            </div>
          </div>
        )}

        {/* ── STAGE 1: TRIGGER ────────────────────────────────────────────── */}
        {activeStage === 1 && (
          <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
                Automation Name
              </label>
              <input
                type="text"
                value={data.name}
                onChange={(e) => onUpdate({ name: e.target.value })}
                placeholder="e.g. VIP Guide Comment Funnel"
                className="w-full px-3.5 py-2.5 rounded-xl bg-card border border-border text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                Trigger Type
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {[
                  {
                    id: "comment-dm",
                    title: "Comment on Post or Reel",
                    desc: "Auto-DM users who comment on your posts or reels",
                    icon: MessageCircle,
                    badge: "Most Popular",
                  },
                  {
                    id: "reel-dm",
                    title: "Someone sends me a Reel",
                    desc: "Auto-reply when a follower shares a Reel into your DMs",
                    icon: Film,
                    badge: "New",
                  },
                  {
                    id: "dm-reply",
                    title: "Direct Message Keyword",
                    desc: "Instant automated reply to specific keywords in DM",
                    icon: Send,
                  },
                  {
                    id: "story-reply",
                    title: "Story Reply",
                    desc: "Auto-DM when someone replies to your current Story",
                    icon: Image,
                  },
                ].map((trig) => {
                  const Icon = trig.icon;
                  const isSel = (data.type === trig.id) || (trig.id === "comment-dm" && data.type === "comment_dm") || (trig.id === "reel-dm" && data.type === "reel_dm") || (trig.id === "dm-reply" && data.type === "dm_reply") || (trig.id === "story-reply" && data.type === "story_reply");
                  return (
                    <button
                      key={trig.id}
                      type="button"
                      onClick={() => onUpdate({ type: trig.id, ...(trig.id === 'reel-dm' && (!data.keywords || data.keywords.length === 0) ? { keywordsAnyMode: true } : {}) })}
                      className={cn(
                        "p-3.5 rounded-xl border text-left transition-all relative flex items-start gap-3",
                        isSel
                          ? "border-primary bg-primary/5 ring-1 ring-primary/30"
                          : "border-border bg-card hover:border-foreground/30 hover:bg-muted/30"
                      )}
                    >
                      <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center shrink-0", isSel ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground")}>
                        <Icon className="w-4 h-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 mb-0.5">
                          <p className="text-xs font-semibold text-foreground">{trig.title}</p>
                          {trig.badge && (
                            <span className="text-[9px] font-bold px-1.5 py-0.2 rounded-full bg-primary/10 text-primary">
                              {trig.badge}
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-muted-foreground leading-relaxed">{trig.desc}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Trigger Configuration (Keywords or Reel Match) */}
            <div className="p-4 rounded-xl border border-border bg-card/40 space-y-4">
              {isReel ? (
                <div>
                  <h4 className="text-xs font-semibold text-foreground mb-1">Shared Reel Targeting</h4>
                  <p className="text-[11.5px] text-muted-foreground leading-relaxed mb-3">
                    Choose whether this flow triggers on any Reel sent to your inbox, or when a follower shares a specific Reel from your account.
                  </p>
                  <div className="space-y-2">
                    <label className="flex items-center gap-2.5 cursor-pointer">
                      <input
                        type="radio"
                        name="reelTarget"
                        checked={!data.postId || data.postId === "all"}
                        onChange={() => onUpdate({ postId: null })}
                        className="w-4 h-4 text-primary"
                      />
                      <span className="text-xs font-medium text-foreground">Any shared Reel (Recommended)</span>
                    </label>
                    <label className="flex items-center gap-2.5 cursor-pointer">
                      <input
                        type="radio"
                        name="reelTarget"
                        checked={Boolean(data.postId && data.postId !== "all")}
                        onChange={() => onUpdate({ postId: data.postId || "specific" })}
                        className="w-4 h-4 text-primary"
                      />
                      <span className="text-xs font-medium text-foreground">Specific Reel only</span>
                    </label>
                  </div>
                  {Boolean(data.postId && data.postId !== "all") && (
                    <div className="mt-3">
                      <input
                        type="text"
                        value={data.postId === "specific" ? "" : data.postId || ""}
                        onChange={(e) => onUpdate({ postId: e.target.value.trim() || "specific" })}
                        placeholder="Enter Instagram Reel Video / Media ID"
                        className="w-full px-3 py-2 rounded-lg bg-card border border-border text-xs"
                      />
                    </div>
                  )}

                  <div className="mt-4 pt-3 border-t border-border/60">
                    <div className="flex items-center justify-between mb-2">
                      <div>
                        <label className="text-xs font-semibold text-foreground">
                          Optional Share Keyword Filter
                        </label>
                        <p className="text-[11px] text-muted-foreground">
                          By default, any follower sharing this Reel receives the DM. Add keywords only if you require text typed with the share.
                        </p>
                      </div>
                      <label className="flex items-center gap-1.5 cursor-pointer text-xs text-muted-foreground shrink-0 ml-3">
                        <input
                          type="checkbox"
                          checked={data.keywordsAnyMode || data.keywords.length === 0}
                          onChange={(e) => onUpdate({ keywordsAnyMode: e.target.checked, ...(e.target.checked ? { keywords: [] } : {}) })}
                          className="rounded border-border text-primary focus:ring-primary/40 w-3.5 h-3.5"
                        />
                        <span>Any share</span>
                      </label>
                    </div>

                    {!(data.keywordsAnyMode || data.keywords.length === 0) && (
                      <div className="mt-2">
                        <div className="flex gap-2 mb-2">
                          <input
                            type="text"
                            value={keywordInput}
                            onChange={(e) => setKeywordInput(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === ",") {
                                e.preventDefault();
                                addKeyword();
                              }
                            }}
                            placeholder="Type keyword and press Enter (e.g. VIP, LINK)"
                            className="flex-1 px-3 py-1.5 rounded-lg bg-card border border-border text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                          />
                          <button
                            type="button"
                            onClick={addKeyword}
                            className="px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 transition-colors"
                          >
                            Add
                          </button>
                        </div>
                        {data.keywords.length > 0 && (
                          <div className="flex flex-wrap gap-1.5 pt-1">
                            {data.keywords.map((kw) => (
                              <span
                                key={kw}
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-muted text-foreground text-xs font-medium"
                              >
                                {kw}
                                <button
                                  type="button"
                                  onClick={() => removeKeyword(kw)}
                                  className="text-muted-foreground hover:text-foreground text-[11px] ml-0.5"
                                >
                                  ×
                                </button>
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-xs font-semibold text-foreground">
                      Trigger Keywords
                    </label>
                    <label className="flex items-center gap-1.5 cursor-pointer text-xs text-muted-foreground">
                      <input
                        type="checkbox"
                        checked={data.keywordsAnyMode}
                        onChange={(e) => onUpdate({ keywordsAnyMode: e.target.checked })}
                        className="rounded border-border text-primary focus:ring-primary/40 w-3.5 h-3.5"
                      />
                      <span>{isComment ? "Any comment" : "Any message"}</span>
                    </label>
                  </div>

                  {!data.keywordsAnyMode ? (
                    <div>
                      <div className="flex gap-2 mb-2">
                        <input
                          type="text"
                          value={keywordInput}
                          onChange={(e) => setKeywordInput(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === ",") {
                              e.preventDefault();
                              addKeyword();
                            }
                          }}
                          placeholder="Type keyword and press Enter (e.g. LINK, GUIDE)"
                          className="flex-1 px-3 py-2 rounded-lg bg-card border border-border text-xs"
                        />
                        <button
                          type="button"
                          onClick={addKeyword}
                          className="px-3 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90"
                        >
                          Add
                        </button>
                      </div>

                      <div className="flex flex-wrap gap-1.5 min-h-[32px]">
                        {data.keywords.map((kw) => (
                          <span
                            key={kw}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-muted text-foreground text-xs font-medium"
                          >
                            <span>{kw}</span>
                            <button
                              type="button"
                              onClick={() => removeKeyword(kw)}
                              className="text-muted-foreground hover:text-foreground text-[11px]"
                            >
                              ×
                            </button>
                          </span>
                        ))}
                        {data.keywords.length === 0 && (
                          <span className="text-[11px] text-amber-500 flex items-center gap-1">
                            <AlertCircle className="w-3 h-3" /> Please add at least one keyword, or check &quot;{isComment ? "Any comment" : "Any message"}&quot;.
                          </span>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 text-xs flex items-start gap-2">
                      <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
                      <div>
                        <p className="font-semibold">Wildcard Mode Enabled</p>
                        <p className="text-[11px] leading-relaxed mt-0.5">
                          Every single {isComment ? "comment" : "inbound message"} will automatically trigger this automation. Ensure your rate limits and traffic guard settings are active.
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Expandable Advanced Options */}
            <div className="border border-border rounded-xl overflow-hidden bg-card/20">
              <button
                type="button"
                onClick={() => setExpandTriggerAdvanced((prev) => !prev)}
                className="w-full flex items-center justify-between p-3.5 text-xs font-semibold text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-colors"
              >
                <span>Advanced Trigger Options ({isComment ? "Public Replies & Follow Gate" : "Follow Gate"})</span>
                {expandTriggerAdvanced ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
              </button>

              {expandTriggerAdvanced && (
                <div className="p-4 border-t border-border space-y-4 bg-card/50">
                  {isComment && (
                    <div className="space-y-2">
                      <label className="flex items-center justify-between cursor-pointer">
                        <span className="text-xs font-medium text-foreground">Reply publicly to the comment</span>
                        <input
                          type="checkbox"
                          checked={data.publicReplyEnabled}
                          onChange={(e) => onUpdate({ publicReplyEnabled: e.target.checked })}
                          className="w-4 h-4 text-primary rounded"
                        />
                      </label>
                      {data.publicReplyEnabled && (
                        <p className="text-[11px] text-muted-foreground leading-relaxed pl-1">
                          Open AutoDM will automatically post a rotating public reply to boost engagement (e.g. &quot;Sent to your DMs! 📬&quot;).
                        </p>
                      )}
                    </div>
                  )}

                  <div className="space-y-2 pt-2 border-t border-border">
                    <label className="flex items-center justify-between cursor-pointer">
                      <span className="text-xs font-medium text-foreground">Require user to follow you</span>
                      <input
                        type="checkbox"
                        checked={data.askToFollowEnabled}
                        onChange={(e) => onUpdate({ askToFollowEnabled: e.target.checked })}
                        className="w-4 h-4 text-primary rounded"
                      />
                    </label>
                    {data.askToFollowEnabled && (
                      <p className="text-[11px] text-muted-foreground leading-relaxed pl-1">
                        Sends a polite prompt asking them to follow before unlocking the direct link.
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => setActiveStage(2)}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90"
              >
                <span>Continue to First DM</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </motion.div>
        )}

        {/* ── STAGE 2: FIRST DM ────────────────────────────────────────────── */}
        {activeStage === 2 && (
          <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Opening Direct Message
                </label>
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span>Variation:</span>
                  {[0, 1, 2].map((idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => setActiveVariationTab(idx)}
                      className={cn(
                        "w-5 h-5 rounded text-[10px] font-bold",
                        activeVariationTab === idx
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted text-muted-foreground hover:text-foreground"
                      )}
                    >
                      {idx + 1}
                    </button>
                  ))}
                </div>
              </div>

              <textarea
                rows={4}
                value={
                  data.dmOpeningMessageVariations && data.dmOpeningMessageVariations[activeVariationTab]
                    ? data.dmOpeningMessageVariations[activeVariationTab]
                    : data.dmOpeningMessage
                }
                onChange={(e) => {
                  const val = e.target.value;
                  const currentVars = [...(data.dmOpeningMessageVariations || [])];
                  currentVars[activeVariationTab] = val;
                  onUpdate({
                    dmOpeningMessage: activeVariationTab === 0 ? val : data.dmOpeningMessage,
                    dmOpeningMessageVariations: currentVars,
                  });
                }}
                placeholder="Hey {username}! Thanks for reaching out. Here is what you asked for: 👇"
                className="w-full px-3.5 py-2.5 rounded-xl bg-card border border-border text-xs leading-relaxed focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
              <p className="text-[11px] text-muted-foreground mt-1">
                Tip: Use <code className="text-primary">&#123;username&#125;</code> to personalize with the recipient&apos;s handle.
              </p>
            </div>

            {/* Link Buttons Manager (Up to Meta's 3-button limit) */}
            <div className="p-4 rounded-xl border border-border bg-card/40 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-semibold text-foreground">Link Buttons (Meta Button Template)</h4>
                  <p className="text-[11px] text-muted-foreground">Add up to 3 interactive tap buttons to open websites.</p>
                </div>
                <button
                  type="button"
                  disabled={buttons.length >= 3}
                  onClick={handleAddLinkButton}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 disabled:opacity-40"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Button ({buttons.length}/3)</span>
                </button>
              </div>

              {buttons.length === 0 ? (
                <div className="p-3 rounded-lg border border-dashed border-border text-center text-xs text-muted-foreground">
                  No link buttons attached. Click &quot;Add Button&quot; to include website links.
                </div>
              ) : (
                <div className="space-y-2">
                  {buttons.map((btn, idx) => (
                    <div key={btn.id || idx} className="flex items-center gap-2 p-2.5 rounded-lg bg-muted/40 border border-border">
                      <input
                        type="text"
                        value={btn.title}
                        maxLength={20}
                        onChange={(e) => handleUpdateButton(idx, { title: e.target.value })}
                        placeholder="Button Title (max 20 chars)"
                        className="w-1/3 px-2.5 py-1.5 rounded-md bg-card border border-border text-xs"
                      />
                      <input
                        type="url"
                        value={btn.link}
                        onChange={(e) => handleUpdateButton(idx, { link: e.target.value })}
                        placeholder="https://yourwebsite.com"
                        className="flex-1 px-2.5 py-1.5 rounded-md bg-card border border-border text-xs"
                      />
                      <button
                        type="button"
                        onClick={() => handleRemoveButton(idx)}
                        className="p-1.5 text-muted-foreground hover:text-destructive rounded-md hover:bg-card"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Expandable Advanced Message Controls */}
            <div className="border border-border rounded-xl overflow-hidden bg-card/20">
              <button
                type="button"
                onClick={() => setExpandDmAdvanced((prev) => !prev)}
                className="w-full flex items-center justify-between p-3.5 text-xs font-semibold text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-colors"
              >
                <span>Advanced Message Options (Runtime AI & Reveal Button)</span>
                {expandDmAdvanced ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
              </button>

              {expandDmAdvanced && (
                <div className="p-4 border-t border-border space-y-4 bg-card/50">
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-foreground">Tap-to-Reveal Quick Reply Button</label>
                    <input
                      type="text"
                      value={data.dmOpeningMessageButtonTitle}
                      onChange={(e) => onUpdate({ dmOpeningMessageButtonTitle: e.target.value })}
                      placeholder="e.g. Send me the link ✨"
                      className="w-full px-3 py-2 rounded-lg bg-card border border-border text-xs"
                    />
                    <p className="text-[11px] text-muted-foreground">
                      Creates a qualifying interaction when the user taps it, opening the full 24-hour messaging window.
                    </p>
                  </div>

                  <div className="space-y-2 pt-2 border-t border-border">
                    <label className="flex items-center justify-between cursor-pointer">
                      <span className="text-xs font-medium text-foreground">Enable Workers AI Runtime Responder</span>
                      <input
                        type="checkbox"
                        checked={data.aiRuntimeModeEnabled}
                        onChange={(e) => onUpdate({ aiRuntimeModeEnabled: e.target.checked })}
                        className="w-4 h-4 text-primary rounded"
                      />
                    </label>
                    {data.aiRuntimeModeEnabled && (
                      <textarea
                        rows={2}
                        value={data.aiRuntimeInstructions}
                        onChange={(e) => onUpdate({ aiRuntimeInstructions: e.target.value })}
                        placeholder="Instructions for the AI (e.g. Answer questions concisely and encourage them to click the link)"
                        className="w-full px-3 py-2 rounded-lg bg-card border border-border text-xs"
                      />
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center justify-between pt-2">
              <button
                type="button"
                onClick={() => setActiveStage(1)}
                className="px-4 py-2 rounded-xl text-xs font-medium text-muted-foreground hover:text-foreground"
              >
                Back
              </button>
              <button
                type="button"
                onClick={() => setActiveStage(3)}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90"
              >
                <span>Continue to Follow-up</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </motion.div>
        )}

        {/* ── STAGE 3: OPTIONAL FOLLOW-UP ──────────────────────────────────── */}
        {activeStage === 3 && (
          <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
            <div className="p-4 rounded-xl border border-border bg-card/60 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-foreground">Follow-up Check-in Message</h3>
                  <p className="text-xs text-muted-foreground">Send an automated check-in if the user interacts with your first message.</p>
                </div>
                <input
                  type="checkbox"
                  checked={data.followUpEnabled}
                  onChange={(e) => onUpdate({ followUpEnabled: e.target.checked })}
                  className="w-5 h-5 text-primary rounded"
                />
              </div>

              {data.followUpEnabled && (
                <div className="space-y-4 pt-3 border-t border-border">
                  <div className="p-3 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-600 dark:text-blue-400 text-xs flex items-start gap-2">
                    <Clock className="w-4 h-4 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-semibold">Meta 24-Hour Messaging Policy Compliance</p>
                      <p className="text-[11px] leading-relaxed mt-0.5">
                        Follow-ups are only dispatched to eligible recipients who interact back with your account, opening the official 24-hour window. If no interaction occurred, the follow-up is safely skipped.
                      </p>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-foreground mb-1.5">
                      Send Delay After First Interaction
                    </label>
                    <div className="grid grid-cols-4 gap-2">
                      {[10, 20, 60, 120].map((mins) => (
                        <button
                          key={mins}
                          type="button"
                          onClick={() => onUpdate({ followUpDelayMinutes: mins })}
                          className={cn(
                            "py-2 rounded-lg text-xs font-semibold border text-center transition-all",
                            data.followUpDelayMinutes === mins
                              ? "bg-primary text-primary-foreground border-primary"
                              : "bg-card text-foreground border-border hover:bg-muted"
                          )}
                        >
                          {mins < 60 ? `${mins} mins` : `${mins / 60} hour${mins > 60 ? "s" : ""}`}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-foreground mb-1.5">
                      Follow-up Message Text
                    </label>
                    <textarea
                      rows={3}
                      value={data.followUpMessage}
                      onChange={(e) => onUpdate({ followUpMessage: e.target.value })}
                      placeholder="Hey {username}, did you get a chance to review the details?"
                      className="w-full px-3.5 py-2.5 rounded-xl bg-card border border-border text-xs leading-relaxed focus:outline-none focus:ring-2 focus:ring-primary/40"
                    />
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center justify-between pt-2">
              <button
                type="button"
                onClick={() => setActiveStage(2)}
                className="px-4 py-2 rounded-xl text-xs font-medium text-muted-foreground hover:text-foreground"
              >
                Back
              </button>
              <button
                type="button"
                onClick={() => setActiveStage(4)}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90"
              >
                <span>Continue to Review</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </motion.div>
        )}

        {/* ── STAGE 4: REVIEW & SAVE ───────────────────────────────────────── */}
        {activeStage === 4 && (
          <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
            <div className="p-5 rounded-2xl border border-border bg-card/60 space-y-4">
              <h3 className="text-sm font-semibold text-foreground">Summary & Verification</h3>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                <div className="p-3 rounded-xl bg-muted/40 border border-border">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block mb-1">
                    Trigger
                  </span>
                  <p className="font-semibold text-foreground">
                    {data.type === "reel-dm"
                      ? "Shared Reel"
                      : isComment
                      ? "Post/Reel Comment"
                      : isDm
                      ? "DM Keyword"
                      : "Story Reply"}
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    {data.keywordsAnyMode ? "Wildcard (Any)" : `${data.keywords.length} keyword(s)`}
                  </p>
                </div>

                <div className="p-3 rounded-xl bg-muted/40 border border-border">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block mb-1">
                    First DM
                  </span>
                  <p className="font-semibold text-foreground truncate">
                    {data.dmOpeningMessage.slice(0, 24)}...
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    {buttons.length} link button(s)
                  </p>
                </div>

                <div className="p-3 rounded-xl bg-muted/40 border border-border">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block mb-1">
                    Follow-up
                  </span>
                  <p className="font-semibold text-foreground">
                    {data.followUpEnabled ? `Enabled (${data.followUpDelayMinutes}m)` : "Disabled"}
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    {data.followUpEnabled ? "Policy Gated" : "No auto-checkin"}
                  </p>
                </div>
              </div>

              <div className="pt-2 text-xs text-muted-foreground leading-relaxed flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                <span>Rate limits, opt-out suppression, and deduplication protection are active for this automation.</span>
              </div>
            </div>

            <div className="flex items-center justify-between pt-4 border-t border-border">
              <button
                type="button"
                onClick={() => setActiveStage(3)}
                className="px-4 py-2 rounded-xl text-xs font-medium text-muted-foreground hover:text-foreground"
              >
                Back
              </button>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  disabled={isPending}
                  onClick={() => onSave(false)}
                  className="px-4 py-2 rounded-xl border border-border text-xs font-semibold text-foreground hover:bg-muted transition-colors disabled:opacity-40"
                >
                  {isPending && pendingAction === "save" ? "Saving..." : "Save as Draft"}
                </button>
                <button
                  type="button"
                  disabled={isPending}
                  onClick={() => onSave(true)}
                  className="px-4 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 transition-colors shadow-sm disabled:opacity-40"
                >
                  {isPending && pendingAction === "activate" ? "Activating..." : "Save & Activate"}
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
}

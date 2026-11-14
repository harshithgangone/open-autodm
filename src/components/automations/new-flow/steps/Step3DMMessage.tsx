"use client";

import React, { useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  MessageSquare,
  Plus,
  Trash2,
  ExternalLink,
  Clock,
  UserCheck,
  Sparkles,
  AlertCircle,
  ChevronDown,
  ChevronRight,
  Eye,
  Check,
  Send,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { AutomationFlowData, CardButton, DMResponse } from "../NewAutomationModal";

interface Step3DMMessageProps {
  data: AutomationFlowData;
  onUpdate: (patch: Partial<AutomationFlowData>) => void;
  creatorProfilePicUrl?: string | null;
  validationError?: string | null;
}

export function Step3DMMessage({
  data,
  onUpdate,
  creatorProfilePicUrl,
  validationError,
}: Step3DMMessageProps) {
  const [showVariations, setShowVariations] = useState(false);
  const [mobileTab, setMobileTab] = useState<"edit" | "preview">("edit");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const followUpTextareaRef = useRef<HTMLTextAreaElement>(null);

  // Link buttons on the primary message (Meta limit: up to 3 buttons)
  const firstResponse = data.dmResponses[0];
  const buttons: CardButton[] = firstResponse?.buttons || [];

  const handleInsertVariable = (variable: string, target: "primary" | "followup") => {
    if (target === "primary") {
      const el = textareaRef.current;
      if (!el) {
        onUpdate({ dmOpeningMessage: data.dmOpeningMessage + " " + variable });
        return;
      }
      const start = el.selectionStart;
      const end = el.selectionEnd;
      const text = data.dmOpeningMessage;
      const newText = text.substring(0, start) + variable + text.substring(end);
      onUpdate({ dmOpeningMessage: newText });
      setTimeout(() => {
        el.focus();
        el.setSelectionRange(start + variable.length, start + variable.length);
      }, 0);
    } else {
      const el = followUpTextareaRef.current;
      if (!el) {
        onUpdate({ followUpMessage: data.followUpMessage + " " + variable });
        return;
      }
      const start = el.selectionStart;
      const end = el.selectionEnd;
      const text = data.followUpMessage;
      const newText = text.substring(0, start) + variable + text.substring(end);
      onUpdate({ followUpMessage: newText });
      setTimeout(() => {
        el.focus();
        el.setSelectionRange(start + variable.length, start + variable.length);
      }, 0);
    }
  };

  const handleAddButton = () => {
    if (buttons.length >= 3) return;
    const newBtn: CardButton = {
      id: `btn_${Date.now()}`,
      title: buttons.length === 0 ? "Get The Link" : `Link ${buttons.length + 1}`,
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

  // Variations handlers (up to 3)
  const variations = data.dmOpeningMessageVariations || [];
  const handleAddVariation = () => {
    if (variations.length >= 3) return;
    onUpdate({
      dmOpeningMessageVariations: [
        ...variations,
        `Hey {username}! Here is another variation of the details: 👇`,
      ],
    });
  };

  const handleUpdateVariation = (idx: number, text: string) => {
    const updated = [...variations];
    updated[idx] = text;
    onUpdate({ dmOpeningMessageVariations: updated });
  };

  const handleRemoveVariation = (idx: number) => {
    onUpdate({
      dmOpeningMessageVariations: variations.filter((_, i) => i !== idx),
    });
  };

  // Preview formatted text with variable replacements
  const previewText = (data.dmOpeningMessage || "Hey there! Thanks for reaching out.").replace(
    /\{username\}/g,
    "@alex_creator"
  );
  const previewFollowUp = (data.followUpMessage || "Hey! Did you check the link?").replace(
    /\{username\}/g,
    "@alex_creator"
  );

  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-6 md:p-8 max-w-5xl w-full mx-auto" data-testid="step-3-dm-message">
      {/* Mobile Tab Toggle */}
      <div className="flex lg:hidden items-center justify-center mb-6">
        <div className="inline-flex bg-muted p-1 rounded-xl border border-border">
          <button
            type="button"
            onClick={() => setMobileTab("edit")}
            className={cn(
              "px-4 py-1.5 rounded-lg text-xs font-semibold transition-all",
              mobileTab === "edit"
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            Edit Message
          </button>
          <button
            type="button"
            onClick={() => setMobileTab("preview")}
            className={cn(
              "px-4 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5",
              mobileTab === "preview"
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Eye className="w-3.5 h-3.5" />
            Live Preview
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* ── LEFT COLUMN: Form Editors ── */}
        <div
          className={cn(
            "lg:col-span-7 space-y-6",
            mobileTab === "preview" ? "hidden lg:block" : "block"
          )}
        >
          <div>
            <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
              Step 3: DM Message
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              Write the private response your followers will receive in their Instagram inbox.
            </p>
          </div>

          {validationError && (
            <div
              className="p-3.5 rounded-xl bg-destructive/10 border border-destructive/30 flex items-start gap-3 text-destructive text-sm"
              data-testid="step-3-error"
            >
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <p className="font-medium">{validationError}</p>
            </div>
          )}

          {/* 1. Primary Message Card */}
          <div className="p-4 sm:p-5 rounded-xl bg-card border border-border space-y-3">
            <div className="flex items-center justify-between">
              <label
                htmlFor="dm-message-textarea"
                className="text-xs font-bold uppercase tracking-wider text-muted-foreground"
              >
                Primary Message <span className="text-destructive">*</span>
              </label>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleInsertVariable("{username}", "primary")}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-primary/10 text-primary border border-primary/20 hover:bg-primary/20 transition-colors"
                  data-testid="btn-insert-username"
                >
                  + &#123;username&#125;
                </button>
                <span className="text-[11px] text-muted-foreground tabular-nums">
                  {data.dmOpeningMessage.length} / 1000
                </span>
              </div>
            </div>

            <textarea
              id="dm-message-textarea"
              ref={textareaRef}
              rows={5}
              maxLength={1000}
              value={data.dmOpeningMessage}
              onChange={(e) => onUpdate({ dmOpeningMessage: e.target.value })}
              placeholder="Hey {username}! Thanks for reaching out. Here is what you requested: 👇"
              className="w-full px-4 py-3 rounded-xl bg-muted/50 border border-border text-foreground text-sm leading-relaxed placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-all resize-y"
              data-testid="textarea-dm-message"
            />
            <p className="text-[11px] text-muted-foreground">
              Tip: Use <code className="text-primary font-mono">&#123;username&#125;</code> to dynamically greet each follower by their Instagram handle.
            </p>
          </div>

          {/* 2. Link Buttons (Meta Send API limit: max 3) */}
          <div className="p-4 sm:p-5 rounded-xl bg-card border border-border space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <ExternalLink className="w-4 h-4 text-primary" />
                  Links & Action Buttons
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Attach up to 3 interactive clickable buttons to your message.
                </p>
              </div>
              <span className="text-xs font-semibold text-muted-foreground tabular-nums">
                {buttons.length} / 3 buttons
              </span>
            </div>

            <div className="space-y-3" data-testid="buttons-list">
              {buttons.map((btn, idx) => {
                const isValidUrl =
                  btn.link.startsWith("https://") || btn.link.startsWith("http://");

                return (
                  <div
                    key={btn.id}
                    className="p-3.5 rounded-xl bg-muted/40 border border-border space-y-3"
                    data-testid={`button-row-${idx}`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-foreground">
                        Button {idx + 1}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleRemoveButton(idx)}
                        className="text-muted-foreground hover:text-destructive p-1 rounded transition-colors"
                        aria-label={`Remove button ${idx + 1}`}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      <div className="space-y-1">
                        <div className="flex items-center justify-between">
                          <label className="text-[10px] uppercase font-bold text-muted-foreground">
                            Button Title
                          </label>
                          <span className="text-[10px] text-muted-foreground">
                            {btn.title.length}/20
                          </span>
                        </div>
                        <input
                          type="text"
                          maxLength={20}
                          value={btn.title}
                          onChange={(e) => handleUpdateButton(idx, { title: e.target.value })}
                          placeholder="e.g. Get the Guide"
                          className="w-full px-3 py-1.5 rounded-lg bg-card border border-border text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                          data-testid={`input-button-title-${idx}`}
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="text-[10px] uppercase font-bold text-muted-foreground">
                          Destination URL
                        </label>
                        <input
                          type="url"
                          value={btn.link}
                          onChange={(e) => handleUpdateButton(idx, { link: e.target.value })}
                          placeholder="https://yourwebsite.com/guide"
                          className={cn(
                            "w-full px-3 py-1.5 rounded-lg bg-card border text-xs focus:outline-none focus:ring-1",
                            !isValidUrl && btn.link.length > 0
                              ? "border-amber-500/60 focus:ring-amber-500"
                              : "border-border focus:ring-primary"
                          )}
                          data-testid={`input-button-url-${idx}`}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}

              {buttons.length < 3 && (
                <button
                  type="button"
                  onClick={handleAddButton}
                  className="w-full py-2.5 rounded-xl border border-dashed border-border hover:border-primary/50 hover:bg-primary/5 text-xs font-semibold text-primary flex items-center justify-center gap-1.5 transition-all"
                  data-testid="btn-add-link-button"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add Link Button ({buttons.length}/3)
                </button>
              )}
            </div>
          </div>

          {/* 3. Message Variations (Anti-Spam) */}
          <div className="rounded-xl bg-card border border-border overflow-hidden">
            <button
              type="button"
              onClick={() => setShowVariations(!showVariations)}
              className="w-full p-4 flex items-center justify-between text-left hover:bg-muted/30 transition-colors"
            >
              <div className="flex items-center gap-2.5">
                <Sparkles className="w-4 h-4 text-amber-500" />
                <div>
                  <h4 className="text-sm font-semibold text-foreground">
                    Message Variations (Optional)
                  </h4>
                  <p className="text-xs text-muted-foreground">
                    Rotate multiple messages to protect your account and improve delivery.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-muted-foreground">
                  {variations.length} variations
                </span>
                {showVariations ? (
                  <ChevronDown className="w-4 h-4 text-muted-foreground" />
                ) : (
                  <ChevronRight className="w-4 h-4 text-muted-foreground" />
                )}
              </div>
            </button>

            {showVariations && (
              <div className="p-4 pt-0 space-y-3 border-t border-border">
                <p className="text-xs text-muted-foreground pt-3 leading-relaxed">
                  Instagram delivery systems favor creators who vary message copy slightly to prevent repetitive spam flags. Open AutoDM will alternate between your variations automatically.
                </p>

                {variations.map((v, i) => (
                  <div key={i} className="flex gap-2 items-start">
                    <textarea
                      rows={2}
                      value={v}
                      onChange={(e) => handleUpdateVariation(i, e.target.value)}
                      className="flex-1 p-2.5 rounded-lg bg-muted border border-border text-xs leading-relaxed"
                    />
                    <button
                      type="button"
                      onClick={() => handleRemoveVariation(i)}
                      className="text-muted-foreground hover:text-destructive p-2 rounded"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}

                {variations.length < 3 && (
                  <button
                    type="button"
                    onClick={handleAddVariation}
                    className="text-xs font-semibold text-primary hover:underline flex items-center gap-1 pt-1"
                  >
                    <Plus className="w-3.5 h-3.5" /> Add another variation
                  </button>
                )}
              </div>
            )}
          </div>

          {/* 4. Follow-Gate: Ask to follow before sending link */}
          <div className="p-4 sm:p-5 rounded-xl bg-card border border-border space-y-4">
            <div className="flex items-center justify-between gap-4">
              <div className="space-y-0.5">
                <span className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <UserCheck className="w-4 h-4 text-primary" />
                  Ask them to follow you first (Follow Prompt)
                </span>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Prompts the recipient to follow your account before unlocking the link, checking follow status when supported by Meta permissions (fails open gracefully).
                </p>
              </div>

              <button
                type="button"
                role="switch"
                aria-checked={data.askToFollowEnabled}
                onClick={() => onUpdate({ askToFollowEnabled: !data.askToFollowEnabled })}
                className={cn(
                  "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2",
                  data.askToFollowEnabled ? "bg-primary" : "bg-muted"
                )}
                data-testid="toggle-ask-to-follow"
              >
                <span
                  className={cn(
                    "pointer-events-none inline-block h-5 w-5 transform rounded-full bg-background shadow-lg ring-0 transition duration-200 ease-in-out",
                    data.askToFollowEnabled ? "translate-x-5" : "translate-x-0"
                  )}
                />
              </button>
            </div>

            {data.askToFollowEnabled && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                className="space-y-3 pt-3 border-t border-border"
              >
                <div>
                  <label className="text-[10px] uppercase font-bold text-muted-foreground">
                    Follow Prompt Message
                  </label>
                  <input
                    type="text"
                    value={data.askToFollowMessage}
                    onChange={(e) => onUpdate({ askToFollowMessage: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg bg-muted border border-border text-xs mt-1"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] uppercase font-bold text-muted-foreground">
                      Profile Button
                    </label>
                    <input
                      type="text"
                      value={data.askToFollowVisitProfileButton}
                      onChange={(e) =>
                        onUpdate({ askToFollowVisitProfileButton: e.target.value })
                      }
                      className="w-full px-3 py-1.5 rounded-lg bg-muted border border-border text-xs mt-1"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] uppercase font-bold text-muted-foreground">
                      Confirmation Button
                    </label>
                    <input
                      type="text"
                      value={data.askToFollowConfirmButton}
                      onChange={(e) => onUpdate({ askToFollowConfirmButton: e.target.value })}
                      className="w-full px-3 py-1.5 rounded-lg bg-muted border border-border text-xs mt-1"
                    />
                  </div>
                </div>
              </motion.div>
            )}
          </div>

          {/* 5. Follow-Up Message */}
          <div className="p-4 sm:p-5 rounded-xl bg-card border border-border space-y-4">
            <div className="flex items-center justify-between gap-4">
              <div className="space-y-0.5">
                <span className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <Clock className="w-4 h-4 text-primary" />
                  Send a follow-up message if they don&apos;t reply
                </span>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Automatically check in with the follower later to maximize conversions.
                </p>
              </div>

              <button
                type="button"
                role="switch"
                aria-checked={data.followUpEnabled}
                onClick={() => onUpdate({ followUpEnabled: !data.followUpEnabled })}
                className={cn(
                  "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2",
                  data.followUpEnabled ? "bg-primary" : "bg-muted"
                )}
                data-testid="toggle-follow-up"
              >
                <span
                  className={cn(
                    "pointer-events-none inline-block h-5 w-5 transform rounded-full bg-background shadow-lg ring-0 transition duration-200 ease-in-out",
                    data.followUpEnabled ? "translate-x-5" : "translate-x-0"
                  )}
                />
              </button>
            </div>

            {data.followUpEnabled && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                className="space-y-4 pt-3 border-t border-border"
              >
                <div>
                  <label className="text-xs font-semibold text-foreground block mb-1.5">
                    Delay before follow-up
                  </label>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {[
                      { label: "30 minutes", mins: 30 },
                      { label: "1 hour", mins: 60 },
                      { label: "3 hours", mins: 180 },
                      { label: "24 hours", mins: 1440 },
                    ].map((opt) => (
                      <button
                        key={opt.mins}
                        type="button"
                        onClick={() => onUpdate({ followUpDelayMinutes: opt.mins })}
                        className={cn(
                          "py-2 px-3 rounded-lg text-xs font-semibold border transition-all text-center",
                          data.followUpDelayMinutes === opt.mins
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-border bg-muted/60 text-muted-foreground hover:text-foreground"
                        )}
                        data-testid={`delay-option-${opt.mins}`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                  <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground mt-2">
                    <Check className="w-3 h-3 text-emerald-500" /> Complies with Meta&apos;s 24-hour messaging window.
                  </span>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] uppercase font-bold text-muted-foreground">
                      Follow-up message
                    </label>
                    <button
                      type="button"
                      onClick={() => handleInsertVariable("{username}", "followup")}
                      className="text-[10px] font-bold text-primary hover:underline"
                    >
                      + &#123;username&#125;
                    </button>
                  </div>
                  <textarea
                    ref={followUpTextareaRef}
                    rows={3}
                    value={data.followUpMessage}
                    onChange={(e) => onUpdate({ followUpMessage: e.target.value })}
                    placeholder="Hey {username}, did you get a chance to check the link I sent you?"
                    className="w-full px-3.5 py-2.5 rounded-lg bg-muted border border-border text-xs leading-relaxed focus:outline-none focus:ring-1 focus:ring-primary"
                    data-testid="textarea-follow-up-message"
                  />
                </div>
              </motion.div>
            )}
          </div>
        </div>

        {/* ── RIGHT COLUMN: Live Phone Preview ── */}
        <div
          className={cn(
            "lg:col-span-5 sticky top-4",
            mobileTab === "edit" ? "hidden lg:block" : "block"
          )}
        >
          <div className="flex flex-col items-center">
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-3 flex items-center gap-1.5">
              <Eye className="w-3.5 h-3.5 text-primary" />
              Live Inbox Preview
            </p>

            {/* Simulated Phone Shell */}
            <div className="w-[280px] sm:w-[300px] h-[580px] rounded-[38px] border-[5px] border-neutral-800 bg-[#0c0c0e] shadow-2xl overflow-hidden flex flex-col text-white relative">
              {/* Top notch */}
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
                {/* Trigger context pill */}
                <div className="text-center my-1">
                  <span className="text-[9px] px-2 py-0.5 rounded-full bg-white/10 text-white/50">
                    Automation triggered
                  </span>
                </div>

                {/* Primary DM Bubble */}
                <div className="self-end max-w-[85%] space-y-1.5">
                  <div className="bg-[#3797f0] text-white px-3.5 py-2.5 rounded-2xl rounded-br-sm text-xs leading-relaxed whitespace-pre-wrap shadow-sm">
                    {previewText}
                  </div>

                  {/* Buttons attached to DM */}
                  {buttons.length > 0 && (
                    <div className="bg-white/10 border border-white/15 rounded-xl overflow-hidden divide-y divide-white/10">
                      {buttons.map((btn, i) => (
                        <div
                          key={btn.id || i}
                          className="py-2 px-3 text-center text-xs font-semibold text-white/95 hover:bg-white/10 transition-colors cursor-pointer flex items-center justify-center gap-1.5"
                        >
                          <span>{btn.title || `Button ${i + 1}`}</span>
                          <ExternalLink className="w-2.5 h-2.5 opacity-60" />
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Follow Gate Simulation */}
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

                {/* Follow-up message preview */}
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

              {/* Bottom message bar */}
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
    </div>
  );
}

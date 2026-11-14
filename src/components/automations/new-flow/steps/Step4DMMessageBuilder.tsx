"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
    MessageSquare, Plus, Trash2, Link as LinkIcon, Image as ImageIcon,
    Sparkles, Bot, AlertTriangle, Loader2, Check, ExternalLink, X, Eye
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { AutomationFlowData, DMResponse, CardButton } from "../NewAutomationModal";
import { MAX_DM_RESPONSES } from "@/lib/api/schemas";

const MAX_IMAGE_BYTES = 2 * 1024 * 1024; // 2 MB
const MAX_BUTTONS_PER_MESSAGE = 3; // Instagram API limit for Button and Generic templates

interface Step4DMMessageBuilderProps {
    data: AutomationFlowData;
    onChange: (patch: Partial<AutomationFlowData>) => void;
}

function randomId(): string {
    return Math.random().toString(36).slice(2, 10);
}

export function Step4DMMessageBuilder({ data, onChange }: Step4DMMessageBuilderProps) {
    const [selectedVariationTab, setSelectedVariationTab] = useState(0);
    const [openingAiPrompt, setOpeningAiPrompt] = useState("");
    const [isGeneratingOpeningVariations, setIsGeneratingOpeningVariations] = useState(false);
    const [openingVariationsError, setOpeningVariationsError] = useState<string | null>(null);

    // AI generation for response text
    const [isGeneratingResponseDraft, setIsGeneratingResponseDraft] = useState(false);
    const [responseDraftError, setResponseDraftError] = useState<string | null>(null);
    const [responseAiPrompt, setResponseAiPrompt] = useState("");
    const [showAiResponseDraft, setShowAiResponseDraft] = useState(false);

    const handleGenerateOpeningVariations = async (mode: 'custom' | 'auto') => {
        setIsGeneratingOpeningVariations(true);
        setOpeningVariationsError(null);
        try {
            const prompt = mode === 'custom' ? openingAiPrompt : "Generate 5 friendly, high-converting opening DMs thanking the user for commenting and inviting them to tap the button below";
            const res = await fetch("/api/ai/generate", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    type: "opening_dm",
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
                setOpeningVariationsError(json.error || "Failed to generate variations");
            } else if (json.variations && json.variations.length > 0) {
                onChange({
                    dmOpeningMessageVariations: json.variations,
                    dmOpeningMessage: json.variations[0] ?? data.dmOpeningMessage,
                });
            }
        } catch {
            setOpeningVariationsError("Network or server error generating opening variations");
        } finally {
            setIsGeneratingOpeningVariations(false);
        }
    };

    const handleGenerateResponseDraft = async (mode: 'custom' | 'auto') => {
        setIsGeneratingResponseDraft(true);
        setResponseDraftError(null);
        try {
            const prompt = mode === 'custom' ? responseAiPrompt : "Generate a helpful, concise follow-up DM delivering the promised resource, guide, or link";
            const res = await fetch("/api/ai/generate", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    type: "response_draft",
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
                setResponseDraftError(json.error || "Failed to generate response draft");
            } else if (json.draft) {
                addResponse("text", json.draft);
                setShowAiResponseDraft(false);
                setResponseAiPrompt("");
            }
        } catch {
            setResponseDraftError("Network error generating response draft");
        } finally {
            setIsGeneratingResponseDraft(false);
        }
    };

    const addResponse = (type: "text" | "card", initialContent = "") => {
        if (data.dmResponses.length >= MAX_DM_RESPONSES) return;
        const newResponse: DMResponse = {
            id: randomId(),
            type,
            content: initialContent || (type === "text" ? "Here is the details and link you requested! 👇" : ""),
            buttons: [],
            cardButtons: type === "card" ? [{ id: randomId(), title: "Get the guide", link: "https://" }] : [],
        };
        onChange({ dmResponses: [...data.dmResponses, newResponse] });
    };

    const updateResponse = (idx: number, patch: Partial<DMResponse>) => {
        const updated = [...data.dmResponses];
        const existing = updated[idx];
        if (!existing) return;
        updated[idx] = { ...existing, ...patch } as DMResponse;
        onChange({ dmResponses: updated });
    };

    const deleteResponse = (idx: number) => {
        onChange({ dmResponses: data.dmResponses.filter((_, i) => i !== idx) });
    };

    const canAddMoreResponses = data.dmResponses.length < MAX_DM_RESPONSES;

    return (
        <div className="space-y-6" data-testid="step-4-dm-message-builder">
            {/* Step Header */}
            <div className="space-y-1">
                <h3 className="text-base font-semibold text-foreground flex items-center gap-2">
                    <MessageSquare className="w-4 h-4 text-primary" />
                    Step 4: DM Message Builder & Links
                </h3>
                <p className="text-[13px] text-muted-foreground">
                    Author your interactive opening direct message and sequential link responses.
                </p>
            </div>

            {/* ── SECTION A: OPENING MESSAGE (if enabled) ── */}
            {data.isAutoDmEnabled && data.dmOpeningMessageEnabled && (
                <div className="rounded-xl border border-border bg-card overflow-hidden" data-testid="section-opening-dm">
                    <div className="p-4 bg-muted/30 border-b border-border flex items-center justify-between">
                        <div>
                            <p className="text-[13px] font-semibold text-foreground">Interactive Opening DM</p>
                            <p className="text-[11.5px] text-muted-foreground">
                                The first message delivered immediately when the trigger fires
                            </p>
                        </div>
                        <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                            First Contact
                        </span>
                    </div>

                    <div className="p-4 space-y-4 bg-background">
                        {/* AI Suggestions Box */}
                        <div className="p-3.5 rounded-lg border border-primary/20 bg-primary/5 space-y-2.5">
                            <div className="flex items-center justify-between">
                                <label className="text-[12px] font-semibold text-primary flex items-center gap-1.5">
                                    <Sparkles className="w-3.5 h-3.5" /> What should the AI say?
                                </label>
                                <span className="text-[10px] text-muted-foreground">Free AI Drafts</span>
                            </div>
                            <textarea
                                value={openingAiPrompt}
                                onChange={(e) => setOpeningAiPrompt(e.target.value)}
                                rows={2}
                                maxLength={500}
                                placeholder="Describe your offer, vibe, or goal (e.g. Friendly message thanking for interest, offering free PDF)..."
                                className="w-full bg-background border border-border rounded-lg p-2.5 text-[12.5px] text-foreground outline-none focus:border-primary/40 resize-none"
                                data-testid="textarea-opening-ai-prompt"
                            />
                            <div className="flex items-center gap-2 flex-wrap">
                                <button
                                    type="button"
                                    onClick={() => handleGenerateOpeningVariations('custom')}
                                    disabled={isGeneratingOpeningVariations || !openingAiPrompt.trim()}
                                    className="text-[11.5px] font-semibold text-primary-foreground bg-primary hover:opacity-90 disabled:opacity-40 px-3 py-1.5 rounded-md flex items-center gap-1.5 transition-opacity"
                                    data-testid="btn-generate-custom-opening-variations"
                                >
                                    {isGeneratingOpeningVariations ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                                    Generate from instructions
                                </button>
                                <button
                                    type="button"
                                    onClick={() => handleGenerateOpeningVariations('auto')}
                                    disabled={isGeneratingOpeningVariations}
                                    className="text-[11.5px] font-semibold text-foreground bg-muted hover:bg-muted/80 disabled:opacity-40 px-3 py-1.5 rounded-md flex items-center gap-1.5 border border-border transition-colors"
                                    data-testid="btn-generate-auto-opening-variations"
                                >
                                    <Bot className="w-3.5 h-3.5 text-muted-foreground" />
                                    Auto-generate 5 variations
                                </button>
                            </div>
                            {openingVariationsError && (
                                <p className="text-[11px] text-destructive flex items-center gap-1">
                                    <AlertTriangle className="w-3 h-3 shrink-0" /> {openingVariationsError}
                                </p>
                            )}
                        </div>

                        {/* 5 Variation Tabs */}
                        <div className="space-y-2">
                            <div className="flex items-center justify-between gap-2 flex-wrap">
                                <div className="flex items-center gap-1" data-testid="opening-variation-tabs">
                                    {Array.from({ length: 5 }, (_, i) => (
                                        <button
                                            key={i}
                                            type="button"
                                            onClick={() => setSelectedVariationTab(i)}
                                            className={cn(
                                                "w-7 h-7 rounded-md text-[11.5px] font-semibold transition-all flex items-center justify-center",
                                                selectedVariationTab === i
                                                    ? "bg-foreground text-background shadow-xs"
                                                    : "bg-muted text-muted-foreground hover:text-foreground"
                                            )}
                                            data-testid={`tab-variation-${i + 1}`}
                                        >
                                            {i + 1}
                                        </button>
                                    ))}
                                </div>
                                <span className="text-[11px] text-muted-foreground">
                                    Variation {selectedVariationTab + 1} of 5
                                </span>
                            </div>

                            {/* Message Textarea */}
                            <div className="space-y-1">
                                <textarea
                                    value={
                                        data.dmOpeningMessageVariations[selectedVariationTab] ??
                                        (selectedVariationTab === 0 ? data.dmOpeningMessage : "")
                                    }
                                    onChange={(e) => {
                                        const newText = e.target.value;
                                        const vars = [...(data.dmOpeningMessageVariations.length > 0 ? data.dmOpeningMessageVariations : [data.dmOpeningMessage])];
                                        while (vars.length <= selectedVariationTab) vars.push("");
                                        vars[selectedVariationTab] = newText;
                                        onChange({
                                            dmOpeningMessageVariations: vars,
                                            dmOpeningMessage: selectedVariationTab === 0 ? newText : data.dmOpeningMessage,
                                        });
                                    }}
                                    maxLength={1000}
                                    rows={3}
                                    placeholder="Type your opening message…"
                                    className="w-full bg-muted/40 border border-border rounded-lg p-2.5 text-[13px] text-foreground outline-none focus:border-foreground/30 focus:ring-1 focus:ring-foreground/20 resize-none transition-all"
                                    data-testid="textarea-opening-message"
                                />
                                <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                                    <span>Tip: <code className="px-1 bg-muted rounded font-mono text-[10px]">{"{username}"}</code> is replaced with their handle.</span>
                                    <span className="tabular-nums">
                                        {(
                                            data.dmOpeningMessageVariations[selectedVariationTab] ??
                                            (selectedVariationTab === 0 ? data.dmOpeningMessage : "")
                                        ).length}/1000
                                    </span>
                                </div>
                            </div>
                        </div>

                        {/* Reveal Button */}
                        <div className="p-3.5 rounded-lg border border-border bg-muted/20 space-y-2">
                            <div className="flex items-center justify-between">
                                <label className="text-[12px] font-semibold text-foreground flex items-center gap-1.5">
                                    <Eye className="w-3.5 h-3.5 text-primary" />
                                    Reveal Tap Button
                                </label>
                                <span className="text-[10px] text-muted-foreground">Quick-reply button</span>
                            </div>
                            <input
                                value={data.dmOpeningMessageButtonTitle}
                                onChange={(e) => onChange({ dmOpeningMessageButtonTitle: e.target.value })}
                                maxLength={20}
                                placeholder="Send me the link"
                                className="w-full h-8 bg-background border border-border rounded-lg px-3 text-[12.5px] text-foreground outline-none focus:border-foreground/30 transition-all"
                                data-testid="input-reveal-button-title"
                            />
                            <p className="text-[11px] text-muted-foreground">
                                Max 20 chars (Instagram limit). They tap this to unlock your responses, confirming real interest. Leave empty to deliver responses immediately.
                            </p>
                        </div>
                    </div>
                </div>
            )}

            {/* ── SECTION B: RESPONSES LIST ── */}
            <div className="space-y-4" data-testid="section-responses-list">
                <div className="flex items-center justify-between">
                    <div>
                        <h4 className="text-[13.5px] font-semibold text-foreground">
                            DM Responses ({data.dmResponses.length}/{MAX_DM_RESPONSES})
                        </h4>
                        <p className="text-[11.5px] text-muted-foreground">
                            Delivered when the user taps your reveal button (or immediately if opening message is off)
                        </p>
                    </div>

                    <div className="flex items-center gap-1.5">
                        <button
                            type="button"
                            onClick={() => setShowAiResponseDraft(!showAiResponseDraft)}
                            className="text-[12px] font-semibold text-primary bg-primary/10 hover:bg-primary/20 px-2.5 py-1.5 rounded-lg flex items-center gap-1 transition-colors"
                            data-testid="btn-toggle-ai-draft"
                        >
                            <Sparkles className="w-3.5 h-3.5" />
                            AI Assist
                        </button>
                    </div>
                </div>

                {/* AI Response Drafting Drawer */}
                <AnimatePresence>
                    {showAiResponseDraft && (
                        <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            className="overflow-hidden"
                        >
                            <div className="p-3.5 rounded-xl border border-primary/25 bg-primary/5 space-y-2.5">
                                <label className="text-[12px] font-semibold text-primary flex items-center gap-1.5">
                                    <Sparkles className="w-3.5 h-3.5" /> What should this response message deliver?
                                </label>
                                <textarea
                                    value={responseAiPrompt}
                                    onChange={(e) => setResponseAiPrompt(e.target.value)}
                                    rows={2}
                                    maxLength={400}
                                    placeholder="e.g. Deliver our keto meal prep guide with a direct link button and tips..."
                                    className="w-full bg-background border border-border rounded-lg p-2.5 text-[12.5px] text-foreground outline-none focus:border-primary/40 resize-none"
                                />
                                <div className="flex items-center gap-2">
                                    <button
                                        type="button"
                                        onClick={() => handleGenerateResponseDraft('custom')}
                                        disabled={isGeneratingResponseDraft || !responseAiPrompt.trim()}
                                        className="text-[11.5px] font-semibold text-primary-foreground bg-primary hover:opacity-90 disabled:opacity-40 px-3 py-1.5 rounded-md flex items-center gap-1.5"
                                    >
                                        {isGeneratingResponseDraft ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                                        Generate draft
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => handleGenerateResponseDraft('auto')}
                                        disabled={isGeneratingResponseDraft}
                                        className="text-[11.5px] font-semibold text-foreground bg-muted hover:bg-muted/80 disabled:opacity-40 px-3 py-1.5 rounded-md flex items-center gap-1.5 border border-border"
                                    >
                                        <Bot className="w-3.5 h-3.5 text-muted-foreground" />
                                        Auto-draft
                                    </button>
                                </div>
                                {responseDraftError && (
                                    <p className="text-[11px] text-destructive">{responseDraftError}</p>
                                )}
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* Empty State */}
                {data.dmResponses.length === 0 && (
                    <div className="p-6 rounded-xl border border-dashed border-border text-center space-y-3 bg-muted/20" data-testid="empty-responses-banner">
                        <p className="text-[13px] text-muted-foreground">
                            No sequential responses configured yet. Add a text or card message with your link below.
                        </p>
                        <div className="flex items-center justify-center gap-2">
                            <button
                                type="button"
                                onClick={() => addResponse("text")}
                                className="inline-flex items-center gap-1.5 text-[12px] font-semibold bg-primary text-primary-foreground px-3 py-1.5 rounded-lg hover:opacity-90 transition-opacity"
                                data-testid="btn-add-first-text-response"
                            >
                                <Plus className="w-3.5 h-3.5" /> Add text message
                            </button>
                            <button
                                type="button"
                                onClick={() => addResponse("card")}
                                className="inline-flex items-center gap-1.5 text-[12px] font-semibold bg-muted hover:bg-muted/80 text-foreground px-3 py-1.5 rounded-lg border border-border transition-colors"
                                data-testid="btn-add-first-card-response"
                            >
                                <Plus className="w-3.5 h-3.5" /> Add card message
                            </button>
                        </div>
                    </div>
                )}

                {/* Response Blocks */}
                {data.dmResponses.map((res, idx) => (
                    <ResponseEditorCard
                        key={res.id}
                        res={res}
                        index={idx}
                        onUpdate={(patch) => updateResponse(idx, patch)}
                        onDelete={() => deleteResponse(idx)}
                    />
                ))}

                {/* Add More Responses Actions */}
                {data.dmResponses.length > 0 && canAddMoreResponses && (
                    <div className="flex items-center gap-2 pt-1" data-testid="add-more-responses-actions">
                        <button
                            type="button"
                            onClick={() => addResponse("text")}
                            className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-primary bg-primary/10 hover:bg-primary/20 px-3 py-1.5 rounded-lg transition-colors"
                            data-testid="btn-add-text-response"
                        >
                            <Plus className="w-3.5 h-3.5" /> Add text message
                        </button>
                        <button
                            type="button"
                            onClick={() => addResponse("card")}
                            className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-foreground bg-muted hover:bg-muted/80 px-3 py-1.5 rounded-lg border border-border transition-colors"
                            data-testid="btn-add-card-response"
                        >
                            <Plus className="w-3.5 h-3.5" /> Add card message
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// RESPONSE CARD COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

function ResponseEditorCard({
    res,
    index,
    onUpdate,
    onDelete,
}: {
    res: DMResponse;
    index: number;
    onUpdate: (patch: Partial<DMResponse>) => void;
    onDelete: () => void;
}) {
    const isCard = res.type === "card";

    return (
        <div className="rounded-xl border border-border bg-card overflow-hidden shadow-xs" data-testid={`response-card-${index}`}>
            {/* Header */}
            <div className="px-4 py-2.5 bg-muted/40 border-b border-border flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full bg-primary/20 text-primary flex items-center justify-center text-[11px] font-bold">
                        {index + 1}
                    </span>
                    <span className="text-[12.5px] font-semibold text-foreground">
                        {isCard ? "Card message (image + buttons)" : "Text message with link"}
                    </span>
                </div>
                <button
                    type="button"
                    onClick={onDelete}
                    className="p-1.5 text-muted-foreground hover:text-destructive rounded-md transition-colors"
                    aria-label={`Delete response ${index + 1}`}
                    data-testid={`btn-delete-response-${index}`}
                >
                    <Trash2 className="w-3.5 h-3.5" />
                </button>
            </div>

            <div className="p-4 space-y-3.5">
                {isCard ? (
                    <CardMessageEditor res={res} onUpdate={onUpdate} />
                ) : (
                    <TextMessageEditor res={res} onUpdate={onUpdate} />
                )}
            </div>
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// TEXT MESSAGE EDITOR (WITH MULTI-LINK BUTTONS SUPPORT)
// ─────────────────────────────────────────────────────────────────────────────

function TextMessageEditor({
    res,
    onUpdate,
}: {
    res: DMResponse;
    onUpdate: (patch: Partial<DMResponse>) => void;
}) {
    // Collect active links from buttons array or legacy buttonTitle/buttonLink
    const existingButtons: CardButton[] =
        res.buttons && res.buttons.length > 0
            ? res.buttons
            : res.buttonLink
            ? [{ id: "legacy-1", title: res.buttonTitle || "Open link", link: res.buttonLink }]
            : [];

    const [isAddingLink, setIsAddingLink] = useState(false);
    const [newTitle, setNewTitle] = useState("");
    const [newLink, setNewLink] = useState("");

    const updateAllButtons = (newButtons: CardButton[]) => {
        onUpdate({
            buttons: newButtons,
            // Keep legacy single-button fields in sync for backward compatibility
            buttonTitle: newButtons[0]?.title ?? "",
            buttonLink: newButtons[0]?.link ?? "",
        });
    };

    const handleSaveNewLink = () => {
        if (!newLink.trim()) return;
        const button: CardButton = {
            id: randomId(),
            title: newTitle.trim().slice(0, 20) || "Open link",
            link: newLink.trim().startsWith("http") ? newLink.trim() : `https://${newLink.trim()}`,
        };
        const updated = [...existingButtons, button];
        updateAllButtons(updated);
        setNewTitle("");
        setNewLink("");
        setIsAddingLink(false);
    };

    const handleRemoveButton = (id: string) => {
        const updated = existingButtons.filter((b) => b.id !== id);
        updateAllButtons(updated);
    };

    const handleUpdateButton = (id: string, patch: Partial<CardButton>) => {
        const updated = existingButtons.map((b) => (b.id === id ? { ...b, ...patch } : b));
        updateAllButtons(updated);
    };

    const canAddAnotherLink = existingButtons.length < MAX_BUTTONS_PER_MESSAGE;

    return (
        <div className="space-y-3">
            {/* Textarea */}
            <div className="space-y-1">
                <textarea
                    value={res.content}
                    onChange={(e) => onUpdate({ content: e.target.value })}
                    maxLength={1000}
                    rows={3}
                    placeholder="Type your direct message content…"
                    className="w-full bg-muted/40 border border-border rounded-lg p-2.5 text-[13px] text-foreground outline-none focus:border-foreground/30 focus:ring-1 focus:ring-foreground/20 resize-none transition-all"
                    data-testid="textarea-response-content"
                />
                <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                    <span>Supports <code className="px-1 bg-muted rounded font-mono text-[10px]">{"{username}"}</code> personalization.</span>
                    <span className="tabular-nums">{res.content.length}/1000</span>
                </div>
            </div>

            {/* ── LINK BUTTONS SECTION ── */}
            <div className="space-y-2 pt-1">
                <div className="flex items-center justify-between">
                    <label className="text-[12px] font-semibold text-foreground flex items-center gap-1.5">
                        <LinkIcon className="w-3.5 h-3.5 text-primary" />
                        Attached Link Buttons ({existingButtons.length}/{MAX_BUTTONS_PER_MESSAGE})
                    </label>
                    {existingButtons.length > 0 && (
                        <span className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full flex items-center gap-1">
                            <Check className="w-2.5 h-2.5" />
                            {existingButtons.length === 1 ? "1 link added" : `${existingButtons.length} links added`}
                        </span>
                    )}
                </div>

                {/* Configured Link Items */}
                {existingButtons.length > 0 && (
                    <div className="space-y-2" data-testid="configured-links-list">
                        {existingButtons.map((btn, idx) => (
                            <div
                                key={btn.id}
                                className="p-2.5 rounded-lg border border-border bg-muted/30 flex flex-col sm:flex-row items-stretch sm:items-center gap-2"
                                data-testid={`link-item-${idx}`}
                            >
                                <div className="flex items-center gap-1.5 shrink-0 text-muted-foreground">
                                    <ExternalLink className="w-3.5 h-3.5" />
                                    <span className="text-[11px] font-medium">Link {idx + 1}:</span>
                                </div>
                                <input
                                    value={btn.title}
                                    onChange={(e) => handleUpdateButton(btn.id, { title: e.target.value.slice(0, 20) })}
                                    maxLength={20}
                                    placeholder="Button label"
                                    className="sm:w-36 h-8 bg-background border border-border rounded-md px-2.5 text-[12px] text-foreground outline-none focus:border-foreground/30"
                                    data-testid={`link-title-input-${idx}`}
                                />
                                <input
                                    value={btn.link}
                                    onChange={(e) => handleUpdateButton(btn.id, { link: e.target.value })}
                                    placeholder="https://your-site.com"
                                    className="flex-1 h-8 bg-background border border-border rounded-md px-2.5 text-[12px] text-foreground outline-none focus:border-foreground/30 font-mono text-[11.5px]"
                                    data-testid={`link-url-input-${idx}`}
                                />
                                <button
                                    type="button"
                                    onClick={() => handleRemoveButton(btn.id)}
                                    className="p-1.5 text-muted-foreground hover:text-destructive rounded-md shrink-0 self-end sm:self-center"
                                    aria-label="Remove link"
                                    data-testid={`btn-remove-link-${idx}`}
                                >
                                    <X className="w-3.5 h-3.5" />
                                </button>
                            </div>
                        ))}
                    </div>
                )}

                {/* Form to add a new link */}
                <AnimatePresence>
                    {isAddingLink && (
                        <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: "auto" }}
                            exit={{ opacity: 0, height: 0 }}
                            className="overflow-hidden"
                        >
                            <div className="p-3 rounded-lg border border-primary/20 bg-primary/5 space-y-2.5">
                                <p className="text-[11.5px] font-semibold text-primary">New Link Button</p>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                    <input
                                        value={newTitle}
                                        onChange={(e) => setNewTitle(e.target.value.slice(0, 20))}
                                        maxLength={20}
                                        placeholder="Label (e.g. Download Guide)"
                                        className="h-8 bg-background border border-border rounded-md px-2.5 text-[12px] text-foreground outline-none focus:border-primary/40"
                                        data-testid="input-new-link-title"
                                    />
                                    <input
                                        value={newLink}
                                        onChange={(e) => setNewLink(e.target.value)}
                                        placeholder="https://your-link.com"
                                        className="h-8 bg-background border border-border rounded-md px-2.5 text-[12px] text-foreground outline-none focus:border-primary/40"
                                        data-testid="input-new-link-url"
                                    />
                                </div>
                                <div className="flex items-center gap-2">
                                    <button
                                        type="button"
                                        onClick={handleSaveNewLink}
                                        disabled={!newLink.trim()}
                                        className="text-[11.5px] font-semibold text-primary-foreground bg-primary hover:opacity-90 disabled:opacity-40 px-3 py-1.5 rounded-md"
                                        data-testid="btn-save-new-link"
                                    >
                                        Save link
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setIsAddingLink(false)}
                                        className="text-[11.5px] font-medium text-muted-foreground hover:text-foreground px-2.5 py-1.5"
                                        data-testid="btn-cancel-new-link"
                                    >
                                        Cancel
                                    </button>
                                </div>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* Add Link / Add Another Link Action */}
                {!isAddingLink && (
                    <div>
                        {canAddAnotherLink ? (
                            <button
                                type="button"
                                onClick={() => setIsAddingLink(true)}
                                className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-primary hover:opacity-80 transition-opacity"
                                data-testid={existingButtons.length === 0 ? "btn-add-link" : "btn-add-another-link"}
                            >
                                <Plus className="w-3.5 h-3.5" />
                                {existingButtons.length === 0 ? "Add link button" : "Add another link"}
                            </button>
                        ) : (
                            <p className="text-[11px] text-muted-foreground bg-muted/40 px-2.5 py-1.5 rounded-md inline-block">
                                Maximum 3 links reached (Instagram limit for button templates).
                            </p>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// CARD MESSAGE EDITOR (IMAGE + TITLE + SUBTITLE + UP TO 3 BUTTONS)
// ─────────────────────────────────────────────────────────────────────────────

function CardMessageEditor({
    res,
    onUpdate,
}: {
    res: DMResponse;
    onUpdate: (patch: Partial<DMResponse>) => void;
}) {
    const [sizeError, setSizeError] = useState("");
    const buttons = res.cardButtons ?? [];

    const handleFile = (file: File | undefined) => {
        setSizeError("");
        if (!file) return;
        if (file.size > MAX_IMAGE_BYTES) {
            setSizeError("Image must be under 2 MB.");
            return;
        }
        const reader = new FileReader();
        reader.onload = (ev) => onUpdate({ cardImage: ev.target?.result as string });
        reader.readAsDataURL(file);
    };

    const addBtn = () => {
        if (buttons.length >= MAX_BUTTONS_PER_MESSAGE) return;
        onUpdate({ cardButtons: [...buttons, { id: randomId(), title: "Learn more", link: "https://" }] });
    };

    const updateBtn = (id: string, patch: Partial<CardButton>) => {
        onUpdate({ cardButtons: buttons.map((b) => (b.id === id ? { ...b, ...patch } : b)) });
    };

    const removeBtn = (id: string) => {
        onUpdate({ cardButtons: buttons.filter((b) => b.id !== id) });
    };

    return (
        <div className="space-y-3.5">
            {/* Image Upload Area */}
            <div className="border border-dashed border-border rounded-lg overflow-hidden bg-muted/20">
                {res.cardImage ? (
                    <div className="relative">
                        <img src={res.cardImage} className="w-full h-36 object-cover" alt="card" />
                        <button
                            type="button"
                            onClick={() => onUpdate({ cardImage: "" })}
                            className="absolute top-2 right-2 bg-black/70 hover:bg-black text-white rounded-full p-1"
                        >
                            <X className="w-3.5 h-3.5" />
                        </button>
                    </div>
                ) : (
                    <label className="flex flex-col items-center justify-center h-28 cursor-pointer hover:bg-muted/40 transition-colors gap-1.5 p-4 text-center">
                        <ImageIcon className="w-6 h-6 text-muted-foreground/50" />
                        <span className="text-[12.5px] text-muted-foreground font-medium">Upload card image</span>
                        <span className="text-[10px] text-muted-foreground/60">Max 2 MB · JPG, PNG, WebP</span>
                        <input
                            type="file"
                            accept="image/jpeg,image/png,image/webp"
                            className="hidden"
                            onChange={(e) => handleFile(e.target.files?.[0])}
                        />
                    </label>
                )}
            </div>
            {sizeError && <p className="text-[12px] text-destructive font-medium">{sizeError}</p>}

            {/* Title & Subtitle */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div className="space-y-1">
                    <label className="text-[11.5px] font-semibold text-foreground">Card Title</label>
                    <input
                        value={res.cardTitle ?? ""}
                        onChange={(e) => onUpdate({ cardTitle: e.target.value.slice(0, 80) })}
                        maxLength={80}
                        placeholder="e.g. Complete Guide"
                        className="w-full h-8 bg-muted/40 border border-border rounded-lg px-2.5 text-[12.5px] text-foreground outline-none focus:border-foreground/30"
                    />
                </div>
                <div className="space-y-1">
                    <label className="text-[11.5px] font-semibold text-foreground">Subtitle</label>
                    <input
                        value={res.cardSubtitle ?? ""}
                        onChange={(e) => onUpdate({ cardSubtitle: e.target.value.slice(0, 80) })}
                        maxLength={80}
                        placeholder="Short description"
                        className="w-full h-8 bg-muted/40 border border-border rounded-lg px-2.5 text-[12.5px] text-foreground outline-none focus:border-foreground/30"
                    />
                </div>
            </div>

            {/* Card Buttons */}
            <div className="space-y-2">
                <div className="flex items-center justify-between">
                    <label className="text-[12px] font-semibold text-foreground">
                        Card Buttons ({buttons.length}/{MAX_BUTTONS_PER_MESSAGE})
                    </label>
                    {buttons.length < MAX_BUTTONS_PER_MESSAGE && (
                        <button
                            type="button"
                            onClick={addBtn}
                            className="text-[12px] text-primary font-semibold flex items-center gap-1 hover:opacity-80"
                            data-testid="btn-add-card-button"
                        >
                            <Plus className="w-3 h-3" /> Add button
                        </button>
                    )}
                </div>

                <div className="space-y-1.5">
                    {buttons.map((btn, idx) => (
                        <div key={btn.id} className="flex gap-1.5 items-center">
                            <input
                                value={btn.title}
                                onChange={(e) => updateBtn(btn.id, { title: e.target.value.slice(0, 20) })}
                                maxLength={20}
                                placeholder="Button label"
                                className="w-36 h-8 bg-muted/40 border border-border rounded-lg px-2.5 text-[12px] text-foreground outline-none focus:border-foreground/30"
                            />
                            <input
                                value={btn.link}
                                onChange={(e) => updateBtn(btn.id, { link: e.target.value })}
                                placeholder="https://"
                                className="flex-1 h-8 bg-muted/40 border border-border rounded-lg px-2.5 text-[12px] text-foreground outline-none focus:border-foreground/30 font-mono text-[11px]"
                            />
                            <button
                                type="button"
                                onClick={() => removeBtn(btn.id)}
                                className="p-2 text-muted-foreground hover:text-destructive shrink-0"
                            >
                                <X className="w-3.5 h-3.5" />
                            </button>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}

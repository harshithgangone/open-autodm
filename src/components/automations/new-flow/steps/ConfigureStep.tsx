"use client";
import { motion, AnimatePresence } from "framer-motion";
import { useState } from "react";
import {
    X, Trash2, Plus,
    Image as ImageIcon, ChevronDown, MessageSquare, LayoutGrid,
    Zap, AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { AutomationFlowData, DMResponse, CardButton } from "../NewAutomationModal";
import { CommentsPhone, DMConversationPhone, StoryPhone } from "./PhoneComponents";
import { MAX_DM_RESPONSES } from "@/lib/api/schemas";

interface ConfigureStepProps {
    data: AutomationFlowData;
    onUpdate: (d: Partial<AutomationFlowData>) => void;
    creatorProfilePicUrl?: string | null;
}

function randomId() { return Math.random().toString(36).slice(2, 9); }

const MAX_IMAGE_BYTES = 2 * 1024 * 1024; // 2 MB

const inputCls = "w-full text-[13px] bg-background border border-border rounded-lg px-3 py-2 outline-none focus:border-foreground/30 focus-visible:ring-2 focus-visible:ring-ring/30 transition-colors";
const textareaCls = "w-full text-[13px] bg-background border border-border rounded-lg px-3 py-2 outline-none focus:border-foreground/30 focus-visible:ring-2 focus-visible:ring-ring/30 transition-colors resize-none";

/* Per-type copy - the builder speaks the trigger's language */
const TYPE_COPY: Record<string, {
    triggerTitle: string;
    keywordModeSpecific: string;
    keywordModeAny: string;
    keywordPlaceholder: string;
    anyModeHint: string | null;
}> = {
    "comment-dm": {
        triggerTitle: "When someone comments",
        keywordModeSpecific: "Specific keywords",
        keywordModeAny: "Any comment",
        keywordPlaceholder: "Type a keyword and press Enter…",
        anyModeHint: null,
    },
    "dm-reply": {
        triggerTitle: "When someone DMs you",
        keywordModeSpecific: "Specific keywords",
        keywordModeAny: "Any message",
        keywordPlaceholder: "e.g. DIET, GUIDE, LINK…",
        anyModeHint: "Any message replies to EVERY DM you receive - including real conversations. Use specific keywords unless you're sure.",
    },
    "story-reply": {
        triggerTitle: "When someone replies to your story",
        keywordModeSpecific: "Specific keywords",
        keywordModeAny: "Any reply",
        keywordPlaceholder: "e.g. DIET, GUIDE, LINK…",
        anyModeHint: null,
    },
};

/* ─── Toggle ─── */
function Toggle({ on, onChange, disabled }: { on: boolean; onChange: () => void; disabled?: boolean }) {
    return (
        <button
            type="button"
            role="switch"
            aria-checked={on}
            onClick={onChange}
            disabled={disabled}
            className={cn(
                "relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 disabled:opacity-40 disabled:cursor-not-allowed",
                on ? "bg-secondary" : "bg-muted-foreground/25"
            )}
        >
            <span className={cn(
                "inline-block h-4 w-4 translate-y-[2px] rounded-full bg-white shadow-sm transition-transform duration-200",
                on ? "translate-x-[18px]" : "translate-x-[2px]"
            )} />
        </button>
    );
}

/* ─── Section header ─── */
function SectionHeader({ title, action }: { title: string; action?: React.ReactNode }) {
    return (
        <div className="flex items-center gap-3">
            <span className="micro-label text-foreground/80">{title}</span>
            <div className="h-px flex-1 bg-border" />
            {action}
        </div>
    );
}

/* ─── Keyword input ─── */
function KeywordInput({ keywords, onChange, anyMode, onAnyModeChange, copy }: {
    keywords: string[];
    onChange: (kws: string[]) => void;
    anyMode: boolean;
    onAnyModeChange: (isAny: boolean) => void;
    copy: typeof TYPE_COPY[string];
}) {
    const [input, setInput] = useState("");

    const addKw = (raw: string) => {
        const trimmed = raw.trim().toUpperCase();
        if (trimmed && !keywords.includes(trimmed)) {
            onChange([...keywords, trimmed]);
        }
        setInput("");
    };

    const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === "Enter" || e.key === ",") {
            e.preventDefault();
            addKw(input);
        } else if (e.key === "Backspace" && !input && keywords.length > 0) {
            onChange(keywords.slice(0, -1));
        }
    };

    return (
        <div className="space-y-2.5">
            <div className="inline-flex items-center bg-muted rounded-lg p-0.5">
                {[
                    { label: copy.keywordModeSpecific, value: false },
                    { label: copy.keywordModeAny, value: true },
                ].map(opt => (
                    <button
                        key={String(opt.value)}
                        onClick={() => onAnyModeChange(opt.value)}
                        className={cn(
                            "h-7 px-3 rounded-[7px] text-[12px] font-medium transition-colors",
                            anyMode === opt.value
                                ? "bg-card text-foreground shadow-sm"
                                : "text-muted-foreground hover:text-foreground"
                        )}
                    >
                        {opt.label}
                    </button>
                ))}
            </div>

            {anyMode && copy.anyModeHint && (
                <div className="flex items-start gap-2 text-[12px] text-amber-600 dark:text-amber-400 bg-amber-500/10 rounded-lg px-3 py-2">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                    {copy.anyModeHint}
                </div>
            )}

            {!anyMode && (
                <div>
                    <div className="flex flex-wrap gap-1.5 p-1.5 bg-background border border-border rounded-lg min-h-[40px] focus-within:border-foreground/30 transition-colors">
                        {keywords.map(kw => (
                            <span key={kw} className="inline-flex items-center gap-1 bg-primary/10 text-primary text-[11.5px] font-semibold px-2 py-1 rounded-md">
                                {kw}
                                <button onClick={() => onChange(keywords.filter(k => k !== kw))} className="opacity-60 hover:opacity-100">
                                    <X className="w-2.5 h-2.5" />
                                </button>
                            </span>
                        ))}
                        <input
                            value={input}
                            onChange={e => setInput(e.target.value)}
                            onKeyDown={onKeyDown}
                            onBlur={() => input.trim() && addKw(input)}
                            placeholder={keywords.length === 0 ? copy.keywordPlaceholder : "Add another…"}
                            className="flex-1 min-w-[110px] bg-transparent text-[13px] outline-none placeholder:text-muted-foreground/50 px-1 py-0.5"
                        />
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-1">Separate with Enter or comma. Case-insensitive, whole-word match.</p>
                </div>
            )}
        </div>
    );
}

/* ─── Card editor ─── */
function CardEditor({ res, onUpdate }: { res: DMResponse; onUpdate: (p: Partial<DMResponse>) => void }) {
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
        reader.onload = ev => onUpdate({ cardImage: ev.target?.result as string });
        reader.readAsDataURL(file);
    };

    const addBtn = () => onUpdate({ cardButtons: [...buttons, { id: randomId(), title: "Learn more", link: "" }] });
    const updateBtn = (id: string, patch: Partial<CardButton>) =>
        onUpdate({ cardButtons: buttons.map(b => b.id === id ? { ...b, ...patch } : b) });
    const removeBtn = (id: string) => onUpdate({ cardButtons: buttons.filter(b => b.id !== id) });

    return (
        <div className="space-y-3">
            <div className="border border-dashed border-border rounded-lg overflow-hidden">
                {res.cardImage ? (
                    <div className="relative">
                        <img src={res.cardImage} className="w-full h-32 object-cover" alt="card" />
                        <button onClick={() => onUpdate({ cardImage: "" })} className="absolute top-2 right-2 bg-black/60 text-white rounded-full p-1">
                            <X className="w-3 h-3" />
                        </button>
                    </div>
                ) : (
                    <label className="flex flex-col items-center justify-center h-24 cursor-pointer hover:bg-muted/40 transition-colors gap-1.5">
                        <ImageIcon className="w-5 h-5 text-muted-foreground/40" />
                        <span className="text-[12px] text-muted-foreground font-medium">Upload an image</span>
                        <span className="text-[10px] text-muted-foreground/60">Max 2 MB · JPG, PNG, WebP</span>
                        <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden"
                            onChange={e => handleFile(e.target.files?.[0])} />
                    </label>
                )}
            </div>
            {sizeError && <p className="text-[12px] text-destructive font-medium">{sizeError}</p>}

            <div>
                <label className="micro-label block mb-1">Card title</label>
                <input value={res.cardTitle ?? ""} onChange={e => onUpdate({ cardTitle: e.target.value })} maxLength={80}
                    placeholder="e.g. The Complete Creator Toolkit" className={inputCls} />
            </div>

            <div>
                <label className="micro-label block mb-1">Subtitle</label>
                <input value={res.cardSubtitle ?? ""} onChange={e => onUpdate({ cardSubtitle: e.target.value })} maxLength={80}
                    placeholder="Short description" className={inputCls} />
            </div>

            <div>
                <div className="flex items-center justify-between mb-1.5">
                    <label className="micro-label">Buttons (max 3)</label>
                    {buttons.length < 3 && (
                        <button onClick={addBtn} className="text-[12px] text-primary font-semibold flex items-center gap-1 hover:opacity-80">
                            <Plus className="w-3 h-3" /> Add
                        </button>
                    )}
                </div>
                <div className="space-y-1.5">
                    {buttons.map(btn => (
                        <div key={btn.id} className="flex gap-1.5">
                            <input value={btn.title} onChange={e => updateBtn(btn.id, { title: e.target.value })} placeholder="Button label" className={inputCls} />
                            <input value={btn.link} onChange={e => updateBtn(btn.id, { link: e.target.value })} placeholder="https://" className={inputCls} />
                            <button onClick={() => removeBtn(btn.id)} className="p-2 text-muted-foreground hover:text-destructive shrink-0">
                                <X className="w-3.5 h-3.5" />
                            </button>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}

/* ─── Text response editor ─── */
function TextEditor({ res, onUpdate }: { res: DMResponse; onUpdate: (p: Partial<DMResponse>) => void }) {
    const [showBtn, setShowBtn] = useState(!!(res.buttonTitle || res.buttonLink));

    return (
        <div className="space-y-2.5">
            <div className="relative">
                <textarea
                    value={res.content}
                    onChange={e => onUpdate({ content: e.target.value })}
                    maxLength={1000}
                    rows={3}
                    placeholder="Type your message…"
                    className={textareaCls}
                />
                <span className="absolute bottom-2 right-3 text-[10px] text-muted-foreground tabular-nums">{res.content.length}/1000</span>
            </div>

            {showBtn ? (
                <div className="rounded-lg border border-border overflow-hidden">
                    <div className="px-3 py-1.5 bg-muted/50 border-b border-border flex items-center justify-between">
                        <span className="micro-label">Link button</span>
                        <button onClick={() => { setShowBtn(false); onUpdate({ buttonTitle: "", buttonLink: "" }); }}
                            className="text-muted-foreground hover:text-destructive">
                            <X className="w-3 h-3" />
                        </button>
                    </div>
                    <div className="p-2.5 space-y-1.5">
                        <input value={res.buttonTitle ?? ""} onChange={e => onUpdate({ buttonTitle: e.target.value })}
                            placeholder="Button label (e.g. Get the guide)" className={inputCls} />
                        <input value={res.buttonLink ?? ""} onChange={e => onUpdate({ buttonLink: e.target.value })}
                            placeholder="https://your-link.com" className={inputCls} />
                        <p className="text-[10px] text-muted-foreground">Delivered as a tappable button inside the DM.</p>
                    </div>
                </div>
            ) : (
                <button onClick={() => setShowBtn(true)}
                    className="flex items-center gap-1 text-[12px] font-semibold text-primary hover:opacity-80 transition-opacity">
                    <Plus className="w-3 h-3" /> Add link button
                </button>
            )}
        </div>
    );
}

/* ─── Response block ─── */
function ResponseBlock({ res, idx, onUpdate, onDelete }: {
    res: DMResponse;
    idx: number;
    onUpdate: (p: Partial<DMResponse>) => void;
    onDelete: () => void;
}) {
    const [open, setOpen] = useState(true);
    const typeLabel = res.type === "card" ? "Card message" : "Text message";

    return (
        <div className="border border-border rounded-lg overflow-hidden">
            <div className="flex items-center justify-between px-3 h-9 bg-muted/50 border-b border-border">
                <div className="flex items-center gap-2">
                    <span className="w-4.5 h-4.5 w-[18px] h-[18px] rounded-full bg-primary/10 text-primary text-[10px] font-bold flex items-center justify-center shrink-0">{idx + 1}</span>
                    <span className="text-[12px] font-semibold text-foreground">{typeLabel}</span>
                </div>
                <div className="flex items-center">
                    <button onClick={() => setOpen(o => !o)} className="p-1.5 text-muted-foreground hover:text-foreground rounded-md transition-colors">
                        <ChevronDown className={cn("w-3.5 h-3.5 transition-transform", open && "rotate-180")} />
                    </button>
                    <button onClick={onDelete} className="p-1.5 text-muted-foreground hover:text-destructive rounded-md transition-colors">
                        <Trash2 className="w-3.5 h-3.5" />
                    </button>
                </div>
            </div>
            <AnimatePresence>
                {open && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.18 }}
                        className="overflow-hidden"
                    >
                        <div className="p-3">
                            {res.type === "card"
                                ? <CardEditor res={res} onUpdate={onUpdate} />
                                : <TextEditor res={res} onUpdate={onUpdate} />
                            }
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}

/* ═══════════════════════ Main ConfigureStep ═══════════════════════ */
export function ConfigureStep({ data, onUpdate, creatorProfilePicUrl }: ConfigureStepProps) {
    const [phonePhase, setPhonePhase] = useState<"initial" | "clicked" | "followed">("initial");
    const [repliesSaved, setRepliesSaved] = useState(data.customReplies.length > 0);
    const [commentInput, setCommentInput] = useState("");

    const flowType = data.type ?? "comment-dm";
    const isComment = flowType === "comment-dm";
    const isStory = flowType === "story-reply";
    const copy = TYPE_COPY[flowType] ?? TYPE_COPY["comment-dm"]!;

    const isAnyMode = data.keywordsAnyMode ?? data.keywords.length === 0;
    const previewKeywords = isAnyMode ? ["😍", "🔥✨", "❤️🙌"] : data.keywords.slice(0, 3);
    const previewTriggerText = isAnyMode ? (isStory ? "Love this! 🔥" : "Hey! 👋") : (data.keywords[0] ?? "DIET");

    const addResponse = (type: "text" | "card") => {
        onUpdate({
            dmResponses: [
                ...data.dmResponses,
                {
                    id: randomId(),
                    type,
                    content: "",
                    ...(type === "card" ? { cardTitle: "", cardSubtitle: "", cardButtons: [] } : {}),
                },
            ],
        });
    };

    const updateResponse = (idx: number, patch: Partial<DMResponse>) => {
        const updated = [...data.dmResponses];
        updated[idx] = { ...updated[idx]!, ...patch } as DMResponse;
        onUpdate({ dmResponses: updated });
    };

    const deleteResponse = (idx: number) => {
        onUpdate({ dmResponses: data.dmResponses.filter((_, i) => i !== idx) });
    };

    const addCommentReply = () => {
        const t = commentInput.trim();
        if (!t) return;
        onUpdate({ customReplies: [...data.customReplies, t] });
        setCommentInput("");
    };

    const canAddMoreResponses =
        data.dmResponses.length < MAX_DM_RESPONSES &&
        (data.dmOpeningMessageEnabled ? true : data.dmResponses.length < 1);

    return (
        <div className="flex h-full overflow-hidden">
            {/* ── Left - form ── */}
            <div className="flex-1 min-w-0 overflow-y-auto p-5 space-y-6 custom-scrollbar">

                {/* Name */}
                <section className="space-y-2">
                    <SectionHeader title="Name" />
                    <input
                        value={data.name}
                        onChange={e => onUpdate({ name: e.target.value })}
                        placeholder="e.g. Diet guide funnel"
                        className={inputCls}
                    />
                </section>

                {/* Post context - comment automations only */}
                {isComment && (
                    <>
                        {data.postThumbnailUrl ? (
                            <div className="flex items-center gap-2.5 p-2.5 bg-muted/40 rounded-lg">
                                <img src={data.postThumbnailUrl} alt="post" className="w-9 h-9 object-cover rounded-md shrink-0" />
                                <div className="min-w-0">
                                    <p className="micro-label">Selected post</p>
                                    <p className="text-[12px] text-foreground truncate">
                                        {data.postCaption ? data.postCaption.slice(0, 70) : "No caption"}
                                    </p>
                                </div>
                            </div>
                        ) : (
                            <div className="flex items-center gap-2 px-3 py-2 bg-muted/40 rounded-lg">
                                <Zap className="w-3.5 h-3.5 text-muted-foreground" />
                                <span className="text-[12px] font-medium text-muted-foreground">
                                    {data.postId && data.postId !== "all" ? "Specific post selected" : "Triggers on all posts"}
                                </span>
                            </div>
                        )}
                    </>
                )}

                {/* Trigger */}
                <section className="space-y-2.5">
                    <SectionHeader title={copy.triggerTitle} />
                    <KeywordInput
                        keywords={data.keywords}
                        onChange={kws => onUpdate({ keywords: kws })}
                        anyMode={isAnyMode}
                        onAnyModeChange={isAny => onUpdate({ keywordsAnyMode: isAny })}
                        copy={copy}
                    />
                </section>

                {/* Public comment replies - comment automations only */}
                {isComment && (
                    <section className="space-y-2.5">
                        <SectionHeader title="Public comment reply" />
                        <p className="text-[12px] text-muted-foreground">
                            A random line from this list is posted publicly under the trigger comment.
                        </p>

                        <div className="space-y-1.5">
                            {data.customReplies.map((r, i) => (
                                <div key={i} className="flex items-center gap-1.5 group">
                                    <span className="flex-1 text-[13px] text-foreground bg-muted/40 rounded-lg px-3 py-1.5 truncate">{r}</span>
                                    <button
                                        onClick={() => onUpdate({ customReplies: data.customReplies.filter((_, j) => j !== i) })}
                                        className="opacity-0 group-hover:opacity-100 p-1.5 text-muted-foreground hover:text-destructive transition-all shrink-0"
                                    >
                                        <X className="w-3 h-3" />
                                    </button>
                                </div>
                            ))}
                        </div>

                        <div className="flex gap-1.5">
                            <input
                                value={commentInput}
                                onChange={e => setCommentInput(e.target.value)}
                                onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addCommentReply(); } }}
                                placeholder="Type a reply and press Enter…"
                                className={inputCls}
                            />
                            <button
                                onClick={() => { addCommentReply(); setRepliesSaved(true); }}
                                className="w-9 h-9 flex items-center justify-center bg-muted rounded-lg hover:bg-muted/70 transition-colors shrink-0"
                            >
                                <Plus className="w-3.5 h-3.5" />
                            </button>
                        </div>
                    </section>
                )}

                {/* Auto DM */}
                <section className="space-y-3">
                    <SectionHeader
                        title="Auto DM"
                        action={<Toggle on={data.isAutoDmEnabled} onChange={() => onUpdate({ isAutoDmEnabled: !data.isAutoDmEnabled })} />}
                    />

                    <AnimatePresence>
                        {data.isAutoDmEnabled && (
                            <motion.div
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: "auto" }}
                                exit={{ opacity: 0, height: 0 }}
                                transition={{ duration: 0.18 }}
                                className="overflow-hidden space-y-3"
                            >
                                {/* Opening message */}
                                <div className="border border-border rounded-lg overflow-hidden">
                                    <div className="flex items-center justify-between px-3 py-2.5 bg-muted/50 border-b border-border">
                                        <div>
                                            <p className="text-[12.5px] font-semibold text-foreground">Opening message</p>
                                            <p className="text-[11px] text-muted-foreground">The first DM, sent automatically on trigger</p>
                                        </div>
                                        <Toggle
                                            on={data.dmOpeningMessageEnabled}
                                            onChange={() => onUpdate({ dmOpeningMessageEnabled: !data.dmOpeningMessageEnabled })}
                                        />
                                    </div>
                                    <AnimatePresence>
                                        {data.dmOpeningMessageEnabled && (
                                            <motion.div
                                                initial={{ height: 0, opacity: 0 }}
                                                animate={{ height: "auto", opacity: 1 }}
                                                exit={{ height: 0, opacity: 0 }}
                                                transition={{ duration: 0.18 }}
                                                className="overflow-hidden"
                                            >
                                                <div className="p-3 space-y-2.5">
                                                    <div className="relative">
                                                        <textarea
                                                            value={data.dmOpeningMessage}
                                                            onChange={e => onUpdate({ dmOpeningMessage: e.target.value })}
                                                            rows={4}
                                                            maxLength={1000}
                                                            placeholder="Hey! Thanks so much for stopping by…"
                                                            className={textareaCls}
                                                        />
                                                        <span className="absolute bottom-2 right-3 text-[10px] text-muted-foreground tabular-nums">{data.dmOpeningMessage.length}/1000</span>
                                                    </div>
                                                    {isComment && (
                                                        <p className="text-[10px] text-muted-foreground">
                                                            Tip: <code className="font-mono bg-muted px-1 rounded">{"{username}"}</code> becomes the commenter&apos;s @handle.
                                                        </p>
                                                    )}

                                                    <div className="rounded-lg border border-border p-2.5 space-y-1.5">
                                                        <p className="micro-label">Reveal button</p>
                                                        <p className="text-[11px] text-muted-foreground">They tap this to receive your responses - the tap confirms real interest.</p>
                                                        <input
                                                            value={data.dmOpeningMessageButtonTitle}
                                                            onChange={e => onUpdate({ dmOpeningMessageButtonTitle: e.target.value })}
                                                            maxLength={20}
                                                            placeholder="Send me the link"
                                                            className={inputCls}
                                                        />
                                                        <p className="text-[10px] text-muted-foreground">Max 20 characters (Instagram limit). Leave empty to send responses immediately.</p>
                                                    </div>
                                                </div>
                                            </motion.div>
                                        )}
                                    </AnimatePresence>
                                </div>

                                {/* Require follow */}
                                <div className="border border-border rounded-lg overflow-hidden">
                                    <div className="flex items-center justify-between px-3 py-2.5 bg-muted/50 border-b border-border">
                                        <div>
                                            <p className="text-[12.5px] font-semibold text-foreground">Require follow</p>
                                            <p className="text-[11px] text-muted-foreground">Deliver only after Instagram confirms they follow you</p>
                                        </div>
                                        <Toggle on={data.askToFollowEnabled} onChange={() => onUpdate({ askToFollowEnabled: !data.askToFollowEnabled })} />
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
                                                <div className="p-3 space-y-2.5">
                                                    <div>
                                                        <label className="micro-label block mb-1">&ldquo;Not following&rdquo; message</label>
                                                        <textarea
                                                            value={data.askToFollowMessage}
                                                            onChange={e => onUpdate({ askToFollowMessage: e.target.value })}
                                                            rows={2}
                                                            maxLength={80}
                                                            placeholder="Hey! It seems you're not following me yet…"
                                                            className={textareaCls}
                                                        />
                                                        <p className="text-[10px] text-muted-foreground mt-0.5">Max 80 chars (card title limit).</p>
                                                    </div>

                                                    <div className="grid grid-cols-2 gap-2">
                                                        <div>
                                                            <label className="micro-label block mb-1">Profile button</label>
                                                            <input
                                                                value={data.askToFollowVisitProfileButton}
                                                                onChange={e => onUpdate({ askToFollowVisitProfileButton: e.target.value })}
                                                                maxLength={20}
                                                                placeholder="Visit Profile"
                                                                className={inputCls}
                                                            />
                                                        </div>
                                                        <div>
                                                            <label className="micro-label block mb-1">Confirm button</label>
                                                            <input
                                                                value={data.askToFollowConfirmButton}
                                                                onChange={e => onUpdate({ askToFollowConfirmButton: e.target.value })}
                                                                maxLength={20}
                                                                placeholder="I'm following ✅"
                                                                className={inputCls}
                                                            />
                                                        </div>
                                                    </div>
                                                    <p className="text-[10px] text-muted-foreground">
                                                        Follow status is really checked via Instagram&apos;s profile API - followers skip this card,
                                                        and the confirm tap re-checks before delivering.
                                                    </p>
                                                </div>
                                            </motion.div>
                                        )}
                                    </AnimatePresence>
                                </div>

                                {/* Responses */}
                                <div className="space-y-2.5">
                                    <SectionHeader title="Responses" />

                                    {data.dmResponses.length >= MAX_DM_RESPONSES && (
                                        <div className="text-[12px] text-muted-foreground bg-muted/50 rounded-lg px-3 py-2">
                                            Max {MAX_DM_RESPONSES} responses per flow - each one is a separate Instagram send, and short flows keep your account safe and your audience reading.
                                        </div>
                                    )}

                                    {!data.dmOpeningMessageEnabled && data.dmResponses.length >= 1 && (
                                        <div className="text-[12px] text-amber-600 dark:text-amber-400 bg-amber-500/10 rounded-lg px-3 py-2 font-medium">
                                            Opening message is off - only one response is sent.
                                        </div>
                                    )}

                                    {data.dmResponses.map((res, idx) => (
                                        <ResponseBlock
                                            key={res.id}
                                            res={res}
                                            idx={idx}
                                            onUpdate={p => updateResponse(idx, p)}
                                            onDelete={() => deleteResponse(idx)}
                                        />
                                    ))}

                                    <div className="flex gap-1.5">
                                        <button
                                            onClick={() => canAddMoreResponses && addResponse("text")}
                                            disabled={!canAddMoreResponses}
                                            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-[12px] font-medium border border-border text-foreground hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                                        >
                                            <MessageSquare className="w-3.5 h-3.5" /> Text message
                                        </button>
                                        <button
                                            onClick={() => canAddMoreResponses && addResponse("card")}
                                            disabled={!canAddMoreResponses}
                                            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-[12px] font-medium border border-border text-foreground hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                                        >
                                            <LayoutGrid className="w-3.5 h-3.5" /> Card message
                                        </button>
                                    </div>
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </section>
            </div>

            {/* ── Right - phones ── */}
            <div className="hidden xl:flex w-[600px] shrink-0 bg-[#0a0a0b] border-l border-border overflow-hidden relative">
                <div
                    className="absolute inset-0 opacity-[0.12] pointer-events-none"
                    style={{ backgroundImage: `radial-gradient(circle at 1px 1px, #fff 1px, transparent 0)`, backgroundSize: "28px 28px" }}
                />
                <motion.div
                    initial={{ y: 24, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ type: "spring", damping: 30, stiffness: 240, delay: 0.05 }}
                    className="flex items-center justify-center gap-5 w-full h-full p-5"
                >
                    {isComment && (
                        <CommentsPhone
                            postThumbnailUrl={data.postThumbnailUrl}
                            previewComments={previewKeywords}
                            anyMode={isAnyMode}
                            repliesSaved={repliesSaved || data.customReplies.length > 0}
                            customReplies={data.customReplies}
                            creatorProfilePicUrl={creatorProfilePicUrl}
                        />
                    )}
                    {isStory && <StoryPhone keyword={previewTriggerText} />}

                    {data.isAutoDmEnabled && (
                        <DMConversationPhone
                            openingEnabled={data.dmOpeningMessageEnabled}
                            openingMessage={data.dmOpeningMessage}
                            openingBtnTitle={data.dmOpeningMessageButtonTitle}
                            askToFollowEnabled={data.askToFollowEnabled}
                            askToFollowMessage={data.askToFollowMessage}
                            askToFollowVisitBtn={data.askToFollowVisitProfileButton}
                            askToFollowConfirmBtn={data.askToFollowConfirmButton}
                            responses={data.dmResponses}
                            phase={phonePhase}
                            onPhaseChange={setPhonePhase}
                            creatorProfilePicUrl={creatorProfilePicUrl}
                            trigger={!isComment ? { kind: isStory ? "story" : "dm", text: previewTriggerText } : null}
                        />
                    )}
                </motion.div>
            </div>
        </div>
    );
}

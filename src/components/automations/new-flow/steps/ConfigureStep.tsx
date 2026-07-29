"use client";
import { motion, AnimatePresence } from "framer-motion";
import { useState } from "react";
import {
    X, Trash2, Plus,
    Image as ImageIcon, ChevronDown, MessageSquare, LayoutGrid,
    Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { AutomationFlowData, DMResponse, CardButton } from "../NewAutomationModal";
import { CommentsPhone, DMConversationPhone } from "./PhoneComponents";

interface ConfigureStepProps {
    data: AutomationFlowData;
    onUpdate: (d: Partial<AutomationFlowData>) => void;
    creatorProfilePicUrl?: string | null;
}

function randomId() { return Math.random().toString(36).slice(2, 9); }

const MAX_IMAGE_BYTES = 2 * 1024 * 1024; // 2 MB

/* ─────────── Toggle switch ─────────── */
function Toggle({ on, onChange, disabled }: { on: boolean; onChange: () => void; disabled?: boolean }) {
    return (
        <button
            type="button"
            role="switch"
            aria-checked={on}
            onClick={onChange}
            disabled={disabled}
            className={cn(
                "relative inline-flex h-[24px] w-[44px] shrink-0 cursor-pointer rounded-full transition-colors focus-visible:outline-none disabled:opacity-40 disabled:cursor-not-allowed",
                on ? "bg-emerald-500" : "bg-gray-200 dark:bg-gray-700"
            )}
        >
            <span className={cn(
                "inline-block h-[20px] w-[20px] translate-y-[2px] rounded-full bg-white shadow-sm transition-transform duration-200",
                on ? "translate-x-[22px]" : "translate-x-[2px]"
            )} />
        </button>
    );
}

/* ─────────── Keyword chip input ─────────── */
function KeywordInput({ keywords, onChange, anyMode, onAnyModeChange }: {
    keywords: string[];
    onChange: (kws: string[]) => void;
    anyMode: boolean;
    onAnyModeChange: (isAny: boolean) => void;
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
        <div className="space-y-3">
            {/* Mode toggle */}
            <div className="flex items-center gap-1 bg-muted/30 p-1 rounded-xl border border-border/50 w-fit">
                {[
                    { label: "Specific Keywords", value: false },
                    { label: "Any Comment", value: true },
                ].map(opt => (
                    <button
                        key={String(opt.value)}
                        onClick={() => onAnyModeChange(opt.value)}
                        className={cn(
                            "px-4 py-1.5 rounded-lg text-xs font-bold transition-all",
                            anyMode === opt.value
                                ? "bg-card text-foreground shadow-sm ring-1 ring-border/40"
                                : "text-muted-foreground hover:text-foreground"
                        )}
                    >
                        {opt.label}
                    </button>
                ))}
            </div>

            {!anyMode && (
                <div>
                    <div className="flex flex-wrap gap-1.5 p-2 bg-background border border-border rounded-xl min-h-[44px] focus-within:border-primary/50 transition-colors">
                        {keywords.map(kw => (
                            <span key={kw} className="inline-flex items-center gap-1 bg-primary/10 text-primary text-xs font-bold px-2 py-1 rounded-md">
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
                            placeholder={keywords.length === 0 ? "Type keyword and press Enter or comma…" : "Add another…"}
                            className="flex-1 min-w-[120px] bg-transparent text-sm outline-none placeholder:text-muted-foreground/40 py-0.5"
                        />
                    </div>
                    <p className="text-[10px] text-muted-foreground/60 mt-1">Separate keywords with comma or Enter. Case-insensitive.</p>
                </div>
            )}
        </div>
    );
}

/* ─────────── Card image editor ─────────── */
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
            {/* Image drop */}
            <div className="border-2 border-dashed border-border rounded-xl overflow-hidden">
                {res.cardImage ? (
                    <div className="relative">
                        <img src={res.cardImage} className="w-full h-36 object-cover" alt="card" />
                        <button onClick={() => onUpdate({ cardImage: "" })} className="absolute top-2 right-2 bg-black/60 text-white rounded-full p-1">
                            <X className="w-3 h-3" />
                        </button>
                    </div>
                ) : (
                    <label className="flex flex-col items-center justify-center h-32 cursor-pointer hover:bg-muted/30 transition-colors gap-2">
                        <ImageIcon className="w-7 h-7 text-muted-foreground/40" />
                        <span className="text-sm text-muted-foreground font-medium">Drop or click to upload</span>
                        <span className="text-xs text-muted-foreground/50">Max 2 MB · JPG, PNG, WebP</span>
                        <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden"
                            onChange={e => handleFile(e.target.files?.[0])} />
                    </label>
                )}
            </div>
            {sizeError && <p className="text-xs text-destructive font-medium">{sizeError}</p>}

            <div>
                <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider block mb-1">Card Title</label>
                <input value={res.cardTitle ?? ""} onChange={e => onUpdate({ cardTitle: e.target.value })} maxLength={80}
                    placeholder="e.g. The Complete Creator Toolkit"
                    className="w-full text-sm bg-background border border-border rounded-xl px-3 py-2 outline-none focus:border-primary/50 transition-colors" />
            </div>

            <div>
                <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider block mb-1">Subtitle</label>
                <input value={res.cardSubtitle ?? ""} onChange={e => onUpdate({ cardSubtitle: e.target.value })} maxLength={80}
                    placeholder="Short description"
                    className="w-full text-sm bg-background border border-border rounded-xl px-3 py-2 outline-none focus:border-primary/50 transition-colors" />
            </div>

            <div>
                <div className="flex items-center justify-between mb-2">
                    <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Buttons (max 3)</label>
                    {buttons.length < 3 && (
                        <button onClick={addBtn} className="text-xs text-primary font-bold flex items-center gap-1 hover:opacity-80">
                            <Plus className="w-3 h-3" /> Add
                        </button>
                    )}
                </div>
                <div className="space-y-2">
                    {buttons.map(btn => (
                        <div key={btn.id} className="flex gap-2">
                            <input value={btn.title} onChange={e => updateBtn(btn.id, { title: e.target.value })} placeholder="Button label"
                                className="flex-1 text-sm bg-background border border-border rounded-xl px-3 py-2 outline-none focus:border-primary/50 transition-colors" />
                            <input value={btn.link} onChange={e => updateBtn(btn.id, { link: e.target.value })} placeholder="https://"
                                className="flex-1 text-sm bg-background border border-border rounded-xl px-3 py-2 outline-none focus:border-primary/50 transition-colors" />
                            <button onClick={() => removeBtn(btn.id)} className="p-2 text-muted-foreground hover:text-destructive">
                                <X className="w-4 h-4" />
                            </button>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}

/* ─────────── Text response editor ─────────── */
function TextEditor({ res, onUpdate }: { res: DMResponse; onUpdate: (p: Partial<DMResponse>) => void }) {
    const [showBtn, setShowBtn] = useState(!!(res.buttonTitle || res.buttonLink));

    return (
        <div className="space-y-3">
            <div className="relative">
                <textarea
                    value={res.content}
                    onChange={e => onUpdate({ content: e.target.value })}
                    maxLength={1000}
                    rows={4}
                    placeholder="Type your message…"
                    className="w-full text-sm bg-background border border-border rounded-xl px-3 py-2 outline-none focus:border-primary/50 transition-colors resize-none"
                />
                <span className="absolute bottom-2 right-3 text-[10px] text-muted-foreground">{res.content.length}/1000</span>
            </div>

            {showBtn ? (
                <div className="rounded-xl border border-border overflow-hidden">
                    <div className="px-3 py-2 bg-muted/20 border-b border-border flex items-center justify-between">
                        <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">URL Button</span>
                        <button onClick={() => { setShowBtn(false); onUpdate({ buttonTitle: "", buttonLink: "" }); }}
                            className="text-muted-foreground hover:text-destructive">
                            <X className="w-3.5 h-3.5" />
                        </button>
                    </div>
                    <div className="p-3 space-y-2">
                        <input value={res.buttonTitle ?? ""} onChange={e => onUpdate({ buttonTitle: e.target.value })}
                            placeholder="Button label (e.g. Get the guide)"
                            className="w-full text-sm bg-background border border-border rounded-xl px-3 py-2 outline-none focus:border-primary/50 transition-colors" />
                        <input value={res.buttonLink ?? ""} onChange={e => onUpdate({ buttonLink: e.target.value })}
                            placeholder="https://your-link.com"
                            className="w-full text-sm bg-background border border-border rounded-xl px-3 py-2 outline-none focus:border-primary/50 transition-colors" />
                    </div>
                </div>
            ) : (
                <button onClick={() => setShowBtn(true)}
                    className="flex items-center gap-1.5 text-xs font-semibold text-primary hover:opacity-80 transition-opacity">
                    <Plus className="w-3.5 h-3.5" /> Add URL Button
                </button>
            )}
        </div>
    );
}

/* ─────────── Response block ─────────── */
function ResponseBlock({ res, idx, onUpdate, onDelete }: {
    res: DMResponse;
    idx: number;
    onUpdate: (p: Partial<DMResponse>) => void;
    onDelete: () => void;
}) {
    const [open, setOpen] = useState(true);
    const typeLabel = res.type === "card" ? "Card Message" : "Text Message";

    return (
        <div className="border border-border rounded-xl overflow-hidden">
            <div className="flex items-center justify-between px-3 py-2.5 bg-muted/20 border-b border-border">
                <div className="flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full bg-primary/10 text-primary text-[10px] font-bold flex items-center justify-center shrink-0">{idx + 1}</span>
                    <span className="text-xs font-bold text-foreground">{typeLabel}</span>
                </div>
                <div className="flex items-center gap-1">
                    <button onClick={() => setOpen(o => !o)} className="p-1.5 text-muted-foreground hover:text-foreground rounded-lg transition-colors">
                        <ChevronDown className={cn("w-3.5 h-3.5 transition-transform", open && "rotate-180")} />
                    </button>
                    <button onClick={onDelete} className="p-1.5 text-muted-foreground hover:text-destructive rounded-lg transition-colors">
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
                        transition={{ duration: 0.2 }}
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

/* ─────────── Add Response buttons (inline, no dropdown — avoids overflow clipping) ─────────── */
function AddResponseButtons({ onAdd, disabled }: { onAdd: (type: "text" | "card") => void; disabled?: boolean }) {
    return (
        <div className="flex gap-2 flex-wrap">
            <button
                onClick={() => !disabled && onAdd("text")}
                disabled={disabled}
                className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary border border-primary/30 hover:bg-primary/5 disabled:opacity-40 disabled:cursor-not-allowed px-3 py-2 rounded-xl transition-all"
            >
                <MessageSquare className="w-4 h-4" /> Text Message
            </button>
            <button
                onClick={() => !disabled && onAdd("card")}
                disabled={disabled}
                className="inline-flex items-center gap-1.5 text-sm font-semibold text-blue-500 border border-blue-500/30 hover:bg-blue-500/5 disabled:opacity-40 disabled:cursor-not-allowed px-3 py-2 rounded-xl transition-all"
            >
                <LayoutGrid className="w-4 h-4" /> Card Message
            </button>
        </div>
    );
}

/* ═══════════════════════════════════════════════════════════════════════════ */
/* Main ConfigureStep                                                          */
/* ═══════════════════════════════════════════════════════════════════════════ */
export function ConfigureStep({ data, onUpdate, creatorProfilePicUrl }: ConfigureStepProps) {
    const [phonePhase, setPhonePhase] = useState<"initial" | "clicked" | "followed">("initial");
    const [repliesSaved, setRepliesSaved] = useState(data.customReplies.length > 0);
    const [commentInput, setCommentInput] = useState("");

    const isAnyMode = data.keywordsAnyMode ?? data.keywords.length === 0;
    const previewKeywords = isAnyMode
        ? ["😍", "🔥✨", "❤️🙌"]
        : data.keywords.slice(0, 3);

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

    const canAddMoreResponses = data.dmOpeningMessageEnabled ? true : data.dmResponses.length < 1;

    return (
        <div className="flex h-full overflow-hidden">
            {/* ── Left panel — scrollable form ── */}
            <div className="flex-1 min-w-0 overflow-y-auto p-6 space-y-6 custom-scrollbar">

                {/* Post preview chip */}
                {data.postThumbnailUrl && (
                    <div className="flex items-center gap-3 p-3 bg-muted/20 border border-border/50 rounded-xl">
                        <img src={data.postThumbnailUrl} alt="post" className="w-12 h-12 object-cover rounded-lg shrink-0" />
                        <div className="min-w-0">
                            <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-0.5">Selected Post</p>
                            <p className="text-sm font-medium text-foreground line-clamp-1">
                                {data.postCaption ? data.postCaption.slice(0, 80) : "No caption"}
                            </p>
                        </div>
                    </div>
                )}
                {!data.postThumbnailUrl && data.postId && data.postId !== "all" && (
                    <div className="flex items-center gap-2 px-3 py-2 bg-primary/5 border border-primary/15 rounded-xl">
                        <Zap className="w-3.5 h-3.5 text-primary" />
                        <span className="text-xs font-bold text-primary">Specific post selected</span>
                    </div>
                )}
                {(!data.postId || data.postId === "all") && (
                    <div className="flex items-center gap-2 px-3 py-2 bg-muted/30 border border-border/50 rounded-xl">
                        <Zap className="w-3.5 h-3.5 text-muted-foreground" />
                        <span className="text-xs font-semibold text-muted-foreground">Triggering on all posts</span>
                    </div>
                )}

                {/* ── WHAT AUDIENCE COMMENTS ── */}
                <section className="space-y-3">
                    <div className="flex items-center gap-2">
                        <span className="text-[11px] font-extrabold text-foreground uppercase tracking-widest">What Audience Comments</span>
                        <div className="h-px flex-1 bg-border/50" />
                    </div>
                    <KeywordInput
                        keywords={data.keywords}
                        onChange={kws => onUpdate({ keywords: kws })}
                        anyMode={isAnyMode}
                        onAnyModeChange={isAny => onUpdate({ keywordsAnyMode: isAny })}
                    />
                </section>

                {/* ── WHAT U WANT TO REPLY ── */}
                <section className="space-y-3">
                    <div className="flex items-center gap-2">
                        <span className="text-[11px] font-extrabold text-foreground uppercase tracking-widest">What U Want To Reply</span>
                        <div className="h-px flex-1 bg-border/50" />
                    </div>
                    <p className="text-xs text-muted-foreground">
                        Your account will publicly reply to the comment with a random reply below.
                    </p>

                    <div className="space-y-2">
                        {data.customReplies.map((r, i) => (
                            <div key={i} className="flex items-center gap-2 group">
                                <span className="w-5 h-5 rounded-full bg-muted text-muted-foreground text-[10px] font-bold flex items-center justify-center shrink-0">{i + 1}</span>
                                <span className="flex-1 text-sm text-foreground bg-muted/30 border border-border/50 rounded-xl px-3 py-2 truncate">{r}</span>
                                <button
                                    onClick={() => onUpdate({ customReplies: data.customReplies.filter((_, j) => j !== i) })}
                                    className="opacity-0 group-hover:opacity-100 p-1.5 text-muted-foreground hover:text-destructive transition-all"
                                >
                                    <X className="w-3.5 h-3.5" />
                                </button>
                            </div>
                        ))}
                    </div>

                    <div className="flex gap-2">
                        <input
                            value={commentInput}
                            onChange={e => setCommentInput(e.target.value)}
                            onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addCommentReply(); } }}
                            placeholder="Type a reply and press Enter…"
                            className="flex-1 text-sm bg-background border border-border rounded-xl px-3 py-2 outline-none focus:border-primary/50 transition-colors"
                        />
                        <button
                            onClick={() => { addCommentReply(); setRepliesSaved(true); }}
                            className="px-3 py-2 bg-primary/10 text-primary rounded-xl hover:bg-primary/20 transition-colors font-bold text-sm"
                        >
                            <Plus className="w-4 h-4" />
                        </button>
                    </div>
                </section>

                {/* ── AUTO DM ── */}
                <section className="space-y-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <span className="text-[11px] font-extrabold text-foreground uppercase tracking-widest">Auto DM</span>
                            <div className="h-px w-12 bg-border/50" />
                        </div>
                        <Toggle on={data.isAutoDmEnabled} onChange={() => onUpdate({ isAutoDmEnabled: !data.isAutoDmEnabled })} />
                    </div>

                    <AnimatePresence>
                        {data.isAutoDmEnabled && (
                            <motion.div
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: "auto" }}
                                exit={{ opacity: 0, height: 0 }}
                                transition={{ duration: 0.2 }}
                                className="overflow-hidden space-y-4"
                            >
                                {/* Opening Message */}
                                <div className="border border-border rounded-xl overflow-hidden">
                                    <div className="flex items-center justify-between px-4 py-3 bg-muted/20 border-b border-border">
                                        <div>
                                            <p className="text-sm font-bold text-foreground">Opening Message</p>
                                            <p className="text-xs text-muted-foreground">First DM sent automatically when triggered</p>
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
                                                transition={{ duration: 0.2 }}
                                                className="overflow-hidden"
                                            >
                                                <div className="p-4 space-y-3">
                                                    <div className="relative">
                                                        <textarea
                                                            value={data.dmOpeningMessage}
                                                            onChange={e => onUpdate({ dmOpeningMessage: e.target.value })}
                                                            rows={5}
                                                            maxLength={1000}
                                                            placeholder="Hey! Thanks so much for stopping by…"
                                                            className="w-full text-sm bg-background border border-border rounded-xl px-3 py-2.5 outline-none focus:border-primary/50 transition-colors resize-none"
                                                        />
                                                        <span className="absolute bottom-2 right-3 text-[10px] text-muted-foreground">{data.dmOpeningMessage.length}/1000</span>
                                                    </div>
                                                    <p className="text-[10px] text-muted-foreground/60">
                                                        Tip: <code className="font-mono bg-muted px-1 rounded">{"{username}"}</code> is replaced with the commenter&apos;s @handle (comment triggers only).
                                                    </p>
                                                    {/* Quick reply button — no link, just title */}
                                                    <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 space-y-2">
                                                        <p className="text-xs font-bold text-primary uppercase tracking-wider">Quick Reply Button</p>
                                                        <p className="text-[11px] text-muted-foreground">When the audience taps this, they send the text below as a DM — triggering the next step.</p>
                                                        <input
                                                            value={data.dmOpeningMessageButtonTitle}
                                                            onChange={e => onUpdate({ dmOpeningMessageButtonTitle: e.target.value })}
                                                            maxLength={20}
                                                            placeholder="Send me the link"
                                                            className="w-full text-sm bg-background border border-border rounded-xl px-3 py-2 outline-none focus:border-primary/50 transition-colors"
                                                        />
                                                        <p className="text-[10px] text-muted-foreground/60">Max 20 characters (Instagram limit)</p>
                                                    </div>
                                                </div>
                                            </motion.div>
                                        )}
                                    </AnimatePresence>
                                </div>

                                {/* Ask To Follow — Pro feature */}
                                <div className="border border-border rounded-xl overflow-hidden">
                                    <div className="flex items-center justify-between px-4 py-3 bg-muted/20 border-b border-border">
                                        <div className="flex items-center gap-2">
                                            <div>
                                                <div className="flex items-center gap-2">
                                                    <p className="text-sm font-bold text-foreground">Require Follow</p>
                                                </div>
                                                <p className="text-xs text-muted-foreground">Deliver the content only after Instagram confirms they follow you</p>
                                            </div>
                                        </div>
                                        <Toggle on={data.askToFollowEnabled} onChange={() => onUpdate({ askToFollowEnabled: !data.askToFollowEnabled })} />
                                    </div>

                                    <AnimatePresence>
                                        {data.askToFollowEnabled && (
                                            <motion.div
                                                initial={{ height: 0, opacity: 0 }}
                                                animate={{ height: "auto", opacity: 1 }}
                                                exit={{ height: 0, opacity: 0 }}
                                                transition={{ duration: 0.2 }}
                                                className="overflow-hidden"
                                            >
                                                <div className="p-4 space-y-3">
                                                    <div>
                                                        <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider block mb-1.5">
                                                            "Not Following" Message
                                                        </label>
                                                        <textarea
                                                            value={data.askToFollowMessage}
                                                            onChange={e => onUpdate({ askToFollowMessage: e.target.value })}
                                                            rows={3}
                                                            maxLength={80}
                                                            placeholder="Hey! It seems you're not following me yet…"
                                                            className="w-full text-sm bg-background border border-border rounded-xl px-3 py-2 outline-none focus:border-primary/50 transition-colors resize-none"
                                                        />
                                                        <p className="text-[10px] text-muted-foreground/60 mt-1">Max 80 chars (shown as card title in Instagram)</p>
                                                    </div>

                                                    <div className="grid grid-cols-2 gap-3">
                                                        <div>
                                                            <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider block mb-1.5">
                                                                Visit Profile Button
                                                            </label>
                                                            <input
                                                                value={data.askToFollowVisitProfileButton}
                                                                onChange={e => onUpdate({ askToFollowVisitProfileButton: e.target.value })}
                                                                maxLength={20}
                                                                placeholder="Visit Profile"
                                                                className="w-full text-sm bg-background border border-border rounded-xl px-3 py-2 outline-none focus:border-primary/50 transition-colors"
                                                            />
                                                        </div>
                                                        <div>
                                                            <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider block mb-1.5">
                                                                Confirm Button
                                                            </label>
                                                            <input
                                                                value={data.askToFollowConfirmButton}
                                                                onChange={e => onUpdate({ askToFollowConfirmButton: e.target.value })}
                                                                maxLength={20}
                                                                placeholder="I'm following ✅"
                                                                className="w-full text-sm bg-background border border-border rounded-xl px-3 py-2 outline-none focus:border-primary/50 transition-colors"
                                                            />
                                                        </div>
                                                    </div>
                                                    <p className="text-[10px] text-muted-foreground/60">Both buttons max 20 characters. Follow status is REALLY checked via Instagram's profile API: on the first tap (followers skip this card entirely) and again when they tap the confirm button — still not following gets a gentle nudge instead of the content.</p>
                                                </div>
                                            </motion.div>
                                        )}
                                    </AnimatePresence>
                                </div>

                                {/* Response blocks */}
                                <div className="space-y-3">
                                    <div className="flex items-center gap-2">
                                        <span className="text-[11px] font-extrabold text-foreground uppercase tracking-widest">Responses</span>
                                        <div className="h-px flex-1 bg-border/50" />
                                    </div>

                                    {!data.dmOpeningMessageEnabled && data.dmResponses.length >= 1 && (
                                        <div className="text-xs text-amber-600 bg-amber-500/10 border border-amber-500/20 rounded-xl px-3 py-2 font-medium">
                                            Opening message is off — only one response block allowed.
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

                                    <AddResponseButtons onAdd={addResponse} disabled={!canAddMoreResponses} />
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </section>
            </div>

            {/* ── Right panel — phone visualization ── */}
            <div className="hidden xl:flex w-[620px] shrink-0 bg-[#0a0a0a] border-l border-border/30 overflow-hidden relative">
                <motion.div
                    initial={{ y: "100%", opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ type: "spring", damping: 32, stiffness: 260, delay: 0.1 }}
                    className="flex items-center justify-center gap-6 w-full h-full p-6"
                >
                    {/* Comments phone */}
                    <CommentsPhone
                        postThumbnailUrl={data.postThumbnailUrl}
                        previewComments={previewKeywords}
                        anyMode={isAnyMode}
                        repliesSaved={repliesSaved || data.customReplies.length > 0}
                        customReplies={data.customReplies}
                        creatorProfilePicUrl={creatorProfilePicUrl}
                    />

                    {/* DM conversation phone */}
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
                        />
                    )}
                </motion.div>
            </div>
        </div>
    );
}

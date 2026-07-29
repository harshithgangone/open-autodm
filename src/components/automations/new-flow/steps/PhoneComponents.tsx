"use client";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronLeft, Send, MessageCircle, Zap, MessageSquarePlus } from "lucide-react";
import { cn } from "@/lib/utils";

/* ─── Reusable Toggle ─── */
export function Toggle({ on, onChange }: { on: boolean; onChange: () => void }) {
    return (
        <button type="button" role="switch" aria-checked={on} onClick={onChange}
            className={cn("relative inline-flex h-[26px] w-[46px] shrink-0 cursor-pointer rounded-full transition-colors focus-visible:outline-none",
                on ? "bg-emerald-500" : "bg-gray-200 dark:bg-gray-700")}>
            <span className={cn("inline-block h-[22px] w-[22px] translate-y-[2px] rounded-full bg-white shadow-sm transition-transform duration-200",
                on ? "translate-x-[22px]" : "translate-x-[2px]")} />
        </button>
    );
}

/* ─── Phone Shell ─── */
export function PhoneShell({ children, label }: { children: React.ReactNode; label: string }) {
    return (
        <div className="flex flex-col items-center gap-3 shrink-0">
            <p className="text-[10px] font-bold uppercase tracking-widest text-white/30">{label}</p>
            <div className="relative w-[260px] h-[540px] rounded-[38px] border-[5px] border-[#2a2a2a] bg-[#080808] shadow-[0_0_40px_rgba(0,0,0,0.6)] overflow-hidden">
                <div className="absolute top-0 left-1/2 -translate-x-1/2 z-20 w-[88px] h-[24px] bg-black rounded-b-[18px]" />
                <div className="absolute -right-[5px] top-[90px] w-[4px] h-[44px] bg-[#2a2a2a] rounded-l-full" />
                <div className="absolute -left-[5px] top-[80px] w-[4px] h-[32px] bg-[#2a2a2a] rounded-r-full" />
                <div className="absolute -left-[5px] top-[120px] w-[4px] h-[52px] bg-[#2a2a2a] rounded-r-full" />
                <div className="w-full h-full flex flex-col text-white pt-6">{children}</div>
            </div>
        </div>
    );
}

/* ─── Creator avatar helper ─── */
function CreatorAvatar({ url, size = "sm" }: { url?: string | null; size?: "sm" | "xs" }) {
    const cls = size === "xs" ? "w-5 h-5" : "w-7 h-7";
    if (url) {
        return <img src={url} alt="you" className={cn(cls, "rounded-full object-cover shrink-0")} />;
    }
    return (
        <div className={cn(cls, "rounded-full bg-gradient-to-tr from-[#f09433] via-[#e6683c] to-[#bc1888] shrink-0 flex items-center justify-center")}>
            <Zap className="w-2.5 h-2.5 text-white" />
        </div>
    );
}

/* ─── Comments Phone ─── */
export function CommentsPhone({
    postThumbnailUrl, previewComments, anyMode, repliesSaved, customReplies, creatorProfilePicUrl,
}: {
    postThumbnailUrl?: string | null;
    previewComments: string[];
    anyMode: boolean;
    repliesSaved: boolean;
    customReplies: string[];
    creatorProfilePicUrl?: string | null;
}) {
    const colors = ["from-pink-500 to-orange-400", "from-violet-500 to-indigo-400", "from-emerald-500 to-teal-400"];

    return (
        <PhoneShell label="Comments Feed">
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/8">
                <ChevronLeft className="w-5 h-5 text-white/60" />
                <span className="font-semibold text-[14px]">Comments</span>
                <Send className="w-4 h-4 text-white/60" />
            </div>

            {/* Post thumbnail strip */}
            {postThumbnailUrl && (
                <div className="relative w-full h-[80px] shrink-0 overflow-hidden bg-[#111]">
                    <img src={postThumbnailUrl} alt="post" className="w-full h-full object-cover opacity-80" />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                    <span className="absolute bottom-1.5 left-3 text-[9px] font-bold text-white/60 uppercase tracking-widest">Your Post</span>
                </div>
            )}

            <div className="flex-1 overflow-y-auto px-3 py-4 space-y-5">
                {previewComments.map((kw, idx) => {
                    const reply = repliesSaved && customReplies.length > 0 ? customReplies[idx % customReplies.length] : null;
                    return (
                        <div key={idx} className="flex gap-2.5">
                            <div className={cn("w-7 h-7 rounded-full bg-gradient-to-tr shrink-0 flex items-center justify-center text-white text-[10px] font-bold", colors[idx % 3])}>
                                {String.fromCharCode(65 + idx)}
                            </div>
                            <div className="flex-1 space-y-1.5">
                                <p className="text-[11px] font-bold text-white/70">user_{idx + 1}</p>
                                {anyMode ? (
                                    <p className="text-[14px]">{kw}</p>
                                ) : (
                                    <p className="text-[12px] text-white/85">
                                        Hey! I want the{" "}
                                        <span className="font-bold text-orange-400 bg-orange-400/15 px-1 rounded">{kw}</span> 🙌
                                    </p>
                                )}
                                <AnimatePresence>
                                    {reply && (
                                        <motion.div initial={{ opacity: 0, y: 3 }} animate={{ opacity: 1, y: 0 }} className="flex gap-2 pt-1">
                                            <CreatorAvatar url={creatorProfilePicUrl} size="xs" />
                                            <div>
                                                <p className="text-[9px] font-bold text-emerald-400 mb-0.5">Auto Reply · you</p>
                                                <p className="text-[11px] text-white/70">{reply}</p>
                                            </div>
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </div>
                        </div>
                    );
                })}
            </div>
        </PhoneShell>
    );
}

/* ─── Story Phone ─── */
export function StoryPhone({ keyword }: { keyword: string }) {
    return (
        <PhoneShell label="Story Reply">
            <div className="flex items-center gap-3 px-4 py-3 border-b border-white/8">
                <ChevronLeft className="w-5 h-5 text-white/60" />
                <div className="flex-1 flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-pink-500 via-orange-400 to-yellow-400 p-[2px]">
                        <div className="w-full h-full rounded-full bg-black" />
                    </div>
                    <span className="text-sm font-bold">Your Story</span>
                </div>
            </div>
            <div className="flex-1 relative">
                <div className="absolute inset-0 bg-gradient-to-b from-purple-900 via-pink-900 to-orange-900 flex items-center justify-center">
                    <div className="text-center px-4">
                        <p className="text-4xl mb-2">📸</p>
                        <p className="text-sm font-bold text-white/80">Your Story</p>
                    </div>
                </div>
            </div>
            <div className="px-3 py-3 border-t border-white/8 bg-black/30">
                <div className="flex items-center bg-white/8 rounded-full h-9 px-3 border border-white/10 gap-2">
                    <span className="text-[12px] text-white/40 flex-1">{keyword || "Reply to story..."}</span>
                    <Send className="w-3 h-3 text-white/20" />
                </div>
                <p className="text-[9px] text-white/20 text-center mt-1.5">User replies with keyword → triggers automation</p>
            </div>
        </PhoneShell>
    );
}

/* ─── DM Phone ─── */
export function DMPhone({ keyword }: { keyword: string }) {
    return (
        <PhoneShell label="DM Inbox">
            <div className="flex items-center gap-3 px-3 py-2.5 border-b border-white/8">
                <ChevronLeft className="w-4 h-4 text-white/60" />
                <div className="flex-1">
                    <p className="text-sm font-bold">Direct Messages</p>
                </div>
                <MessageCircle className="w-4 h-4 text-white/40" />
            </div>
            <div className="flex-1 divide-y divide-white/5">
                {["user_follower", "user_new", "user_fan"].map((u, i) => (
                    <div key={u} className={cn("flex items-center gap-3 px-3 py-3", i === 0 && "bg-white/4")}>
                        <div className={cn("w-9 h-9 rounded-full bg-gradient-to-tr shrink-0",
                            i === 0 ? "from-pink-500 to-orange-400" : i === 1 ? "from-violet-500 to-blue-400" : "from-emerald-500 to-teal-400")} />
                        <div className="flex-1 min-w-0">
                            <p className="text-[12px] font-bold">{u}</p>
                            <p className="text-[11px] text-white/40 truncate">{i === 0 ? (keyword || "hey, GUIDE") : "..."}</p>
                        </div>
                        {i === 0 && <div className="w-2 h-2 rounded-full bg-[#3797f0] shrink-0" />}
                    </div>
                ))}
            </div>
            <div className="px-3 py-2 border-t border-white/5 text-center">
                <p className="text-[9px] text-white/20">User DMs keyword → auto reply triggered</p>
            </div>
        </PhoneShell>
    );
}

/* ─── DM Conversation Phone — Creator's perspective ─── */
/* Creator's messages: RIGHT side (blue bubbles)         */
/* Audience's messages: LEFT side (gray bubbles)         */
export function DMConversationPhone({
    openingEnabled, openingMessage, openingBtnTitle,
    askToFollowEnabled, askToFollowMessage, askToFollowVisitBtn, askToFollowConfirmBtn,
    responses, phase, onPhaseChange, creatorProfilePicUrl,
}: {
    openingEnabled: boolean;
    openingMessage: string;
    openingBtnTitle?: string;
    askToFollowEnabled: boolean;
    askToFollowMessage: string;
    askToFollowVisitBtn: string;
    askToFollowConfirmBtn: string;
    responses: import("../NewAutomationModal").DMResponse[];
    phase: "initial" | "clicked" | "followed";
    onPhaseChange: (p: "initial" | "clicked" | "followed") => void;
    creatorProfilePicUrl?: string | null;
}) {
    const textResponses = responses.filter(r => r.type === "text");

    return (
        <PhoneShell label="DM Preview">
            {/* Header — shows audience member's name */}
            <div className="flex items-center gap-3 px-3 py-2 border-b border-white/8 bg-white/3">
                <ChevronLeft className="w-4 h-4 text-white/60 shrink-0" />
                <div className="w-7 h-7 rounded-full bg-gradient-to-tr from-pink-500 to-orange-400 shrink-0" />
                <div className="flex-1 min-w-0">
                    <p className="text-[12px] font-bold leading-none">user_1</p>
                    <p className="text-[10px] text-white/30 mt-0.5">Active now</p>
                </div>
                <MessageCircle className="w-4 h-4 text-white/25 shrink-0" />
            </div>

            {openingEnabled && (
                <div className="px-3 py-1.5 text-center">
                    <p className="text-[9px] text-white/20">messaged about your post · See Post</p>
                </div>
            )}

            <div className="flex-1 overflow-y-auto px-3 py-2 space-y-3 flex flex-col">

                {/* ── Phase: initial — creator's opening message (RIGHT) ── */}
                {openingEnabled && openingMessage && (
                    <motion.div
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="flex justify-end items-end gap-1.5"
                    >
                        <div className="bg-[#3797f0] rounded-2xl rounded-tr-sm overflow-hidden max-w-[85%]">
                            <div className="px-3 py-2.5">
                                <p className="text-[12px] leading-relaxed whitespace-pre-line">{openingMessage}</p>
                            </div>
                            {/* Quick reply button — inside creator's bubble */}
                            {openingBtnTitle && phase === "initial" && (
                                <div className="border-t border-white/20">
                                    <button
                                        onClick={() => onPhaseChange("clicked")}
                                        className="w-full text-[12px] font-semibold text-white/90 py-2 hover:bg-white/10 transition-colors"
                                    >
                                        {openingBtnTitle}
                                    </button>
                                </div>
                            )}
                        </div>
                        <CreatorAvatar url={creatorProfilePicUrl} size="xs" />
                    </motion.div>
                )}

                {/* ── Phase: clicked — audience taps quick reply (LEFT) ── */}
                <AnimatePresence>
                    {phase !== "initial" && (
                        <>
                            {/* Audience quick reply → LEFT */}
                            <motion.div
                                initial={{ opacity: 0, y: 6 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="flex items-end gap-2"
                            >
                                <div className="w-5 h-5 rounded-full bg-gradient-to-tr from-pink-500 to-orange-400 shrink-0" />
                                <div className="bg-[#1e1e1e] border border-white/8 rounded-2xl rounded-tl-sm px-3 py-2 max-w-[80%]">
                                    <p className="text-[12px] font-medium">{openingBtnTitle || "Send me the link"}</p>
                                </div>
                            </motion.div>

                            {/* Ask-to-follow: creator sends card (RIGHT) */}
                            {askToFollowEnabled && phase !== "followed" && (
                                <motion.div
                                    initial={{ opacity: 0, y: 6 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: 0.25 }}
                                    className="flex justify-end items-end gap-1.5"
                                >
                                    <div className="bg-[#3797f0] rounded-2xl rounded-tr-sm overflow-hidden max-w-[85%]">
                                        <div className="px-3 py-2.5">
                                            <p className="text-[11px] leading-relaxed">
                                                {askToFollowMessage || "Hey! It seems you're not following me yet 😊"}
                                            </p>
                                        </div>
                                        <div className="border-t border-white/20 divide-y divide-white/10">
                                            <button className="w-full text-[11px] font-semibold text-white/90 py-1.5 hover:bg-white/10 transition-colors">
                                                {askToFollowVisitBtn || "Visit Profile"}
                                            </button>
                                            <button
                                                onClick={() => onPhaseChange("followed")}
                                                className="w-full text-[11px] text-white/80 py-1.5 hover:bg-white/10 transition-colors"
                                            >
                                                {askToFollowConfirmBtn || "I'm following ✅"}
                                            </button>
                                        </div>
                                    </div>
                                    <CreatorAvatar url={creatorProfilePicUrl} size="xs" />
                                </motion.div>
                            )}

                            {/* If no ask-to-follow OR after confirming follow: show responses */}
                            {(!askToFollowEnabled || phase === "followed") && (
                                <>
                                    {/* After "I'm following" tap: audience message LEFT */}
                                    {askToFollowEnabled && phase === "followed" && (
                                        <motion.div
                                            initial={{ opacity: 0, y: 6 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            className="flex items-end gap-2"
                                        >
                                            <div className="w-5 h-5 rounded-full bg-gradient-to-tr from-pink-500 to-orange-400 shrink-0" />
                                            <div className="bg-[#1e1e1e] border border-white/8 rounded-2xl rounded-tl-sm px-3 py-2 max-w-[80%]">
                                                <p className="text-[12px] font-medium">{askToFollowConfirmBtn || "I'm following ✅"}</p>
                                            </div>
                                        </motion.div>
                                    )}

                                    {/* Creator's responses (RIGHT) */}
                                    {textResponses.length > 0 ? (
                                        textResponses.map((resp, i) => (
                                            <motion.div
                                                key={resp.id}
                                                initial={{ opacity: 0, y: 6 }}
                                                animate={{ opacity: 1, y: 0 }}
                                                transition={{ delay: 0.15 + i * 0.15 }}
                                                className="flex justify-end items-end gap-1.5"
                                            >
                                                <div className="bg-[#3797f0] rounded-2xl rounded-tr-sm px-3 py-2.5 max-w-[85%]">
                                                    <p className="text-[12px] leading-relaxed whitespace-pre-line">{resp.content || "Your message here..."}</p>
                                                    {resp.buttonLink && (
                                                        <p className="text-[10px] text-white/70 mt-1">🔗 {resp.buttonTitle || resp.buttonLink}</p>
                                                    )}
                                                </div>
                                                <CreatorAvatar url={creatorProfilePicUrl} size="xs" />
                                            </motion.div>
                                        ))
                                    ) : responses.length > 0 ? (
                                        /* Card response placeholder */
                                        <motion.div
                                            initial={{ opacity: 0, y: 6 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            transition={{ delay: 0.2 }}
                                            className="flex justify-end items-end gap-1.5"
                                        >
                                            <div className="bg-[#3797f0] rounded-2xl rounded-tr-sm overflow-hidden max-w-[85%]">
                                                <div className="h-16 bg-white/10 flex items-center justify-center">
                                                    <p className="text-[10px] text-white/40">Card Preview</p>
                                                </div>
                                                <div className="px-3 py-2">
                                                    <p className="text-[11px] font-semibold text-white/90">
                                                        {responses[0]?.cardTitle || "Card message"}
                                                    </p>
                                                </div>
                                            </div>
                                            <CreatorAvatar url={creatorProfilePicUrl} size="xs" />
                                        </motion.div>
                                    ) : null}
                                </>
                            )}
                        </>
                    )}
                </AnimatePresence>

                {!openingEnabled && responses.length === 0 && (
                    <div className="flex-1 flex flex-col items-center justify-center opacity-25">
                        <MessageSquarePlus className="w-7 h-7 mb-2" />
                        <p className="text-[11px]">Build your flow on the left</p>
                    </div>
                )}
            </div>

            {phase !== "initial" && (
                <div className="px-3 py-1.5 border-t border-white/5 flex justify-center">
                    <button onClick={() => onPhaseChange("initial")} className="text-[10px] text-white/20 hover:text-white/50">
                        ↩ Reset preview
                    </button>
                </div>
            )}

            <div className="px-3 py-2 border-t border-white/5 bg-black/20">
                <div className="flex items-center bg-white/5 rounded-full h-8 px-3 border border-white/8 gap-2">
                    <span className="text-[11px] text-white/20 flex-1">Message...</span>
                    <Send className="w-3 h-3 text-white/15" />
                </div>
            </div>
        </PhoneShell>
    );
}

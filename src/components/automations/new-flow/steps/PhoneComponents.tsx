"use client";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronLeft, Send, MessageCircle, Zap, MessageSquarePlus } from "lucide-react";
import { cn } from "@/lib/utils";
import type { DMResponse } from "../NewAutomationModal";

/* ─── Phone shell ─── */
export function PhoneShell({ children, label }: { children: React.ReactNode; label: string }) {
    return (
        <div className="flex flex-col items-center gap-2.5 shrink-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/30">{label}</p>
            <div className="relative w-[252px] h-[524px] rounded-[36px] border-[4px] border-[#26262b] bg-[#080809] shadow-[0_0_50px_rgba(0,0,0,0.55)] overflow-hidden">
                <div className="absolute top-0 left-1/2 -translate-x-1/2 z-20 w-[80px] h-[22px] bg-black rounded-b-[16px]" />
                <div className="w-full h-full flex flex-col text-white pt-6">{children}</div>
            </div>
        </div>
    );
}

/* ─── Creator avatar ─── */
function CreatorAvatar({ url, size = "sm" }: { url?: string | null; size?: "sm" | "xs" }) {
    const cls = size === "xs" ? "w-5 h-5" : "w-7 h-7";
    if (url) {
        return <img src={url} alt="you" className={cn(cls, "rounded-full object-cover shrink-0")} />;
    }
    return (
        <div className={cn(cls, "rounded-full ig-ring shrink-0 flex items-center justify-center")}>
            <Zap className="w-2.5 h-2.5 text-white" />
        </div>
    );
}

/* ─── Comments phone (comment-dm trigger) ─── */
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
        <PhoneShell label="Comments">
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/8">
                <ChevronLeft className="w-4 h-4 text-white/50" />
                <span className="font-semibold text-[13px]">Comments</span>
                <Send className="w-3.5 h-3.5 text-white/50" />
            </div>

            {postThumbnailUrl && (
                <div className="relative w-full h-[72px] shrink-0 overflow-hidden bg-[#111]">
                    <img src={postThumbnailUrl} alt="post" className="w-full h-full object-cover opacity-80" />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                    <span className="absolute bottom-1.5 left-3 text-[9px] font-semibold text-white/60 uppercase tracking-widest">Your post</span>
                </div>
            )}

            <div className="flex-1 overflow-y-auto px-3 py-4 space-y-4 scrollbar-none">
                {previewComments.map((kw, idx) => {
                    const reply = repliesSaved && customReplies.length > 0 ? customReplies[idx % customReplies.length] : null;
                    return (
                        <div key={idx} className="flex gap-2.5">
                            <div className={cn("w-6 h-6 rounded-full bg-gradient-to-tr shrink-0 flex items-center justify-center text-white text-[9px] font-bold", colors[idx % 3])}>
                                {String.fromCharCode(65 + idx)}
                            </div>
                            <div className="flex-1 space-y-1">
                                <p className="text-[10px] font-semibold text-white/60">user_{idx + 1}</p>
                                {anyMode ? (
                                    <p className="text-[13px]">{kw}</p>
                                ) : (
                                    <p className="text-[11.5px] text-white/85">
                                        Hey! I want the <span className="font-semibold text-orange-400 bg-orange-400/15 px-1 rounded">{kw}</span> 🙌
                                    </p>
                                )}
                                <AnimatePresence>
                                    {reply && (
                                        <motion.div initial={{ opacity: 0, y: 3 }} animate={{ opacity: 1, y: 0 }} className="flex gap-1.5 pt-1">
                                            <CreatorAvatar url={creatorProfilePicUrl} size="xs" />
                                            <div>
                                                <p className="text-[8.5px] font-semibold text-emerald-400 mb-0.5">Auto reply · you</p>
                                                <p className="text-[10.5px] text-white/70">{reply}</p>
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

/* ─── Story phone (story-reply trigger) ─── */
export function StoryPhone({ keyword }: { keyword: string }) {
    return (
        <PhoneShell label="Your story">
            <div className="flex items-center gap-2.5 px-3 py-2.5">
                <div className="w-7 h-7 rounded-full ig-ring p-[1.5px]">
                    <div className="w-full h-full rounded-full bg-black" />
                </div>
                <span className="text-[12px] font-semibold">Your story</span>
                <span className="text-[10px] text-white/40">2h</span>
            </div>
            <div className="flex-1 relative mx-2 rounded-xl overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-b from-purple-900 via-pink-900 to-orange-900 flex items-center justify-center">
                    <div className="text-center px-4">
                        <p className="text-3xl mb-2">📸</p>
                        <p className="text-[12px] font-semibold text-white/80">Story content</p>
                    </div>
                </div>
            </div>
            <div className="px-3 py-3">
                <div className="flex items-center bg-white/8 rounded-full h-9 px-3.5 border border-white/12 gap-2">
                    <span className="text-[12px] text-white/80 flex-1 truncate">{keyword || "Reply to story…"}</span>
                    <Send className="w-3 h-3 text-white/40" />
                </div>
                <p className="text-[9px] text-white/25 text-center mt-1.5">They reply with your keyword → the flow starts</p>
            </div>
        </PhoneShell>
    );
}

/* ─── DM conversation phone - creator's perspective ───
   Creator messages: RIGHT (blue). Audience: LEFT (gray).
   `trigger` renders the audience's triggering message first (dm/story flows). */
export function DMConversationPhone({
    openingEnabled, openingMessage, openingBtnTitle,
    askToFollowEnabled, askToFollowMessage, askToFollowVisitBtn, askToFollowConfirmBtn,
    responses, phase, onPhaseChange, creatorProfilePicUrl, trigger,
}: {
    openingEnabled: boolean;
    openingMessage: string;
    openingBtnTitle?: string;
    askToFollowEnabled: boolean;
    askToFollowMessage: string;
    askToFollowVisitBtn: string;
    askToFollowConfirmBtn: string;
    responses: DMResponse[];
    phase: "initial" | "clicked" | "followed";
    onPhaseChange: (p: "initial" | "clicked" | "followed") => void;
    creatorProfilePicUrl?: string | null;
    trigger?: { kind: "dm" | "story"; text: string } | null;
}) {
    const textResponses = responses.filter(r => r.type === "text");
    const hasQuickReply = !!openingBtnTitle?.trim();
    // Without an opening button there is no tap step - responses show immediately.
    const showResponses = hasQuickReply ? (phase !== "initial" && (!askToFollowEnabled || phase === "followed")) : true;

    return (
        <PhoneShell label="DM preview">
            {/* Header */}
            <div className="flex items-center gap-2.5 px-3 py-2 border-b border-white/8">
                <ChevronLeft className="w-3.5 h-3.5 text-white/50 shrink-0" />
                <div className="w-6 h-6 rounded-full bg-gradient-to-tr from-pink-500 to-orange-400 shrink-0" />
                <div className="flex-1 min-w-0">
                    <p className="text-[11.5px] font-semibold leading-none">user_1</p>
                    <p className="text-[9px] text-white/30 mt-0.5">Active now</p>
                </div>
                <MessageCircle className="w-3.5 h-3.5 text-white/25 shrink-0" />
            </div>

            {trigger?.kind !== "dm" && trigger?.kind !== "story" && openingEnabled && (
                <div className="px-3 py-1.5 text-center">
                    <p className="text-[8.5px] text-white/20">messaged about your post · See post</p>
                </div>
            )}

            <div className="flex-1 overflow-y-auto px-3 py-2.5 space-y-2.5 flex flex-col scrollbar-none">

                {/* Audience trigger message (dm / story flows) - LEFT */}
                {trigger && (
                    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col items-start gap-1">
                        {trigger.kind === "story" && (
                            <div className="flex items-center gap-1.5 pl-7">
                                <div className="w-6 h-10 rounded-md bg-gradient-to-b from-purple-800 to-orange-800 opacity-70" />
                                <span className="text-[8.5px] text-white/30">Replied to your story</span>
                            </div>
                        )}
                        <div className="flex items-end gap-1.5">
                            <div className="w-5 h-5 rounded-full bg-gradient-to-tr from-pink-500 to-orange-400 shrink-0" />
                            <div className="bg-[#1e1e22] rounded-2xl rounded-bl-sm px-3 py-2 max-w-[80%]">
                                <p className="text-[12px] font-medium">{trigger.text || "DIET"}</p>
                            </div>
                        </div>
                    </motion.div>
                )}

                {/* Opening message - RIGHT */}
                {openingEnabled && openingMessage && (
                    <motion.div
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="flex justify-end items-end gap-1.5"
                    >
                        <div className="bg-[#3797f0] rounded-2xl rounded-br-sm overflow-hidden max-w-[85%]">
                            <p className="text-[12px] leading-relaxed whitespace-pre-line px-3 py-2.5">{openingMessage}</p>
                            {hasQuickReply && phase === "initial" && (
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

                <AnimatePresence>
                    {hasQuickReply && phase !== "initial" && (
                        <>
                            {/* Audience tap echo - LEFT */}
                            <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="flex items-end gap-1.5">
                                <div className="w-5 h-5 rounded-full bg-gradient-to-tr from-pink-500 to-orange-400 shrink-0" />
                                <div className="bg-[#1e1e22] rounded-2xl rounded-bl-sm px-3 py-2 max-w-[80%]">
                                    <p className="text-[12px] font-medium">{openingBtnTitle}</p>
                                </div>
                            </motion.div>

                            {/* Ask-to-follow card - RIGHT (only for non-followers) */}
                            {askToFollowEnabled && phase !== "followed" && (
                                <motion.div
                                    initial={{ opacity: 0, y: 6 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: 0.2 }}
                                    className="flex justify-end items-end gap-1.5"
                                >
                                    <div className="max-w-[85%] flex flex-col items-end gap-1">
                                        <p className="text-[8px] text-white/25 uppercase tracking-widest pr-1">If they don&apos;t follow you</p>
                                        <div className="bg-[#3797f0] rounded-2xl rounded-br-sm overflow-hidden">
                                            <p className="text-[11px] leading-relaxed px-3 py-2.5">
                                                {askToFollowMessage || "Hey! It seems you're not following me yet 😊"}
                                            </p>
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
                                    </div>
                                    <CreatorAvatar url={creatorProfilePicUrl} size="xs" />
                                </motion.div>
                            )}

                            {/* "I'm following" tap echo - LEFT */}
                            {askToFollowEnabled && phase === "followed" && (
                                <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="flex items-end gap-1.5">
                                    <div className="w-5 h-5 rounded-full bg-gradient-to-tr from-pink-500 to-orange-400 shrink-0" />
                                    <div className="bg-[#1e1e22] rounded-2xl rounded-bl-sm px-3 py-2 max-w-[80%]">
                                        <p className="text-[12px] font-medium">{askToFollowConfirmBtn || "I'm following ✅"}</p>
                                    </div>
                                </motion.div>
                            )}
                        </>
                    )}
                </AnimatePresence>

                {/* Responses - RIGHT */}
                {showResponses && (
                    <>
                        {textResponses.map((resp, i) => (
                            <motion.div
                                key={resp.id}
                                initial={{ opacity: 0, y: 6 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: 0.12 + i * 0.12 }}
                                className="flex justify-end items-end gap-1.5"
                            >
                                <div className="bg-[#3797f0] rounded-2xl rounded-br-sm overflow-hidden max-w-[85%]">
                                    <p className="text-[12px] leading-relaxed whitespace-pre-line px-3 py-2.5">{resp.content || "Your message here…"}</p>
                                    {resp.buttonLink && (
                                        <div className="border-t border-white/20">
                                            <div className="w-full text-center text-[12px] font-semibold text-white/90 py-2">
                                                {resp.buttonTitle || "Open link"}
                                            </div>
                                        </div>
                                    )}
                                </div>
                                <CreatorAvatar url={creatorProfilePicUrl} size="xs" />
                            </motion.div>
                        ))}
                        {textResponses.length === 0 && responses.length > 0 && (
                            <motion.div
                                initial={{ opacity: 0, y: 6 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: 0.15 }}
                                className="flex justify-end items-end gap-1.5"
                            >
                                <div className="bg-[#3797f0] rounded-2xl rounded-br-sm overflow-hidden max-w-[85%]">
                                    <div className="h-14 bg-white/10 flex items-center justify-center">
                                        <p className="text-[10px] text-white/40">Card preview</p>
                                    </div>
                                    <p className="text-[11px] font-semibold text-white/90 px-3 py-2">
                                        {responses[0]?.cardTitle || "Card message"}
                                    </p>
                                </div>
                                <CreatorAvatar url={creatorProfilePicUrl} size="xs" />
                            </motion.div>
                        )}
                    </>
                )}

                {!openingEnabled && responses.length === 0 && !trigger && (
                    <div className="flex-1 flex flex-col items-center justify-center opacity-25">
                        <MessageSquarePlus className="w-6 h-6 mb-2" />
                        <p className="text-[11px]">Build your flow on the left</p>
                    </div>
                )}
            </div>

            {hasQuickReply && phase !== "initial" && (
                <div className="px-3 py-1 border-t border-white/5 flex justify-center">
                    <button onClick={() => onPhaseChange("initial")} className="text-[10px] text-white/25 hover:text-white/50 transition-colors">
                        ↩ Reset preview
                    </button>
                </div>
            )}

            <div className="px-3 py-2 border-t border-white/5">
                <div className="flex items-center bg-white/5 rounded-full h-8 px-3 border border-white/8 gap-2">
                    <span className="text-[11px] text-white/20 flex-1">Message…</span>
                    <Send className="w-3 h-3 text-white/15" />
                </div>
            </div>
        </PhoneShell>
    );
}

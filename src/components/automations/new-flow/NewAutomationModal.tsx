"use client";

import { motion, AnimatePresence } from "framer-motion";
import { X, ArrowLeft, Check, AlertTriangle } from "lucide-react";
import { useState, useEffect, useCallback, useRef } from "react";
import { cn } from "@/lib/utils";

import { SelectTypeStep } from "./steps/SelectTypeStep";
import { SelectPostStep } from "./steps/SelectPostStep";
import { ConfigureStep } from "./steps/ConfigureStep";
import { useInstagramAccounts } from "@/hooks/useInstagramAccounts";
import { useCreateAutomation, useUpdateAutomation } from "@/hooks/useAutomations";
import type { AutomationFromDB } from "@/hooks/useAutomations";

interface NewAutomationModalProps {
    isOpen: boolean;
    onClose: () => void;
    editAutomation?: AutomationFromDB | null;
}

export type CardButton = {
    id: string;
    title: string;
    link: string;
};

export type DMResponse = {
    id: string;
    type: "text" | "card" | "ask_follow" | "lead_form";
    content: string;
    buttonTitle?: string;
    buttonLink?: string;
    cardImage?: string;
    cardTitle?: string;
    cardSubtitle?: string;
    cardButtons?: CardButton[];
};

export type AutomationFlowData = {
    name: string;
    type: string | null;
    postId: string | null;
    // UI-only display fields (not sent to API)
    postThumbnailUrl?: string | null;
    postCaption?: string;
    keywords: string[];
    keywordsAnyMode: boolean; // true = any comment, false = specific keywords
    customReplies: string[];
    // DM flow
    isAutoDmEnabled: boolean;
    dmOpeningMessageEnabled: boolean;
    dmOpeningMessage: string;
    dmOpeningMessageButtonTitle: string;
    // Ask-to-follow
    askToFollowEnabled: boolean;
    askToFollowMessage: string;
    askToFollowVisitProfileButton: string;
    askToFollowConfirmButton: string;
    dmResponses: DMResponse[];
};

const DB_TYPE_TO_FLOW: Record<string, string> = {
    comment_dm: "comment-dm",
    dm_reply: "dm-reply",
    story_reply: "story-reply",
};

const defaultFlowData = (): AutomationFlowData => ({
    name: "New automation",
    type: null,
    postId: null,
    postThumbnailUrl: null,
    postCaption: "",
    keywords: [],
    keywordsAnyMode: true,
    customReplies: ["Sent! 🚀", "Check your DMs 📬", "Got it, check your inbox! ✉️", "Sending it over now ✨"],
    isAutoDmEnabled: true,
    dmOpeningMessageEnabled: true,
    dmOpeningMessage: "Hey there!\n\nI'm so happy you're here, thank you so much for your interest 🥰\n\nClick below and I'll send you the link in just a sec ✨",
    dmOpeningMessageButtonTitle: "Send me the link",
    askToFollowEnabled: false,
    askToFollowMessage: "Hey! It seems you're not following me yet 😊\n\nWould love it if you could check out my profile and hit follow!",
    askToFollowVisitProfileButton: "Visit Profile",
    askToFollowConfirmButton: "I'm following ✅",
    dmResponses: [],
});

function automationToFlowData(automation: AutomationFromDB): AutomationFlowData {
    const defaults = defaultFlowData();
    const keywords = automation.keywords ?? [];
    return {
        name: automation.name,
        type: DB_TYPE_TO_FLOW[automation.type] ?? automation.type,
        postId: automation.post_id ?? null,
        postThumbnailUrl: automation.post_thumbnail_url ?? null,
        postCaption: automation.post_caption ?? "",
        keywords,
        keywordsAnyMode: keywords.length === 0,
        customReplies: automation.comment_reply_options.length > 0
            ? automation.comment_reply_options
            : defaults.customReplies,
        isAutoDmEnabled: automation.dm_opening_message_enabled,
        dmOpeningMessageEnabled: automation.dm_opening_message_enabled,
        dmOpeningMessage: automation.dm_opening_message || defaults.dmOpeningMessage,
        dmOpeningMessageButtonTitle: automation.dm_opening_message_button_title ?? defaults.dmOpeningMessageButtonTitle,
        askToFollowEnabled: automation.ask_to_follow_enabled,
        askToFollowMessage: automation.ask_to_follow_message || defaults.askToFollowMessage,
        askToFollowVisitProfileButton: automation.ask_to_follow_visit_profile_button || defaults.askToFollowVisitProfileButton,
        askToFollowConfirmButton: automation.ask_to_follow_confirm_button || defaults.askToFollowConfirmButton,
        dmResponses: automation.dm_responses as DMResponse[],
    };
}

export function NewAutomationModal({ isOpen, onClose, editAutomation }: NewAutomationModalProps) {
    const isEditMode = !!editAutomation;

    const [step, setStep] = useState(0);
    const [flowData, setFlowData] = useState<AutomationFlowData>(defaultFlowData());
    const [savedSnapshot, setSavedSnapshot] = useState<string>("");
    const [showConfirm, setShowConfirm] = useState(false);
    const [activateError, setActivateError] = useState<string | null>(null);
    const [pendingAction, setPendingAction] = useState<'save' | 'activate' | null>(null);

    const { data: igAccounts } = useInstagramAccounts();
    const firstAccountId = igAccounts?.[0]?.id ?? null;
    const createMutation = useCreateAutomation();
    const updateMutation = useUpdateAutomation();

    const isDirty = JSON.stringify(flowData) !== savedSnapshot;

    // Reset / pre-fill on open
    useEffect(() => {
        if (isOpen) {
            setActivateError(null);
            setShowConfirm(false);
            setPendingAction(null);
            if (editAutomation) {
                const fd = automationToFlowData(editAutomation);
                setFlowData(fd);
                setSavedSnapshot(JSON.stringify(fd));
                setStep(2);
            } else {
                const fd = defaultFlowData();
                setFlowData(fd);
                setSavedSnapshot(JSON.stringify(fd));
                setStep(0);
            }
        }
    }, [isOpen, editAutomation]);

    const updateData = useCallback((patch: Partial<AutomationFlowData>) =>
        setFlowData(prev => ({ ...prev, ...patch })), []);

    const handleBack = () => setStep(s => {
        // Non-comment types skip the post-picker, so back from configure → type select
        if (s === 2 && flowData.type !== "comment-dm") return 0;
        return Math.max(s - 1, 0);
    });

    // Attempt close — show confirmation if dirty
    const handleClose = () => {
        if (isDirty && step >= 2) {
            setShowConfirm(true);
        } else {
            onClose();
        }
    };

    const buildPayload = (isActive: boolean | null) => {
        const typeMap: Record<string, "comment_dm" | "dm_reply" | "story_reply"> = {
            "comment-dm": "comment_dm",
            "dm-reply": "dm_reply",
            "story-reply": "story_reply",
        };
        const dbType = typeMap[flowData.type ?? ""] ?? "comment_dm";
        return {
            name: flowData.name,
            type: dbType,
            isActive: isActive ?? true,
            postId: flowData.postId === "all" ? null : flowData.postId,
            postThumbnailUrl: flowData.postThumbnailUrl ?? null,
            postCaption: flowData.postCaption ?? null,
            keywords: !flowData.keywordsAnyMode && flowData.keywords.length > 0 ? flowData.keywords : null,
            commentReplyOptions: flowData.customReplies,
            dmOpeningMessageEnabled: flowData.isAutoDmEnabled && flowData.dmOpeningMessageEnabled,
            dmOpeningMessage: flowData.dmOpeningMessage,
            dmOpeningMessageButtonTitle: flowData.dmOpeningMessageButtonTitle || null,
            dmOpeningMessageButtonLink: null, // Quick reply — no link
            askToFollowEnabled: flowData.askToFollowEnabled,
            askToFollowMessage: flowData.askToFollowMessage,
            askToFollowVisitProfileButton: flowData.askToFollowVisitProfileButton,
            askToFollowConfirmButton: flowData.askToFollowConfirmButton,
            dmResponses: flowData.dmResponses,
        };
    };

    const handleSave = (activate: boolean) => {
        setActivateError(null);
        setPendingAction(activate ? 'activate' : 'save');

        if (isEditMode && editAutomation) {
            const { name, commentReplyOptions, dmOpeningMessageEnabled, dmOpeningMessage, dmOpeningMessageButtonTitle,
                askToFollowEnabled, askToFollowMessage, askToFollowVisitProfileButton,
                askToFollowConfirmButton, dmResponses, keywords, postThumbnailUrl, postCaption } = buildPayload(null);
            updateMutation.mutate({
                id: editAutomation.id,
                is_active: activate ? true : editAutomation.is_active,
                name,
                keywords,
                comment_reply_options: commentReplyOptions,
                dm_opening_message_enabled: dmOpeningMessageEnabled,
                dm_opening_message: dmOpeningMessage,
                dm_opening_message_button_title: dmOpeningMessageButtonTitle ?? null,
                dm_opening_message_button_link: null,
                post_thumbnail_url: postThumbnailUrl ?? null,
                post_caption: postCaption ?? null,
                ask_to_follow_enabled: askToFollowEnabled,
                ask_to_follow_message: askToFollowMessage,
                ask_to_follow_visit_profile_button: askToFollowVisitProfileButton,
                ask_to_follow_confirm_button: askToFollowConfirmButton,
                dm_responses: dmResponses,
            }, {
                onSuccess: () => {
                    setPendingAction(null);
                    setSavedSnapshot(JSON.stringify(flowData));
                    onClose();
                },
                onError: (err) => { setPendingAction(null); setActivateError(err.message); },
            });
        } else {
            if (!firstAccountId) {
                setPendingAction(null);
                setActivateError("Connect an Instagram account first in Settings.");
                return;
            }
            createMutation.mutate(
                { instagramAccountId: firstAccountId, ...buildPayload(activate) },
                {
                    onSuccess: () => {
                        setPendingAction(null);
                        setSavedSnapshot(JSON.stringify(flowData));
                        onClose();
                    },
                    onError: (err) => { setPendingAction(null); setActivateError(err.message); },
                }
            );
        }
    };

    const isSaving = pendingAction === 'save' && (createMutation.isPending || updateMutation.isPending);
    const isActivating = pendingAction === 'activate' && (createMutation.isPending || updateMutation.isPending);
    const isPending = isSaving || isActivating;

    const stepTitle = step === 0 ? "New Automation"
        : step === 1 ? "Select Post"
        : isEditMode ? `Edit — ${flowData.name}` : flowData.name || "Configure";

    // Determine whether the configure step's "Next/Activate" button is enabled
    const configureValid = flowData.keywords.length > 0 || !!(flowData.keywords.length === 0 && !flowData.type?.includes("comment"));

    return (
        <AnimatePresence>
            {isOpen && (
                <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
                    {/* Backdrop */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="absolute inset-0 bg-background/70 backdrop-blur-md"
                        onClick={handleClose}
                    />

                    {/* Modal */}
                    <motion.div
                        initial={{ opacity: 0, scale: 0.97, y: 16 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.97, y: 16 }}
                        transition={{ type: "spring", damping: 28, stiffness: 280 }}
                        className="relative w-full h-full max-w-[96vw] lg:max-w-7xl max-h-[92vh] bg-background border border-border rounded-3xl shadow-2xl flex flex-col overflow-hidden z-10"
                    >
                        {/* Header */}
                        <div className="h-[56px] shrink-0 border-b border-border flex items-center justify-between px-5 gap-4 bg-muted/20">
                            <div className="flex items-center gap-3 min-w-0">
                                <span className="font-bold text-sm text-foreground truncate">{stepTitle}</span>
                            </div>

                            <div className="flex items-center gap-2 shrink-0">
                                {step > 0 && (
                                    <button onClick={handleBack} className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted-foreground hover:text-foreground hover:bg-muted px-3 py-1.5 rounded-xl transition-colors">
                                        <ArrowLeft className="w-3.5 h-3.5" /> Back
                                    </button>
                                )}

                                {step === 2 && (
                                    <>
                                        {activateError && (
                                            <span className="text-xs text-destructive font-medium max-w-[260px] break-words leading-snug">{activateError}</span>
                                        )}
                                        <button
                                            disabled={isPending}
                                            onClick={() => handleSave(false)}
                                            className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted-foreground bg-muted/60 hover:bg-muted border border-border disabled:opacity-50 px-4 py-1.5 rounded-xl transition-all"
                                        >
                                            {isSaving ? (
                                                <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                                            ) : null}
                                            {isSaving ? "Saving..." : "Save Changes"}
                                        </button>
                                        <button
                                            disabled={isPending || (!isEditMode && !firstAccountId)}
                                            onClick={() => handleSave(true)}
                                            className="inline-flex items-center gap-1.5 text-sm font-bold bg-emerald-500 text-white hover:bg-emerald-600 disabled:opacity-60 disabled:cursor-not-allowed px-4 py-1.5 rounded-xl shadow-sm transition-all"
                                        >
                                            {isActivating ? (
                                                <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                                            ) : (
                                                <Check className="w-3.5 h-3.5" />
                                            )}
                                            {isActivating ? "Activating..." : "Activate"}
                                        </button>
                                    </>
                                )}

                                <div className="w-px h-5 bg-border mx-1" />
                                <button onClick={handleClose} className="p-1.5 hover:bg-muted text-muted-foreground hover:text-foreground rounded-lg transition-colors">
                                    <X className="w-4 h-4" />
                                </button>
                            </div>
                        </div>

                        {/* Content */}
                        <div className="flex-1 overflow-hidden">
                            <AnimatePresence mode="wait">
                                <motion.div
                                    key={step}
                                    initial={{ opacity: 0, x: 10 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    exit={{ opacity: 0, x: -10 }}
                                    transition={{ duration: 0.18, ease: "easeOut" }}
                                    className="w-full h-full"
                                >
                                    {step === 0 && (
                                        <SelectTypeStep
                                            onSelect={(type: string) => {
                                                if (type === "comment-dm") {
                                                    updateData({ type });
                                                    setStep(1);
                                                } else {
                                                    // DM / story triggers have no post target — go straight to configure
                                                    updateData({ type, postId: "all", postThumbnailUrl: null, postCaption: "" });
                                                    setStep(2);
                                                }
                                            }}
                                            selectedType={flowData.type}
                                        />
                                    )}
                                    {step === 1 && (
                                        <SelectPostStep
                                            onSelect={(postId, name, thumbnailUrl, caption) => {
                                                updateData({ postId, name, postThumbnailUrl: thumbnailUrl, postCaption: caption });
                                                setStep(2);
                                            }}
                                            selectedPost={flowData.postId}
                                            flowName={flowData.name}
                                            instagramAccountId={firstAccountId}
                                        />
                                    )}
                                    {step === 2 && (
                                        <ConfigureStep
                                            data={flowData}
                                            onUpdate={updateData}
                                            creatorProfilePicUrl={igAccounts?.[0]?.profile_picture_url ?? null}
                                        />
                                    )}
                                </motion.div>
                            </AnimatePresence>
                        </div>

                        {/* Unsaved-changes confirmation overlay */}
                        <AnimatePresence>
                            {showConfirm && (
                                <motion.div
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    exit={{ opacity: 0 }}
                                    className="absolute inset-0 z-20 flex items-center justify-center bg-background/80 backdrop-blur-sm"
                                >
                                    <motion.div
                                        initial={{ scale: 0.95, y: 8 }}
                                        animate={{ scale: 1, y: 0 }}
                                        exit={{ scale: 0.95, y: 8 }}
                                        className="bg-card border border-border rounded-2xl p-6 max-w-sm w-full mx-4 shadow-2xl"
                                    >
                                        <div className="flex items-center gap-3 mb-4">
                                            <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center shrink-0">
                                                <AlertTriangle className="w-5 h-5 text-amber-500" />
                                            </div>
                                            <div>
                                                <p className="font-bold text-foreground">Unsaved changes</p>
                                                <p className="text-sm text-muted-foreground">Your changes haven't been saved.</p>
                                            </div>
                                        </div>
                                        <div className="flex gap-3">
                                            <button
                                                onClick={() => setShowConfirm(false)}
                                                className="flex-1 py-2.5 rounded-xl border border-border text-sm font-semibold hover:bg-muted transition-colors"
                                            >
                                                Keep editing
                                            </button>
                                            <button
                                                onClick={() => { setShowConfirm(false); onClose(); }}
                                                className="flex-1 py-2.5 rounded-xl bg-destructive text-white text-sm font-bold hover:bg-destructive/90 transition-colors"
                                            >
                                                Discard & close
                                            </button>
                                        </div>
                                    </motion.div>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
}

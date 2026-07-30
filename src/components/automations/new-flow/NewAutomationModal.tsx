"use client";

import { motion, AnimatePresence } from "framer-motion";
import { X, ArrowLeft, Check, AlertTriangle, Loader2 } from "lucide-react";
import { useState, useEffect, useCallback } from "react";

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
    postThumbnailUrl?: string | null;
    postCaption?: string;
    keywords: string[];
    keywordsAnyMode: boolean;
    customReplies: string[];
    isAutoDmEnabled: boolean;
    dmOpeningMessageEnabled: boolean;
    dmOpeningMessage: string;
    dmOpeningMessageButtonTitle: string;
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

const DEFAULT_NAMES: Record<string, string> = {
    "comment-dm": "Comment funnel",
    "dm-reply": "DM keyword reply",
    "story-reply": "Story reply funnel",
};

const defaultFlowData = (): AutomationFlowData => ({
    name: "New automation",
    type: null,
    postId: null,
    postThumbnailUrl: null,
    postCaption: "",
    keywords: [],
    keywordsAnyMode: false,
    customReplies: ["Sent! 🚀", "Check your DMs 📬", "Got it, check your inbox! ✉️"],
    isAutoDmEnabled: true,
    dmOpeningMessageEnabled: true,
    dmOpeningMessage: "Hey there!\n\nI'm so happy you're here, thank you so much for your interest 🥰\n\nClick below and I'll send you the link in just a sec ✨",
    dmOpeningMessageButtonTitle: "Send me the link",
    askToFollowEnabled: false,
    askToFollowMessage: "Hey! It seems you're not following me yet 😊",
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

    const handleTypeSelect = (type: string) => {
        const name = flowData.name === "New automation" ? (DEFAULT_NAMES[type] ?? flowData.name) : flowData.name;
        if (type === "comment-dm") {
            updateData({ type, name });
            setStep(1);
        } else {
            // DM / story triggers have no post target - straight to configure
            updateData({ type, name, postId: "all", postThumbnailUrl: null, postCaption: "" });
            setStep(2);
        }
    };

    const handleBack = () => setStep(s => {
        if (s === 2 && flowData.type !== "comment-dm") return 0;
        return Math.max(s - 1, 0);
    });

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
        const isComment = dbType === "comment_dm";
        return {
            name: flowData.name,
            type: dbType,
            isActive: isActive ?? true,
            postId: !isComment || flowData.postId === "all" ? null : flowData.postId,
            postThumbnailUrl: isComment ? flowData.postThumbnailUrl ?? null : null,
            postCaption: isComment ? flowData.postCaption ?? null : null,
            keywords: !flowData.keywordsAnyMode && flowData.keywords.length > 0 ? flowData.keywords : null,
            // Public comment replies only exist for comment automations
            commentReplyOptions: isComment ? flowData.customReplies : [],
            dmOpeningMessageEnabled: flowData.isAutoDmEnabled && flowData.dmOpeningMessageEnabled,
            dmOpeningMessage: flowData.dmOpeningMessage,
            dmOpeningMessageButtonTitle: flowData.dmOpeningMessageButtonTitle || null,
            dmOpeningMessageButtonLink: null,
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

    const stepTitle = step === 0 ? "New automation"
        : step === 1 ? "Choose a post"
        : isEditMode ? `Edit - ${flowData.name}` : flowData.name || "Configure";

    return (
        <AnimatePresence>
            {isOpen && (
                <div className="fixed inset-0 z-[200] flex items-center justify-center p-3">
                    {/* Backdrop */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
                        onClick={handleClose}
                    />

                    {/* Modal */}
                    <motion.div
                        initial={{ opacity: 0, scale: 0.98, y: 12 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.98, y: 12 }}
                        transition={{ type: "spring", damping: 30, stiffness: 300 }}
                        className="relative w-full h-full max-w-[96vw] lg:max-w-6xl max-h-[92vh] bg-background border border-border rounded-xl shadow-2xl flex flex-col overflow-hidden z-10"
                    >
                        {/* The warm thread - top edge */}
                        <div className="h-[2px] w-full ig-thread shrink-0" />

                        {/* Header */}
                        <div className="h-12 shrink-0 border-b border-border flex items-center justify-between px-4 gap-3">
                            <span className="text-[13px] font-semibold text-foreground truncate">{stepTitle}</span>

                            <div className="flex items-center gap-1.5 shrink-0">
                                {step > 0 && (
                                    <button onClick={handleBack} className="inline-flex items-center gap-1 h-8 px-2.5 text-[13px] font-medium text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors">
                                        <ArrowLeft className="w-3.5 h-3.5" /> Back
                                    </button>
                                )}

                                {step === 2 && (
                                    <>
                                        {activateError && (
                                            <span className="text-[12px] text-destructive font-medium max-w-[240px] truncate flex items-center gap-1">
                                                <AlertTriangle className="w-3 h-3 shrink-0" />{activateError}
                                            </span>
                                        )}
                                        <button
                                            disabled={isPending}
                                            onClick={() => handleSave(false)}
                                            className="inline-flex items-center gap-1.5 h-8 px-3 text-[13px] font-medium text-foreground border border-border hover:bg-muted disabled:opacity-50 rounded-lg transition-colors"
                                        >
                                            {isSaving && <Loader2 className="w-3 h-3 animate-spin" />}
                                            {isSaving ? "Saving…" : "Save"}
                                        </button>
                                        <button
                                            disabled={isPending || (!isEditMode && !firstAccountId)}
                                            onClick={() => handleSave(true)}
                                            className="inline-flex items-center gap-1.5 h-8 px-3 text-[13px] font-semibold bg-foreground text-background hover:opacity-90 disabled:opacity-50 rounded-lg transition-opacity"
                                        >
                                            {isActivating ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                                            {isActivating ? "Activating…" : "Activate"}
                                        </button>
                                    </>
                                )}

                                <div className="w-px h-4 bg-border mx-0.5" />
                                <button onClick={handleClose} className="p-1.5 hover:bg-muted text-muted-foreground hover:text-foreground rounded-md transition-colors">
                                    <X className="w-4 h-4" />
                                </button>
                            </div>
                        </div>

                        {/* Content */}
                        <div className="flex-1 overflow-hidden">
                            <AnimatePresence mode="wait">
                                <motion.div
                                    key={step}
                                    initial={{ opacity: 0, x: 8 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    exit={{ opacity: 0, x: -8 }}
                                    transition={{ duration: 0.15, ease: "easeOut" }}
                                    className="w-full h-full"
                                >
                                    {step === 0 && (
                                        <SelectTypeStep
                                            onSelect={handleTypeSelect}
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

                        {/* Unsaved-changes confirmation */}
                        <AnimatePresence>
                            {showConfirm && (
                                <motion.div
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    exit={{ opacity: 0 }}
                                    className="absolute inset-0 z-20 flex items-center justify-center bg-background/70 backdrop-blur-sm"
                                >
                                    <motion.div
                                        initial={{ scale: 0.97, y: 6 }}
                                        animate={{ scale: 1, y: 0 }}
                                        exit={{ scale: 0.97, y: 6 }}
                                        className="bg-card border border-border rounded-xl p-5 max-w-sm w-full mx-4 shadow-xl"
                                    >
                                        <div className="flex items-center gap-3 mb-4">
                                            <div className="w-8 h-8 rounded-lg bg-amber-500/10 flex items-center justify-center shrink-0">
                                                <AlertTriangle className="w-4 h-4 text-amber-500" />
                                            </div>
                                            <div>
                                                <p className="text-[13.5px] font-semibold text-foreground">Unsaved changes</p>
                                                <p className="text-[12.5px] text-muted-foreground">Your edits haven&apos;t been saved.</p>
                                            </div>
                                        </div>
                                        <div className="flex gap-2">
                                            <button
                                                onClick={() => setShowConfirm(false)}
                                                className="flex-1 h-9 rounded-lg border border-border text-[13px] font-medium hover:bg-muted transition-colors"
                                            >
                                                Keep editing
                                            </button>
                                            <button
                                                onClick={() => { setShowConfirm(false); onClose(); }}
                                                className="flex-1 h-9 rounded-lg bg-destructive text-white text-[13px] font-semibold hover:bg-destructive/90 transition-colors"
                                            >
                                                Discard
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

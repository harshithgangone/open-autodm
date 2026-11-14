"use client";

import { motion, AnimatePresence } from "framer-motion";
import { X, ArrowLeft, ArrowRight, Check, AlertTriangle, Loader2, Sparkles, CheckCircle2 } from "lucide-react";
import { useState, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";

import { Step1Setup } from "./steps/Step1Setup";
import { Step2TriggerRules } from "./steps/Step2TriggerRules";
import { Step3DMMessage } from "./steps/Step3DMMessage";
import { Step4ReviewSave } from "./steps/Step4ReviewSave";
import { useInstagramAccounts } from "@/hooks/useInstagramAccounts";
import { useCreateAutomation, useUpdateAutomation } from "@/hooks/useAutomations";
import type { AutomationFromDB } from "@/hooks/useAutomations";
import type { FlowGraph } from "@/lib/types";
import { automationToFlowGraph, hasComplexBranches } from "@/lib/automation/flowGraph";
import { cn } from "@/lib/utils";

interface NewAutomationModalProps {
    isOpen: boolean;
    onClose: () => void;
    editAutomation?: AutomationFromDB | null;
    /** The account this automation belongs to (the sidebar's active account). */
    accountId?: string | null;
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
    buttons?: CardButton[];
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
    excludedKeywords?: string[];
    customReplies: string[];
    publicReplyEnabled: boolean;
    publicReplyMode: 'manual' | 'ai_generated';
    publicReplyOptions: string[];
    publicReplyAiInstructions: string;
    isAutoDmEnabled: boolean;
    dmOpeningMessageEnabled: boolean;
    dmOpeningMessage: string;
    dmOpeningMessageVariations: string[];
    dmOpeningMessageButtonTitle: string;
    askToFollowEnabled: boolean;
    askToFollowMessage: string;
    askToFollowVisitProfileButton: string;
    askToFollowConfirmButton: string;
    dmResponses: DMResponse[];
    followUpEnabled: boolean;
    followUpDelayMinutes: number;
    followUpMessage: string;
    followUpAiInstructions: string;
    aiRuntimeModeEnabled: boolean;
    aiRuntimeInstructions: string;
    aiModel: string;
    flowGraph?: FlowGraph | null;
};

const DB_TYPE_TO_FLOW: Record<string, string> = {
    comment_dm: "comment-dm",
    dm_reply: "dm-reply",
    story_reply: "story-reply",
    reel_dm: "reel-dm",
};

const DEFAULT_NAMES: Record<string, string> = {
    "comment-dm": "Comment Funnel",
    "dm-reply": "Direct Message Keyword",
    "story-reply": "Story Reply Funnel",
    "reel-dm": "Shared Reel Funnel",
};

const defaultFlowData = (): AutomationFlowData => ({
    name: "New Automation",
    type: "comment-dm",
    postId: "all",
    postThumbnailUrl: null,
    postCaption: "",
    keywords: ["LINK"],
    keywordsAnyMode: false,
    excludedKeywords: [],
    customReplies: ["Sent! 🚀", "Check your DMs 📬", "Got it, check your inbox! ✉️"],
    publicReplyEnabled: false,
    publicReplyMode: "manual",
    publicReplyOptions: [
        "Sent you a DM! Check your requests 📥",
        "Check your inbox! Just sent it over ✨",
        "Just messaged you the link! 🚀",
        "Sent to your DMs! Let me know if you got it 📬",
        "All sent! Check your message requests 🙌",
    ],
    publicReplyAiInstructions: "",
    isAutoDmEnabled: true,
    dmOpeningMessageEnabled: true,
    dmOpeningMessage: "Hey {username}!\n\nThanks for reaching out! Here is what you requested: 👇",
    dmOpeningMessageVariations: [
        "Hey {username}! Thanks so much for reaching out! Here is the link you requested: 👇",
        "Thanks for your comment, {username}! Super excited to share this with you ✨",
        "Hey {username}! Really appreciate your interest! Here is everything you need 🚀",
    ],
    dmOpeningMessageButtonTitle: "",
    askToFollowEnabled: false,
    askToFollowMessage: "Hey! It seems you're not following me yet 😊",
    askToFollowVisitProfileButton: "Visit Profile",
    askToFollowConfirmButton: "I'm following ✅",
    dmResponses: [
        {
            id: "resp_1",
            type: "text",
            content: "Hey {username}!\n\nThanks for reaching out! Here is what you requested: 👇",
            buttons: [],
        },
    ],
    followUpEnabled: false,
    followUpDelayMinutes: 60,
    followUpMessage: "Hey {username}, did you get a chance to check the details I sent you?",
    followUpAiInstructions: "",
    aiRuntimeModeEnabled: false,
    aiRuntimeInstructions: "Act as a friendly, helpful assistant answering questions about our product or guide concisely.",
    aiModel: "@cf/meta/llama-3.2-3b-instruct",
});

function automationToFlowData(automation: AutomationFromDB): AutomationFlowData {
    const defaults = defaultFlowData();
    const rawKeywords = automation.keywords ?? [];
    const isAnyMode =
        (automation as any).trigger_config?.trigger_mode === 'any' ||
        (automation as any).trigger_config?.keywords_any_mode === true ||
        ((automation as any).flow_graph?.nodes?.find((n: any) => n.type === 'trigger')?.data?.keywordsAnyMode === true) ||
        (Array.isArray(automation.keywords) &&
            automation.keywords.some((k) => typeof k === 'string' && (k.trim().toUpperCase() === '*ANY*' || k.trim().toUpperCase() === '__ANY__')));

    const existingButtons =
        automation.dm_responses?.[0]?.buttons ||
        (automation.dm_opening_message_button_title
            ? [{ id: "btn_1", title: automation.dm_opening_message_button_title, link: automation.dm_opening_message_button_link || "https://" }]
            : []);

    const firstResponse: DMResponse = {
        id: automation.dm_responses?.[0]?.id || "resp_1",
        type: (automation.dm_responses?.[0]?.type as any) || "text",
        content: automation.dm_opening_message || defaults.dmOpeningMessage,
        buttons: existingButtons,
    };

    const remainingResponses = Array.isArray(automation.dm_responses) && automation.dm_responses.length > 1
        ? (automation.dm_responses.slice(1) as DMResponse[])
        : [];

    const dmResponses: DMResponse[] = [firstResponse, ...remainingResponses];

    return {
        name: automation.name,
        type: DB_TYPE_TO_FLOW[automation.type] ?? automation.type,
        postId: automation.post_id ?? "all",
        postThumbnailUrl: automation.post_thumbnail_url ?? null,
        postCaption: automation.post_caption ?? "",
        keywords: isAnyMode ? [] : rawKeywords,
        keywordsAnyMode: isAnyMode,
        excludedKeywords: (automation as any).trigger_config?.excluded_keywords ?? [],
        customReplies: automation.comment_reply_options?.length > 0
            ? automation.comment_reply_options
            : defaults.customReplies,
        publicReplyEnabled: automation.public_reply_enabled ?? false,
        publicReplyMode: automation.public_reply_mode ?? "manual",
        publicReplyOptions: (automation.public_reply_options && automation.public_reply_options.length > 0)
            ? automation.public_reply_options
            : (automation.comment_reply_options?.length > 0 ? automation.comment_reply_options : defaults.publicReplyOptions),
        publicReplyAiInstructions: automation.public_reply_ai_instructions ?? "",
        isAutoDmEnabled: automation.dm_opening_message_enabled,
        dmOpeningMessageEnabled: automation.dm_opening_message_enabled,
        dmOpeningMessage: automation.dm_opening_message || defaults.dmOpeningMessage,
        dmOpeningMessageVariations: (automation.dm_opening_message_variations && automation.dm_opening_message_variations.length > 0)
            ? automation.dm_opening_message_variations
            : (automation.dm_opening_message ? [automation.dm_opening_message] : defaults.dmOpeningMessageVariations),
        dmOpeningMessageButtonTitle: automation.dm_opening_message_button_title ?? defaults.dmOpeningMessageButtonTitle,
        askToFollowEnabled: automation.ask_to_follow_enabled,
        askToFollowMessage: automation.ask_to_follow_message || defaults.askToFollowMessage,
        askToFollowVisitProfileButton: automation.ask_to_follow_visit_profile_button || defaults.askToFollowVisitProfileButton,
        askToFollowConfirmButton: automation.ask_to_follow_confirm_button || defaults.askToFollowConfirmButton,
        dmResponses,
        followUpEnabled: automation.follow_up_enabled ?? false,
        followUpDelayMinutes: automation.follow_up_delay_minutes ?? 60,
        followUpMessage: automation.follow_up_message || defaults.followUpMessage,
        followUpAiInstructions: automation.follow_up_ai_instructions ?? "",
        aiRuntimeModeEnabled: automation.ai_runtime_mode_enabled ?? false,
        aiRuntimeInstructions: automation.ai_runtime_instructions ?? defaults.aiRuntimeInstructions,
        aiModel: automation.ai_model ?? defaults.aiModel,
        flowGraph: (automation as any).flow_graph ?? null,
    };
}

const WIZARD_STEPS = [
    { num: 1, label: "Setup & Target" },
    { num: 2, label: "Trigger Rules" },
    { num: 3, label: "DM Message" },
    { num: 4, label: "Review & Launch" },
];

export function NewAutomationModal({ isOpen, onClose, editAutomation, accountId }: NewAutomationModalProps) {
    const isEditMode = !!editAutomation;

    const [mounted, setMounted] = useState(false);
    const [step, setStep] = useState(0); // 0, 1, 2, 3
    const [flowData, setFlowData] = useState<AutomationFlowData>(defaultFlowData());
    const [savedSnapshot, setSavedSnapshot] = useState<string>("");
    const [showConfirm, setShowConfirm] = useState(false);
    const [showActivationConfirm, setShowActivationConfirm] = useState(false);
    const [validationError, setValidationError] = useState<string | null>(null);
    const [saveError, setSaveError] = useState<string | null>(null);
    const [pendingAction, setPendingAction] = useState<'save' | 'activate' | null>(null);

    const { data: igAccounts } = useInstagramAccounts();
    const activeAccount = igAccounts?.find((a) => a.id === accountId) ?? igAccounts?.[0] ?? null;
    const firstAccountId = activeAccount?.id ?? null;
    const createMutation = useCreateAutomation();
    const updateMutation = useUpdateAutomation();

    const isDirty = JSON.stringify(flowData) !== savedSnapshot;

    useEffect(() => {
        setMounted(true);
    }, []);

    // Prevent background scrolling while modal is open
    useEffect(() => {
        if (!isOpen) return;
        const originalOverflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        return () => {
            document.body.style.overflow = originalOverflow;
        };
    }, [isOpen]);

    // Handle Escape key
    useEffect(() => {
        if (!isOpen) return;
        const onKey = (e: KeyboardEvent): void => {
            if (e.key === "Escape") {
                if (isDirty) {
                    setShowConfirm(true);
                } else {
                    onClose();
                }
            }
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [isOpen, isDirty, onClose]);

    // Initialize or reset flow state when opened
    useEffect(() => {
        if (isOpen) {
            setSaveError(null);
            setValidationError(null);
            setShowConfirm(false);
            setPendingAction(null);
            if (editAutomation) {
                const fd = automationToFlowData(editAutomation);
                setFlowData(fd);
                setSavedSnapshot(JSON.stringify(fd));
                setStep(0);
            } else {
                const fd = defaultFlowData();
                setFlowData(fd);
                setSavedSnapshot(JSON.stringify(fd));
                setStep(0);
            }
        }
    }, [isOpen, editAutomation]);

    const updateData = useCallback((patch: Partial<AutomationFlowData>) => {
        setFlowData((prev) => ({ ...prev, ...patch }));
        setValidationError(null);
    }, []);

    // Validate step before advancing
    const validateStep = (currentStep: number): string | null => {
        if (currentStep === 0) {
            if (!flowData.name.trim()) {
                return "Please enter a name for your automation.";
            }
            const isComment = !flowData.type || flowData.type === "comment-dm" || flowData.type === "comment_dm";
            if (isComment && flowData.postId !== "all" && !flowData.postId) {
                return "Please choose 'All Posts & Reels' or pick a specific post.";
            }
            const isReel = flowData.type === "reel-dm" || flowData.type === "reel_dm";
            if (isReel && flowData.postId && flowData.postId !== "all" && !flowData.postId.trim()) {
                return "Please provide a valid Reel ID or URL, or choose 'Any shared Reel'.";
            }
        }

        if (currentStep === 1) {
            const isComment = !flowData.type || flowData.type === "comment-dm" || flowData.type === "comment_dm";
            const isReel = flowData.type === "reel-dm" || flowData.type === "reel_dm";

            if (!isReel && !flowData.keywordsAnyMode && (!flowData.keywords || flowData.keywords.length === 0)) {
                return "Please add at least one trigger keyword or enable 'Reply to any comment'.";
            }
            if (isReel && !flowData.keywordsAnyMode && (!flowData.keywords || flowData.keywords.length === 0)) {
                return "Please add at least one keyword or choose 'Any Reel Share'.";
            }
        }

        if (currentStep === 2) {
            if (!flowData.dmOpeningMessage.trim()) {
                return "Please write your primary DM message.";
            }
            const buttons = flowData.dmResponses[0]?.buttons || [];
            for (let i = 0; i < buttons.length; i++) {
                const b = buttons[i];
                if (!b) continue;
                if (!b.title.trim()) {
                    return `Button ${i + 1} is missing a title.`;
                }
                if (!b.link.trim() || (!b.link.startsWith("https://") && !b.link.startsWith("http://"))) {
                    return `Button ${i + 1} destination URL must start with https://`;
                }
            }
        }

        return null;
    };

    const handleNext = () => {
        const error = validateStep(step);
        if (error) {
            setValidationError(error);
            return;
        }
        setValidationError(null);
        setStep((s) => Math.min(s + 1, 3));
    };

    const handleBack = () => {
        setValidationError(null);
        setStep((s) => Math.max(s - 1, 0));
    };

    const handleJumpToStep = (targetStep: number) => {
        if (targetStep < step) {
            setValidationError(null);
            setStep(targetStep);
        } else if (targetStep > step) {
            const error = validateStep(step);
            if (error) {
                setValidationError(error);
                return;
            }
            setValidationError(null);
            setStep(targetStep);
        }
    };

    const handleClose = () => {
        if (isDirty) {
            setShowConfirm(true);
        } else {
            onClose();
        }
    };

    const buildPayload = (isActive: boolean | null) => {
        const typeMap: Record<string, "comment_dm" | "dm_reply" | "story_reply" | "reel_dm"> = {
            "comment-dm": "comment_dm",
            "dm-reply": "dm_reply",
            "story-reply": "story_reply",
            "reel-dm": "reel_dm",
        };
        const dbType = typeMap[flowData.type ?? ""] ?? "comment_dm";
        const isComment = dbType === "comment_dm";
        const isReel = dbType === "reel_dm";

        // Preserve legacy complex graphs, or compile new canonical graph
        const isLegacyComplex = hasComplexBranches(flowData.flowGraph);
        const canonicalGraph = isLegacyComplex && flowData.flowGraph
            ? flowData.flowGraph
            : automationToFlowGraph(flowData);

        const isReelWildcard = isReel && (flowData.keywordsAnyMode || (!flowData.keywords || flowData.keywords.length === 0));
        const effectiveAnyMode = flowData.keywordsAnyMode || isReelWildcard;

        const triggerConfig: Record<string, any> = {
            trigger_mode: effectiveAnyMode ? "any" : "keywords",
            keywords_any_mode: effectiveAnyMode,
            ...(flowData.excludedKeywords && flowData.excludedKeywords.length > 0
                ? { excluded_keywords: flowData.excludedKeywords }
                : {}),
        };

        const buttons: CardButton[] = flowData.dmResponses[0]?.buttons || [];
        const primaryButton = buttons[0];

        return {
            name: flowData.name,
            type: dbType,
            isActive: isActive ?? true,
            postId: (isComment || isReel) ? (flowData.postId === "all" ? null : flowData.postId) : null,
            postThumbnailUrl: isComment ? flowData.postThumbnailUrl ?? null : null,
            postCaption: isComment ? flowData.postCaption ?? null : null,
            keywords: effectiveAnyMode
                ? ["*ANY*"]
                : (flowData.keywords.length > 0 ? flowData.keywords : null),
            triggerConfig,
            commentReplyOptions: isComment ? (flowData.publicReplyOptions.length > 0 ? flowData.publicReplyOptions : flowData.customReplies) : [],
            publicReplyEnabled: isComment ? flowData.publicReplyEnabled : false,
            publicReplyMode: flowData.publicReplyMode,
            publicReplyOptions: isComment ? flowData.publicReplyOptions : [],
            publicReplyAiInstructions: isComment ? flowData.publicReplyAiInstructions : null,
            dmOpeningMessageEnabled: flowData.isAutoDmEnabled && flowData.dmOpeningMessageEnabled,
            dmOpeningMessage: flowData.dmOpeningMessage,
            dmOpeningMessageVariations: flowData.dmOpeningMessageVariations,
            dmOpeningMessageButtonTitle: primaryButton?.title || flowData.dmOpeningMessageButtonTitle || null,
            dmOpeningMessageButtonLink: primaryButton?.link || null,
            askToFollowEnabled: flowData.askToFollowEnabled,
            askToFollowMessage: flowData.askToFollowMessage,
            askToFollowVisitProfileButton: flowData.askToFollowVisitProfileButton,
            askToFollowConfirmButton: flowData.askToFollowConfirmButton,
            dmResponses: flowData.dmResponses,
            followUpEnabled: flowData.followUpEnabled,
            followUpDelayMinutes: flowData.followUpDelayMinutes,
            followUpMessage: flowData.followUpMessage,
            followUpAiInstructions: flowData.followUpAiInstructions || null,
            aiRuntimeModeEnabled: flowData.aiRuntimeModeEnabled,
            aiRuntimeInstructions: flowData.aiRuntimeInstructions || null,
            aiModel: flowData.aiModel,
            flowGraph: canonicalGraph,
        };
    };

    const handleSave = (activate: boolean, confirmedActivation = false) => {
        if (isPending) return;
        setSaveError(null);
        setValidationError(null);

        // Validate all steps before final save
        for (let s = 0; s < 3; s++) {
            const err = validateStep(s);
            if (err) {
                setStep(s);
                setValidationError(err);
                return;
            }
        }

        // Activating can send real messages. Require explicit confirmation for
        // both new automations and edits before issuing any activation request.
        if (activate && !confirmedActivation) {
            setShowActivationConfirm(true);
            return;
        }
        setShowActivationConfirm(false);

        setPendingAction(activate ? 'activate' : 'save');

        if (isEditMode && editAutomation) {
            const payload = buildPayload(activate);
            updateMutation.mutate({
                id: editAutomation.id,
                is_active: payload.isActive,
                name: payload.name,
                type: payload.type,
                post_id: payload.postId,
                keywords: payload.keywords,
                trigger_config: payload.triggerConfig,
                comment_reply_options: payload.commentReplyOptions,
                public_reply_enabled: payload.publicReplyEnabled,
                public_reply_mode: payload.publicReplyMode,
                public_reply_options: payload.publicReplyOptions,
                public_reply_ai_instructions: payload.publicReplyAiInstructions,
                dm_opening_message_enabled: payload.dmOpeningMessageEnabled,
                dm_opening_message: payload.dmOpeningMessage,
                dm_opening_message_variations: payload.dmOpeningMessageVariations,
                dm_opening_message_button_title: payload.dmOpeningMessageButtonTitle,
                dm_opening_message_button_link: payload.dmOpeningMessageButtonLink,
                post_thumbnail_url: payload.postThumbnailUrl,
                post_caption: payload.postCaption,
                ask_to_follow_enabled: payload.askToFollowEnabled,
                ask_to_follow_message: payload.askToFollowMessage,
                ask_to_follow_visit_profile_button: payload.askToFollowVisitProfileButton,
                ask_to_follow_confirm_button: payload.askToFollowConfirmButton,
                dm_responses: payload.dmResponses,
                follow_up_enabled: payload.followUpEnabled,
                follow_up_delay_minutes: payload.followUpDelayMinutes,
                follow_up_message: payload.followUpMessage,
                follow_up_ai_instructions: payload.followUpAiInstructions,
                ai_runtime_mode_enabled: payload.aiRuntimeModeEnabled,
                ai_runtime_instructions: payload.aiRuntimeInstructions,
                ai_model: payload.aiModel,
                flow_graph: payload.flowGraph,
            }, {
                onSuccess: () => {
                    setPendingAction(null);
                    setSavedSnapshot(JSON.stringify(flowData));
                    onClose();
                },
                onError: (err) => {
                    setPendingAction(null);
                    setSaveError(err.message);
                },
            });
        } else {
            if (!firstAccountId) {
                setPendingAction(null);
                setSaveError("Connect an Instagram account first in Settings.");
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
                    onError: (err) => {
                        setPendingAction(null);
                        setSaveError(err.message);
                    },
                }
            );
        }
    };

    const isSaving = pendingAction === 'save' && (createMutation.isPending || updateMutation.isPending);
    const isActivating = pendingAction === 'activate' && (createMutation.isPending || updateMutation.isPending);
    const isPending = isSaving || isActivating;

    const modalTitle = isEditMode ? `Edit Automation: ${flowData.name}` : "Create New Automation";

    if (!mounted) return null;

    return createPortal(
        <AnimatePresence>
            {isOpen && (
                <div
                    className="fixed inset-0 z-[200] flex items-center justify-center p-0 sm:p-3 md:p-4"
                    role="dialog"
                    aria-modal="true"
                    aria-label={modalTitle}
                    data-testid="automation-builder-portal"
                >
                    {/* Backdrop */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                        onClick={handleClose}
                        data-testid="modal-backdrop"
                    />

                    {/* Modal Window */}
                    <motion.div
                        initial={{ opacity: 0, scale: 0.98, y: 12 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.98, y: 12 }}
                        transition={{ type: "spring", damping: 30, stiffness: 300 }}
                        className="relative w-full h-full sm:h-[94vh] sm:max-h-[960px] max-w-[100vw] sm:max-w-[96vw] lg:max-w-5xl 2xl:max-w-6xl bg-background border-0 sm:border border-border sm:rounded-2xl shadow-2xl flex flex-col overflow-hidden z-10"
                        data-testid="automation-builder-modal"
                    >
                        {/* Top thread accent */}
                        <div className="h-[2px] w-full ig-thread shrink-0" />

                        {/* ── HEADER ── */}
                        <div
                            className="h-14 shrink-0 border-b border-border flex items-center justify-between px-4 sm:px-6 bg-card/60 backdrop-blur-md gap-3"
                            data-testid="modal-header"
                        >
                            <div className="flex items-center gap-3 min-w-0">
                                <h1 className="text-sm sm:text-base font-bold text-foreground truncate" data-testid="modal-step-title">
                                    {modalTitle}
                                </h1>
                            </div>

                            <button
                                onClick={handleClose}
                                className="p-2 hover:bg-muted text-muted-foreground hover:text-foreground rounded-lg transition-colors"
                                aria-label="Close"
                                data-testid="modal-btn-close"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        {/* ── 4-STEP WIZARD PROGRESS BAR ── */}
                        <div
                            className="border-b border-border bg-card/40 px-4 sm:px-6 py-2.5 shrink-0"
                            data-testid="wizard-stepper-bar"
                        >
                            <div className="flex items-center justify-between max-w-3xl mx-auto overflow-x-auto scrollbar-none gap-2">
                                {WIZARD_STEPS.map((s, idx) => {
                                    const isActive = step === idx;
                                    const isCompleted = step > idx;

                                    return (
                                        <button
                                            key={s.num}
                                            type="button"
                                            onClick={() => handleJumpToStep(idx)}
                                            className={cn(
                                                "flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all shrink-0",
                                                isActive
                                                    ? "bg-primary text-primary-foreground shadow-sm"
                                                    : isCompleted
                                                    ? "bg-muted text-foreground hover:bg-muted/80"
                                                    : "text-muted-foreground hover:text-foreground hover:bg-muted/40"
                                            )}
                                            data-testid={`step-tab-${idx}`}
                                        >
                                            <span
                                                className={cn(
                                                    "w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold",
                                                    isActive
                                                        ? "bg-primary-foreground text-primary"
                                                        : isCompleted
                                                        ? "bg-emerald-500 text-white"
                                                        : "bg-muted-foreground/30 text-foreground"
                                                )}
                                            >
                                                {isCompleted ? "✓" : s.num}
                                            </span>
                                            <span className="hidden sm:inline">{s.label}</span>
                                            <span className="sm:hidden">Step {s.num}</span>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        {/* ── ACTIVE STEP CONTENT ── */}
                        <div className="flex-1 min-h-0 overflow-hidden flex flex-col" data-testid="modal-step-content">
                            <AnimatePresence mode="wait">
                                <motion.div
                                    key={step}
                                    initial={{ opacity: 0, x: 8 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    exit={{ opacity: 0, x: -8 }}
                                    transition={{ duration: 0.15, ease: "easeOut" }}
                                    className="w-full h-full min-h-0 flex-1 flex flex-col overflow-hidden"
                                >
                                    {step === 0 && (
                                        <Step1Setup
                                            data={flowData}
                                            onUpdate={updateData}
                                            accountId={firstAccountId}
                                            validationError={validationError}
                                        />
                                    )}
                                    {step === 1 && (
                                        <Step2TriggerRules
                                            data={flowData}
                                            onUpdate={updateData}
                                            validationError={validationError}
                                        />
                                    )}
                                    {step === 2 && (
                                        <Step3DMMessage
                                            data={flowData}
                                            onUpdate={updateData}
                                            creatorProfilePicUrl={activeAccount?.profile_picture_url ?? null}
                                            validationError={validationError}
                                        />
                                    )}
                                    {step === 3 && (
                                        <Step4ReviewSave
                                            data={flowData}
                                            onEditStep={handleJumpToStep}
                                            onSave={handleSave}
                                            isPending={isPending}
                                            pendingAction={pendingAction}
                                            saveError={saveError}
                                            creatorProfilePicUrl={activeAccount?.profile_picture_url ?? null}
                                        />
                                    )}
                                </motion.div>
                            </AnimatePresence>
                        </div>

                        {/* ── BOTTOM FOOTER NAVIGATION ── */}
                        <div
                            className="h-16 shrink-0 border-t border-border px-4 sm:px-6 bg-card flex items-center justify-between gap-3 z-10"
                            data-testid="modal-footer"
                        >
                            <div className="flex items-center gap-2">
                                <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground" data-testid="step-counter">
                                    STEP {step + 1} OF 4
                                </span>
                                <span className="hidden sm:inline text-xs text-muted-foreground">·</span>
                                <span className="hidden sm:inline text-xs font-semibold text-foreground">
                                    {WIZARD_STEPS[step]?.label}
                                </span>
                            </div>

                            <div className="flex items-center gap-2">
                                {/* Back Button: Disabled on Step 1 */}
                                <button
                                    type="button"
                                    onClick={handleBack}
                                    disabled={step === 0}
                                    className="inline-flex items-center gap-1.5 h-9 px-3.5 text-xs font-semibold text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-40 disabled:pointer-events-none rounded-xl transition-colors border border-border"
                                    aria-label="Back"
                                    data-testid="btn-wizard-back"
                                >
                                    <ArrowLeft className="w-3.5 h-3.5" /> Back
                                </button>

                                {/* Next Button on steps 0, 1, 2 */}
                                {step < 3 ? (
                                    <button
                                        type="button"
                                        onClick={handleNext}
                                        className="inline-flex items-center gap-1.5 h-9 px-5 text-xs font-bold bg-primary text-primary-foreground hover:opacity-90 rounded-xl transition-all shadow-sm"
                                        aria-label="Next step"
                                        data-testid="btn-wizard-next"
                                    >
                                        Next <ArrowRight className="w-3.5 h-3.5" />
                                    </button>
                                ) : (
                                    /* Direct Save & Activate triggers on Step 4 footer */
                                    <div className="flex items-center gap-2">
                                        <button
                                            type="button"
                                            disabled={isPending}
                                            onClick={() => handleSave(false)}
                                            className="inline-flex items-center gap-1.5 h-9 px-4 text-xs font-semibold border border-border hover:bg-muted text-foreground rounded-xl transition-colors disabled:opacity-50"
                                            data-testid="btn-footer-save-draft"
                                        >
                                            {isSaving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                                            {isSaving ? "Saving..." : "Save Draft"}
                                        </button>
                                        <button
                                            type="button"
                                            disabled={isPending || (!isEditMode && !firstAccountId)}
                                            onClick={() => handleSave(true)}
                                            className="inline-flex items-center gap-1.5 h-9 px-4 text-xs font-bold bg-primary text-primary-foreground hover:opacity-90 rounded-xl transition-opacity disabled:opacity-50 shadow-sm"
                                            data-testid="btn-footer-activate"
                                        >
                                            {isActivating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />}
                                            {isActivating ? "Activating..." : "Save & Activate"}
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Activation confirmation: no activation request runs until explicitly confirmed */}
                        <AnimatePresence>
                            {showActivationConfirm && (
                                <motion.div
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    exit={{ opacity: 0 }}
                                    className="absolute inset-0 z-40 flex items-center justify-center bg-background/85 backdrop-blur-sm p-4"
                                    role="dialog"
                                    aria-modal="true"
                                    aria-labelledby="activation-confirm-title"
                                >
                                    <motion.div
                                        initial={{ scale: 0.96, y: 8 }}
                                        animate={{ scale: 1, y: 0 }}
                                        exit={{ scale: 0.96, y: 8 }}
                                        className="bg-card border border-border rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-4"
                                    >
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center shrink-0">
                                                <AlertTriangle className="w-5 h-5 text-amber-500" />
                                            </div>
                                            <div>
                                                <h4 id="activation-confirm-title" className="text-sm font-bold text-foreground">
                                                    Activate this automation?
                                                </h4>
                                                <p className="text-xs text-muted-foreground mt-0.5">
                                                    {flowData.name}
                                                </p>
                                            </div>
                                        </div>

                                        <p className="text-xs text-muted-foreground leading-relaxed">
                                            Once activated, this automation can process new Instagram events and send automated replies to real users. Confirm only when its trigger, message, and target are ready.
                                        </p>

                                        <div className="flex gap-2.5 pt-2">
                                            <button
                                                type="button"
                                                onClick={() => setShowActivationConfirm(false)}
                                                className="flex-1 h-9 rounded-xl border border-border text-xs font-semibold hover:bg-muted transition-colors"
                                                data-testid="btn-cancel-activation"
                                            >
                                                Cancel
                                            </button>
                                            <button
                                                type="button"
                                                disabled={isPending}
                                                onClick={() => {
                                                    setShowActivationConfirm(false);
                                                    handleSave(true, true);
                                                }}
                                                className="flex-1 h-9 rounded-xl bg-primary text-primary-foreground text-xs font-bold hover:opacity-90 transition-opacity disabled:opacity-50"
                                                data-testid="btn-confirm-activation"
                                            >
                                                Confirm & Activate
                                            </button>
                                        </div>
                                    </motion.div>
                                </motion.div>
                            )}
                        </AnimatePresence>

                        {/* Unsaved changes confirmation dialog */}
                        <AnimatePresence>
                            {showConfirm && (
                                <motion.div
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    exit={{ opacity: 0 }}
                                    className="absolute inset-0 z-30 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4"
                                >
                                    <motion.div
                                        initial={{ scale: 0.96, y: 8 }}
                                        animate={{ scale: 1, y: 0 }}
                                        exit={{ scale: 0.96, y: 8 }}
                                        className="bg-card border border-border rounded-2xl p-6 max-w-sm w-full shadow-2xl space-y-4"
                                    >
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center shrink-0">
                                                <AlertTriangle className="w-5 h-5 text-amber-500" />
                                            </div>
                                            <div>
                                                <h4 className="text-sm font-bold text-foreground">Unsaved Changes</h4>
                                                <p className="text-xs text-muted-foreground mt-0.5">
                                                    You have unsaved changes in this automation.
                                                </p>
                                            </div>
                                        </div>

                                        <p className="text-xs text-muted-foreground leading-relaxed">
                                            Discarding will lose any changes you have made. Would you like to keep editing or discard?
                                        </p>

                                        <div className="flex gap-2.5 pt-2">
                                            <button
                                                type="button"
                                                onClick={() => setShowConfirm(false)}
                                                className="flex-1 h-9 rounded-xl border border-border text-xs font-semibold hover:bg-muted transition-colors"
                                            >
                                                Keep Editing
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setShowConfirm(false);
                                                    onClose();
                                                }}
                                                className="flex-1 h-9 rounded-xl bg-destructive text-destructive-foreground text-xs font-bold hover:bg-destructive/90 transition-colors"
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
        </AnimatePresence>,
        document.body
    );
}

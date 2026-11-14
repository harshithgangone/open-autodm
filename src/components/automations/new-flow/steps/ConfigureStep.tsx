"use client";

import { useState, useEffect, useCallback } from "react";
import { ArrowLeft, Sparkles, Layers, Eye } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AutomationFlowData } from "../NewAutomationModal";
import type { FlowGraph } from "@/lib/types";
import { automationToFlowGraph, flowGraphToAutomation, flowGraphToFlowData } from "@/lib/automation/flowGraph";
import { SimpleBuilder } from "../simple/SimpleBuilder";
import { VisualFlowCanvas } from "../visual/VisualFlowCanvas";
import { CommentsPhone, DMConversationPhone, StoryPhone } from "./PhoneComponents";

export interface ConfigureStepProps {
    data: AutomationFlowData;
    onUpdate: (patch: Partial<AutomationFlowData>) => void;
    creatorProfilePicUrl?: string | null;
    onBackToPost?: () => void;
    onSave?: (activate: boolean) => void;
    isPending?: boolean;
    pendingAction?: 'save' | 'activate' | null;
    saveError?: string | null;
    isEditMode?: boolean;
}

export function ConfigureStep({
    data,
    onUpdate,
    creatorProfilePicUrl,
    onBackToPost,
    onSave,
    isPending = false,
    pendingAction = null,
    saveError = null,
    isEditMode = false,
}: ConfigureStepProps) {
    const [builderMode, setBuilderMode] = useState<"simple" | "visual">("simple");
    const [mobileTab, setMobileTab] = useState<"form" | "preview">("form");
    const [phonePhase, setPhonePhase] = useState<"initial" | "clicked" | "followed">("initial");

    // Canonical Flow Graph state
    const [graph, setGraph] = useState<FlowGraph>(() => {
        return data.flowGraph || automationToFlowGraph(data);
    });

    const isComment = data.type === "comment-dm" || data.type === "comment_dm";
    const isStory = data.type === "story-reply" || data.type === "story_reply";
    const isReel = data.type === "reel-dm" || data.type === "reel_dm";
    const isAnyMode = data.keywordsAnyMode;
    const previewTriggerText = isAnyMode
        ? (isStory ? "Love this! 🔥" : "Hey! 👋")
        : (data.keywords[0] ?? "LINK");

    // Switch between Simple Builder and Visual Flow Builder with bidirectional sync
    const handleSwitchMode = (mode: "simple" | "visual") => {
        if (mode === "visual") {
            // Sync flat data into graph
            const updatedGraph = automationToFlowGraph(data);
            setGraph(updatedGraph);
            onUpdate({ flowGraph: updatedGraph });
        } else {
            // Sync graph back into flat data
            const flowPatch = flowGraphToFlowData(graph, data);
            onUpdate({
                ...flowPatch,
                flowGraph: graph,
            });
        }
        setBuilderMode(mode);
    };

    // When graph is edited in Visual Flow Canvas
    const handleChangeGraph = (newGraph: FlowGraph) => {
        setGraph(newGraph);
        const flowPatch = flowGraphToFlowData(newGraph, data);
        onUpdate({
            ...flowPatch,
            flowGraph: newGraph,
        });
    };

    return (
        <div className="flex flex-col h-full w-full bg-background overflow-hidden" data-testid="configure-step-container">
            {/* Top Navigation & Mode Switcher Bar */}
            <div className="border-b border-border bg-card/80 backdrop-blur-md px-4 sm:px-6 py-2.5 flex items-center justify-between shrink-0 z-20">
                <div className="flex items-center gap-3">
                    {onBackToPost && (
                        <button
                            type="button"
                            onClick={onBackToPost}
                            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                            title="Back"
                        >
                            <ArrowLeft className="w-4 h-4" />
                        </button>
                    )}
                    <div>
                        <h2 className="text-sm font-semibold text-foreground truncate max-w-[200px] sm:max-w-xs">
                            {data.name || "Configure Automation"}
                        </h2>
                        <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-bold">
                            {isReel
                                ? "Shared Reel Trigger"
                                : isComment
                                ? "Post / Reel Comment"
                                : isStory
                                ? "Story Reply"
                                : "DM Keyword"}
                        </span>
                    </div>
                </div>

                {/* Center: Mode Switcher */}
                <div className="flex items-center gap-1 p-1 bg-muted/60 border border-border rounded-xl">
                    <button
                        type="button"
                        onClick={() => handleSwitchMode("simple")}
                        className={cn(
                            "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all",
                            builderMode === "simple"
                                ? "bg-primary text-primary-foreground shadow-sm"
                                : "text-muted-foreground hover:text-foreground hover:bg-muted"
                        )}
                    >
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>Simple Builder</span>
                    </button>
                    <button
                        type="button"
                        onClick={() => handleSwitchMode("visual")}
                        className={cn(
                            "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all",
                            builderMode === "visual"
                                ? "bg-primary text-primary-foreground shadow-sm"
                                : "text-muted-foreground hover:text-foreground hover:bg-muted"
                        )}
                    >
                        <Layers className="w-3.5 h-3.5" />
                        <span>Visual Flow Canvas</span>
                    </button>
                </div>

                {/* Mobile Preview Switcher (Only visible in Simple Builder on small screens) */}
                {builderMode === "simple" && (
                    <div className="xl:hidden flex items-center gap-1 p-1 bg-muted/60 border border-border rounded-xl">
                        <button
                            type="button"
                            onClick={() => setMobileTab("form")}
                            className={cn(
                                "px-2.5 py-1 rounded-lg text-xs font-medium transition-colors",
                                mobileTab === "form" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"
                            )}
                        >
                            Edit
                        </button>
                        <button
                            type="button"
                            onClick={() => setMobileTab("preview")}
                            className={cn(
                                "px-2.5 py-1 rounded-lg text-xs font-medium transition-colors flex items-center gap-1",
                                mobileTab === "preview" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"
                            )}
                        >
                            <Eye className="w-3 h-3" />
                            <span>Preview</span>
                        </button>
                    </div>
                )}
            </div>

            {/* Main Area: Simple Builder or Visual Flow Canvas */}
            <div className="flex-1 flex overflow-hidden relative">
                {builderMode === "visual" ? (
                    /* ── Visual Flow Builder Mode ── */
                    <VisualFlowCanvas
                        graph={graph}
                        onChangeGraph={handleChangeGraph}
                        onSave={onSave}
                        isPending={isPending}
                    />
                ) : (
                    /* ── Simple Builder Mode (Default) ── */
                    <div className="flex-1 flex overflow-hidden">
                        {/* Left / Center: Simple Builder Form */}
                        <div
                            className={cn(
                                "flex-1 overflow-y-auto custom-scrollbar",
                                mobileTab === "preview" ? "hidden xl:block" : "block"
                            )}
                        >
                            <SimpleBuilder
                                data={data}
                                onUpdate={onUpdate}
                                onSave={onSave || (() => {})}
                                isPending={isPending}
                                pendingAction={pendingAction}
                                saveError={saveError}
                                isEditMode={isEditMode}
                                onOpenVisualCanvas={() => handleSwitchMode("visual")}
                            />
                        </div>

                        {/* Right: Live Interactive Instagram Mockup */}
                        <div
                            className={cn(
                                "w-full xl:w-[420px] 2xl:w-[460px] shrink-0 border-t xl:border-t-0 xl:border-l border-border bg-[#050506] flex items-center justify-center p-4 sm:p-6 overflow-y-auto custom-scrollbar",
                                mobileTab === "form" ? "hidden xl:flex" : "flex"
                            )}
                        >
                            <div className="flex flex-col items-center gap-4 max-w-[360px] w-full py-2">
                                {isComment ? (
                                    <CommentsPhone
                                        postThumbnailUrl={data.postThumbnailUrl}
                                        previewComments={[previewTriggerText, "Super interested! 🔥", "Where do I sign up?"]}
                                        anyMode={isAnyMode}
                                        repliesSaved={data.publicReplyEnabled}
                                        customReplies={data.publicReplyOptions.length > 0 ? data.publicReplyOptions : data.customReplies}
                                        creatorProfilePicUrl={creatorProfilePicUrl}
                                    />
                                ) : isStory ? (
                                    <StoryPhone keyword={previewTriggerText} />
                                ) : (
                                    <DMConversationPhone
                                        creatorProfilePicUrl={creatorProfilePicUrl}
                                        openingEnabled={data.isAutoDmEnabled && data.dmOpeningMessageEnabled}
                                        openingMessage={
                                            data.dmOpeningMessageVariations && data.dmOpeningMessageVariations.length > 0
                                                ? data.dmOpeningMessageVariations[0]!
                                                : data.dmOpeningMessage
                                        }
                                        openingBtnTitle={data.dmOpeningMessageButtonTitle}
                                        askToFollowEnabled={data.askToFollowEnabled}
                                        askToFollowMessage={data.askToFollowMessage}
                                        askToFollowVisitBtn={data.askToFollowVisitProfileButton}
                                        askToFollowConfirmBtn={data.askToFollowConfirmButton}
                                        responses={data.dmResponses}
                                        phase={phonePhase}
                                        onPhaseChange={setPhonePhase}
                                        trigger={
                                            isReel
                                                ? { kind: "dm", text: "Shared a Reel 🎬" }
                                                : { kind: "dm", text: previewTriggerText }
                                        }
                                    />
                                )}
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

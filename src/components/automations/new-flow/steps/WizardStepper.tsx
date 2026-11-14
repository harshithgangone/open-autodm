"use client";

import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export interface WizardStepDef {
    id: number;
    title: string;
    shortTitle: string;
    description: string;
}

export const WIZARD_STEPS: WizardStepDef[] = [
    { id: 1, title: "Trigger", shortTitle: "Trigger", description: "Keywords & post" },
    { id: 2, title: "Recipient Rules", shortTitle: "Recipients", description: "Eligibility & follow" },
    { id: 3, title: "Response Behavior", shortTitle: "Behavior", description: "Auto DM & public replies" },
    { id: 4, title: "DM Message & Links", shortTitle: "Messages", description: "Opening DM, cards & links" },
    { id: 5, title: "Follow-up", shortTitle: "Follow-up", description: "Timing & compliance" },
    { id: 6, title: "Review & Save", shortTitle: "Review", description: "Summary & activation" },
];

interface WizardStepperProps {
    currentStep: number;
    onStepClick: (step: number) => void;
    canNavigateToStep?: (step: number) => boolean;
}

export function WizardStepper({ currentStep, onStepClick, canNavigateToStep }: WizardStepperProps) {
    const activeStepDef = WIZARD_STEPS.find(s => s.id === currentStep) ?? WIZARD_STEPS[0]!;
    const progressPercent = Math.round(((currentStep - 1) / (WIZARD_STEPS.length - 1)) * 100);

    return (
        <div className="w-full bg-background border-b border-border/80 px-4 py-2.5 shrink-0" data-testid="wizard-stepper">
            {/* Desktop / Tablet Stepper (> md) */}
            <div className="hidden md:flex items-center justify-between gap-1 max-w-4xl mx-auto">
                {WIZARD_STEPS.map((s, idx) => {
                    const isCompleted = currentStep > s.id;
                    const isActive = currentStep === s.id;
                    const isAccessible = canNavigateToStep ? canNavigateToStep(s.id) : isCompleted || isActive;

                    return (
                        <div key={s.id} className="flex items-center flex-1 min-w-0">
                            <button
                                type="button"
                                disabled={!isAccessible}
                                onClick={() => isAccessible && onStepClick(s.id)}
                                className={cn(
                                    "flex items-center gap-2 text-left py-1 px-2 rounded-lg transition-all min-w-0 group",
                                    isActive && "bg-muted/60 text-foreground font-semibold shadow-xs",
                                    isCompleted && "text-muted-foreground hover:text-foreground cursor-pointer",
                                    !isActive && !isCompleted && "text-muted-foreground/50 cursor-not-allowed",
                                    isAccessible && !isActive && "hover:bg-muted/40 cursor-pointer"
                                )}
                                data-testid={`wizard-step-btn-${s.id}`}
                                aria-current={isActive ? "step" : undefined}
                            >
                                <span
                                    className={cn(
                                        "w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0 transition-colors",
                                        isActive && "bg-primary text-primary-foreground",
                                        isCompleted && "bg-primary/20 text-primary group-hover:bg-primary group-hover:text-primary-foreground",
                                        !isActive && !isCompleted && "bg-muted text-muted-foreground/60 border border-border"
                                    )}
                                >
                                    {isCompleted ? <Check className="w-3 h-3 stroke-[3]" /> : s.id}
                                </span>
                                <div className="min-w-0 truncate">
                                    <p className="text-[12px] leading-tight truncate font-medium">
                                        {s.shortTitle}
                                    </p>
                                    <p className="text-[10px] text-muted-foreground/70 truncate hidden lg:block">
                                        {s.description}
                                    </p>
                                </div>
                            </button>

                            {/* Divider line between steps */}
                            {idx < WIZARD_STEPS.length - 1 && (
                                <div
                                    className={cn(
                                        "h-[2px] flex-1 mx-1.5 rounded-full transition-colors",
                                        currentStep > s.id ? "bg-primary/40" : "bg-border"
                                    )}
                                />
                            )}
                        </div>
                    );
                })}
            </div>

            {/* Mobile Stepper (<= md) */}
            <div className="md:hidden flex flex-col gap-1.5">
                <div className="flex items-center justify-between text-[12px]">
                    <span className="font-semibold text-foreground flex items-center gap-1.5">
                        <span className="w-5 h-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-[10px] font-bold">
                            {currentStep}
                        </span>
                        <span>{activeStepDef.title}</span>
                    </span>
                    <span className="text-[11px] text-muted-foreground tabular-nums">
                        Step {currentStep} of {WIZARD_STEPS.length}
                    </span>
                </div>
                {/* Visual Progress Bar */}
                <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                    <div
                        className="h-full bg-primary rounded-full transition-all duration-300 ease-out"
                        style={{ width: `${progressPercent}%` }}
                    />
                </div>
            </div>
        </div>
    );
}

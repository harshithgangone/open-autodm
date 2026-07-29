import { motion } from "framer-motion";
import { MessageCircle, Send, Image, AtSign } from "lucide-react";
import { AUTOMATION_TYPES } from "../constants";
import { cn } from "@/lib/utils";

interface SelectTypeStepProps {
    onSelect: (typeId: string) => void;
    selectedType: string | null;
}

const ICONS = {
    "message": MessageCircle,
    "send": Send,
    "image": Image,
    "at-sign": AtSign
};

export function SelectTypeStep({ onSelect, selectedType }: SelectTypeStepProps) {
    return (
        <div className="flex flex-col items-center justify-center w-full h-full p-6 overflow-y-auto">
            <div className="max-w-2xl w-full mx-auto space-y-8 pb-8">
                <div className="text-center space-y-1.5 pt-6">
                    <h2 className="text-xl font-heading font-semibold tracking-tight text-foreground">
                        What starts this automation?
                    </h2>
                    <p className="text-[13px] text-muted-foreground max-w-md mx-auto">
                        Pick a trigger — you&apos;ll configure keywords and replies next.
                    </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                    {AUTOMATION_TYPES.map((type, idx) => {
                        const Icon = ICONS[type.iconType as keyof typeof ICONS];
                        const isSelected = selectedType === type.id;

                        return (
                            <motion.button
                                key={type.id}
                                disabled={!type.available}
                                onClick={() => onSelect(type.id)}
                                initial={{ opacity: 0, y: 8 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: idx * 0.05 }}
                                className={cn(
                                    "relative group text-left p-4 rounded-xl border transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
                                    !type.available
                                        ? "opacity-50 cursor-not-allowed border-border"
                                        : "cursor-pointer bg-card border-border hover:border-foreground/25",
                                    isSelected && type.available && "border-foreground/40 bg-muted/40"
                                )}
                            >
                                <div className="flex items-start gap-3">
                                    <div className={cn(
                                        "w-9 h-9 rounded-lg flex items-center justify-center shrink-0",
                                        type.available ? "bg-muted" : "bg-muted/50"
                                    )}>
                                        <Icon className={cn("w-4 h-4", type.iconColor)} />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 mb-0.5">
                                            <h3 className="text-[13.5px] font-semibold text-foreground">
                                                {type.name}
                                            </h3>
                                            {!type.available && (
                                                <span className="text-[9px] font-semibold uppercase tracking-widest bg-muted text-muted-foreground px-1.5 py-0.5 rounded-full">
                                                    Soon
                                                </span>
                                            )}
                                        </div>
                                        <p className="text-[12px] text-muted-foreground leading-relaxed">
                                            {type.description}
                                        </p>
                                    </div>
                                </div>
                            </motion.button>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}

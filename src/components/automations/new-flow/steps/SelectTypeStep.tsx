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
        <div className="flex flex-col items-center justify-center w-full h-full p-8 overflow-y-auto">
            <div className="max-w-4xl w-full mx-auto space-y-12 pb-12">
                <div className="text-center space-y-3 pt-8">
                    <h2 className="text-3xl lg:text-4xl font-heading font-extrabold text-foreground">
                        Choose your automation trigger
                    </h2>
                    <p className="text-muted-foreground text-base lg:text-lg max-w-xl mx-auto">
                        What action should start this automated flow? Select from our proven templates below.
                    </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {AUTOMATION_TYPES.map((type, idx) => {
                        const Icon = ICONS[type.iconType as keyof typeof ICONS];
                        const isSelected = selectedType === type.id;

                        return (
                            <motion.button
                                key={type.id}
                                disabled={!type.available}
                                onClick={() => onSelect(type.id)}
                                initial={{ opacity: 0, scale: 0.95 }}
                                animate={{ opacity: 1, scale: 1 }}
                                transition={{ delay: idx * 0.1 }}
                                className={cn(
                                    "relative group text-left p-6 md:p-8 rounded-3xl border-2 transition-all duration-300",
                                    !type.available ? "opacity-60 cursor-not-allowed bg-muted/20 border-border/40" : "hover:shadow-xl bg-card/40 backdrop-blur-sm cursor-pointer",
                                    isSelected && type.available ? `border-primary shadow-lg ring-4 ring-primary/20 bg-primary/5` : type.border
                                )}
                            >
                                {/* Background Glow */}
                                {type.available && (
                                    <div className={cn(
                                        "absolute inset-0 bg-gradient-to-br opacity-0 group-hover:opacity-100 transition-opacity duration-500 rounded-[1.35rem]",
                                        type.bg
                                    )} />
                                )}

                                <div className="relative z-10 flex items-start space-x-5">
                                    <div className={cn(
                                        "w-12 h-12 md:w-14 md:h-14 rounded-2xl flex items-center justify-center shrink-0 transition-transform group-hover:scale-110",
                                        type.available ? "bg-background border border-border shadow-sm" : "bg-muted"
                                    )}>
                                        <Icon className={cn("w-6 h-6", type.iconColor)} />
                                    </div>
                                    <div className="flex-1">
                                        <div className="flex items-center space-x-3 mb-2">
                                            <h3 className="text-xl font-bold font-heading text-foreground group-hover:text-primary transition-colors">
                                                {type.name}
                                            </h3>
                                            {!type.available && (
                                                <span className="text-[10px] font-bold uppercase tracking-widest bg-muted/80 text-muted-foreground px-2 py-0.5 rounded-full">
                                                    Soon
                                                </span>
                                            )}
                                        </div>
                                        <p className="text-muted-foreground text-sm leading-relaxed">
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

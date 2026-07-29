"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
    Home,
    Bot,
    Settings,
    Wrench,
    Github,
    ChevronLeft,
    ChevronRight,
    Instagram,
    CheckCircle2
} from "lucide-react";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import { useState } from "react";
import { useInstagramAccounts } from "@/hooks/useInstagramAccounts";
import { LogoMark, LogoWordmark } from "@/components/ui/Logo";

const MAPPED_NAV = {
    WORKSPACE: [
        { name: "Dashboard", href: "/dashboard", icon: Home, external: false },
        { name: "Automations", href: "/automations", icon: Bot, external: false },
    ],
    SYSTEM: [
        { name: "Setup Wizard", href: "/setup", icon: Wrench, external: false },
        { name: "Settings", href: "/settings", icon: Settings, external: false },
        { name: "GitHub", href: "https://github.com", icon: Github, external: true },
    ],
};

export function Sidebar() {
    const pathname = usePathname();
    const [isCollapsed, setIsCollapsed] = useState(false);
    const { data: igAccounts } = useInstagramAccounts();
    const firstAccount = igAccounts?.[0] ?? null;

    return (
        <motion.aside
            initial={false}
            animate={{ width: isCollapsed ? 80 : 260 }}
            transition={{ duration: 0.3, ease: "easeInOut" }}
            className="flex-shrink-0 h-screen sticky top-0 left-0 hidden lg:flex flex-col bg-background border-r border-border/40 overflow-visible z-50"
        >
            {/* Collapse Toggle Button */}
            <button
                onClick={() => setIsCollapsed(!isCollapsed)}
                className="absolute -right-3 top-8 w-6 h-6 bg-border rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-primary/20 transition-colors z-50 shadow-md ring-4 ring-background"
            >
                {isCollapsed ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronLeft className="w-3.5 h-3.5" />}
            </button>

            {/* Brand Header */}
            <div className={cn(
                "p-6 pb-4 flex items-center transition-all duration-300",
                isCollapsed ? "justify-center px-0" : "space-x-2.5"
            )}>
                <LogoMark className="w-8 h-8 shrink-0 drop-shadow-md" />

                <AnimatePresence mode="popLayout">
                    {!isCollapsed && (
                        <motion.span
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -10 }}
                            className="truncate"
                        >
                            <LogoWordmark className="text-[16px]" />
                        </motion.span>
                    )}
                </AnimatePresence>
            </div>

            {/* Navigation Groups */}
            <div className="flex-1 overflow-y-auto overflow-x-hidden scrollbar-none pb-4">
                {Object.entries(MAPPED_NAV).map(([groupName, items]) => (
                    <div key={groupName} className="mb-6">
                        <AnimatePresence>
                            {!isCollapsed && (
                                <motion.div
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    exit={{ opacity: 0 }}
                                    className="px-6 mb-2 text-[10px] font-bold tracking-[0.2em] text-muted-foreground/50 uppercase"
                                >
                                    {groupName}
                                </motion.div>
                            )}
                        </AnimatePresence>

                        <nav className="px-3 space-y-1">
                            {items.map((item) => {
                                const isActive = !item.external && pathname.startsWith(item.href);

                                return (
                                    <Link
                                        key={item.name}
                                        href={item.href}
                                        target={item.external ? "_blank" : undefined}
                                        rel={item.external ? "noopener noreferrer" : undefined}
                                        className={cn(
                                            "group relative flex items-center p-2.5 rounded-xl transition-all duration-200",
                                            isActive
                                                ? "bg-primary/10 text-primary font-medium"
                                                : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
                                            isCollapsed ? "justify-center" : "justify-between"
                                        )}
                                        title={isCollapsed ? item.name : undefined}
                                    >
                                        <div className="flex items-center">
                                            <item.icon className={cn(
                                                "w-[18px] h-[18px] shrink-0 transition-transform duration-200",
                                                isActive ? "text-primary" : "text-muted-foreground drop-shadow-sm group-hover:scale-110",
                                                !isCollapsed && "mr-3"
                                            )} />

                                            <AnimatePresence mode="popLayout">
                                                {!isCollapsed && (
                                                    <motion.span
                                                        initial={{ opacity: 0 }}
                                                        animate={{ opacity: 1 }}
                                                        exit={{ opacity: 0 }}
                                                        className={cn(
                                                            "text-[13px] tracking-wide whitespace-nowrap",
                                                            isActive ? "text-primary font-bold" : "font-medium"
                                                        )}
                                                    >
                                                        {item.name}
                                                    </motion.span>
                                                )}
                                            </AnimatePresence>
                                        </div>

                                        {/* Active Line */}
                                        {isActive && (
                                            <motion.div
                                                layoutId="active-nav"
                                                className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 bg-primary rounded-r-full"
                                            />
                                        )}
                                    </Link>
                                );
                            })}
                        </nav>
                    </div>
                ))}
            </div>

            {/* Connected Account Footer */}
            <div className={cn(
                "p-4 border-t border-border/40 transition-all duration-300",
                isCollapsed ? "px-2" : "px-4"
            )}>
                <Link href="/settings">
                    <div className={cn(
                        "flex items-center rounded-xl p-2 bg-muted/30 border border-border/50 hover:bg-muted/50 transition-colors",
                        isCollapsed ? "justify-center" : "space-x-3"
                    )}>
                        {/* IG Avatar or placeholder */}
                        <div className="relative w-8 h-8 rounded-full bg-gradient-to-tr from-[#f09433] via-[#e6683c] to-[#bc1888] p-[2px] shrink-0">
                            <div className="w-full h-full rounded-full bg-background flex items-center justify-center overflow-hidden">
                                {firstAccount?.profile_picture_url ? (
                                    <img src={firstAccount.profile_picture_url} alt={firstAccount.username} className="w-full h-full object-cover rounded-full" />
                                ) : (
                                    <Instagram className="w-4 h-4 text-foreground/80" />
                                )}
                            </div>
                        </div>

                        <AnimatePresence mode="popLayout">
                            {!isCollapsed && (
                                <motion.div
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    exit={{ opacity: 0 }}
                                    className="flex flex-col overflow-hidden"
                                >
                                    {firstAccount ? (
                                        <>
                                            <div className="flex items-center space-x-1.5 line-clamp-1">
                                                <span className="text-[10px] uppercase font-bold text-[#bc1888] tracking-wider">IG Connected</span>
                                                <CheckCircle2 className="w-3 h-3 text-[#f09433]" />
                                            </div>
                                            <span className="text-sm font-bold text-foreground truncate">@{firstAccount.username}</span>
                                        </>
                                    ) : (
                                        <>
                                            <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">No account</span>
                                            <span className="text-xs font-medium text-[#F97316]">Connect Instagram →</span>
                                        </>
                                    )}
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>
                </Link>
            </div>
        </motion.aside>
    );
}

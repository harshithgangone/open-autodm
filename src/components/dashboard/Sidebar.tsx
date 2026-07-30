"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
    Home,
    Bot,
    ChartNoAxesColumn,
    Settings,
    Wrench,
    Github,
    ChevronLeft,
    ChevronRight,
    Instagram,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import { useState } from "react";
import { useInstagramAccounts } from "@/hooks/useInstagramAccounts";
import { LogoMark, LogoWordmark } from "@/components/ui/Logo";

const NAV = {
    Workspace: [
        { name: "Dashboard", href: "/dashboard", icon: Home, external: false },
        { name: "Automations", href: "/automations", icon: Bot, external: false },
        { name: "Analytics", href: "/analytics", icon: ChartNoAxesColumn, external: false },
    ],
    System: [
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
            animate={{ width: isCollapsed ? 64 : 232 }}
            transition={{ duration: 0.22, ease: "easeInOut" }}
            className="flex-shrink-0 h-screen sticky top-0 left-0 hidden lg:flex flex-col bg-background border-r border-border overflow-visible z-50"
        >
            {/* Collapse toggle */}
            <button
                onClick={() => setIsCollapsed(!isCollapsed)}
                className="absolute -right-2.5 top-7 w-5 h-5 bg-card border border-border rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors z-50"
                aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
                {isCollapsed ? <ChevronRight className="w-3 h-3" /> : <ChevronLeft className="w-3 h-3" />}
            </button>

            {/* Brand */}
            <div className={cn(
                "h-14 flex items-center border-b border-border transition-all",
                isCollapsed ? "justify-center px-0" : "gap-2.5 px-4"
            )}>
                <LogoMark className="w-6 h-6 shrink-0" />
                <AnimatePresence mode="popLayout">
                    {!isCollapsed && (
                        <motion.span
                            initial={{ opacity: 0, x: -6 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -6 }}
                            className="truncate"
                        >
                            <LogoWordmark className="text-[13px] tracking-[0.14em]" />
                        </motion.span>
                    )}
                </AnimatePresence>
            </div>

            {/* Nav */}
            <div className="flex-1 overflow-y-auto overflow-x-hidden scrollbar-none py-4">
                {Object.entries(NAV).map(([group, items]) => (
                    <div key={group} className="mb-5">
                        {!isCollapsed && (
                            <div className="micro-label px-4 mb-1.5 opacity-70">{group}</div>
                        )}
                        <nav className="px-2 space-y-px">
                            {items.map((item) => {
                                const isActive = !item.external && pathname.startsWith(item.href);
                                return (
                                    <Link
                                        key={item.name}
                                        href={item.href}
                                        target={item.external ? "_blank" : undefined}
                                        rel={item.external ? "noopener noreferrer" : undefined}
                                        title={isCollapsed ? item.name : undefined}
                                        className={cn(
                                            "group relative flex items-center h-8 rounded-md text-[13px] transition-colors",
                                            isCollapsed ? "justify-center" : "px-2.5 gap-2.5",
                                            isActive
                                                ? "bg-muted text-foreground font-medium"
                                                : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
                                        )}
                                    >
                                        {/* Active marker - the warm thread */}
                                        {isActive && (
                                            <motion.span
                                                layoutId="nav-thread"
                                                className="absolute left-0 top-1/2 -translate-y-1/2 w-[2px] h-4 rounded-full ig-thread"
                                            />
                                        )}
                                        <item.icon className={cn("w-4 h-4 shrink-0", isActive ? "text-foreground" : "")} />
                                        {!isCollapsed && <span className="truncate">{item.name}</span>}
                                    </Link>
                                );
                            })}
                        </nav>
                    </div>
                ))}
            </div>

            {/* Connected account */}
            <div className={cn("border-t border-border p-2.5", isCollapsed && "px-2")}>
                <Link href="/settings" className="block">
                    <div className={cn(
                        "flex items-center rounded-lg p-2 hover:bg-muted/60 transition-colors",
                        isCollapsed ? "justify-center" : "gap-2.5"
                    )}>
                        <div className="relative w-7 h-7 rounded-full ig-ring p-[1.5px] shrink-0">
                            <div className="w-full h-full rounded-full bg-background flex items-center justify-center overflow-hidden">
                                {firstAccount?.profile_picture_url ? (
                                    <img src={firstAccount.profile_picture_url} alt={firstAccount.username} className="w-full h-full object-cover rounded-full" />
                                ) : (
                                    <Instagram className="w-3.5 h-3.5 text-muted-foreground" />
                                )}
                            </div>
                        </div>
                        {!isCollapsed && (
                            <div className="flex flex-col min-w-0">
                                {firstAccount ? (
                                    <>
                                        <span className="text-[12px] font-medium text-foreground truncate leading-tight">@{firstAccount.username}</span>
                                        <span className="text-[10px] text-muted-foreground leading-tight">Connected</span>
                                    </>
                                ) : (
                                    <>
                                        <span className="text-[12px] font-medium text-foreground leading-tight">No account</span>
                                        <span className="text-[10px] text-muted-foreground leading-tight">Connect Instagram</span>
                                    </>
                                )}
                            </div>
                        )}
                    </div>
                </Link>
            </div>
        </motion.aside>
    );
}

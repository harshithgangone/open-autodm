"use client";

/**
 * Sidebar account switcher - pick which connected Instagram account the whole
 * console is looking at. Switching is instant (client state); every list on
 * every page re-scopes to the chosen account. "Add account" runs the same
 * OAuth connect flow as Settings.
 */

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Instagram, Check, ChevronsUpDown, Plus, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { apiClient, ApiError } from "@/lib/api/client";
import { useActiveAccount } from "@/hooks/useActiveAccount";
import type { InstagramAccount } from "@/hooks/useInstagramAccounts";

function AccountAvatar({ account, size = 7 }: { account: InstagramAccount | null; size?: 6 | 7 }) {
    const cls = size === 6 ? "w-6 h-6" : "w-7 h-7";
    return (
        <div className={cn(cls, "relative rounded-full ig-ring p-[1.5px] shrink-0")}>
            <div className="w-full h-full rounded-full bg-background flex items-center justify-center overflow-hidden">
                {account?.profile_picture_url ? (
                    <img src={account.profile_picture_url} alt={account.username} className="w-full h-full object-cover rounded-full" />
                ) : (
                    <Instagram className="w-3 h-3 text-muted-foreground" />
                )}
            </div>
        </div>
    );
}

export function AccountSwitcher({ isCollapsed }: { isCollapsed: boolean }) {
    const { account, accounts, setActiveAccount } = useActiveAccount();
    const [open, setOpen] = useState(false);
    const [connecting, setConnecting] = useState(false);
    const [connectError, setConnectError] = useState<string | null>(null);
    const rootRef = useRef<HTMLDivElement>(null);

    // Close on outside click / Escape
    useEffect(() => {
        if (!open) return;
        const onClick = (e: MouseEvent) => {
            if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
        };
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") setOpen(false);
        };
        document.addEventListener("mousedown", onClick);
        document.addEventListener("keydown", onKey);
        return () => {
            document.removeEventListener("mousedown", onClick);
            document.removeEventListener("keydown", onKey);
        };
    }, [open]);

    const handleConnect = async () => {
        setConnecting(true);
        setConnectError(null);
        try {
            const { url } = await apiClient<{ url: string }>("/instagram/connect");
            window.location.href = url;
        } catch (err) {
            setConnectError(err instanceof ApiError ? err.message : "Couldn't start the connection");
            setConnecting(false);
        }
    };

    return (
        <div ref={rootRef} className="relative">
            {/* Trigger */}
            <button
                onClick={() => setOpen((o) => !o)}
                aria-haspopup="listbox"
                aria-expanded={open}
                className={cn(
                    "w-full flex items-center rounded-lg p-2 hover:bg-muted/60 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
                    isCollapsed ? "justify-center" : "gap-2.5"
                )}
                title={isCollapsed ? (account ? `@${account.username}` : "Accounts") : undefined}
            >
                <AccountAvatar account={account} />
                {!isCollapsed && (
                    <>
                        <div className="flex flex-col min-w-0 flex-1 text-left">
                            {account ? (
                                <>
                                    <span className="text-[12px] font-medium text-foreground truncate leading-tight">@{account.username}</span>
                                    <span className="text-[10px] text-muted-foreground leading-tight">
                                        {accounts.length > 1 ? `${accounts.length} accounts` : "Connected"}
                                    </span>
                                </>
                            ) : (
                                <>
                                    <span className="text-[12px] font-medium text-foreground leading-tight">No account</span>
                                    <span className="text-[10px] text-muted-foreground leading-tight">Connect Instagram</span>
                                </>
                            )}
                        </div>
                        <ChevronsUpDown className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                    </>
                )}
            </button>

            {/* Popover */}
            <AnimatePresence>
                {open && (
                    <motion.div
                        initial={{ opacity: 0, y: 6, scale: 0.98 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 6, scale: 0.98 }}
                        transition={{ duration: 0.12 }}
                        role="listbox"
                        className={cn(
                            "absolute bottom-full mb-2 w-56 bg-popover border border-border rounded-xl shadow-xl overflow-hidden z-[100]",
                            isCollapsed ? "left-0" : "left-0 right-0 w-auto min-w-[210px]"
                        )}
                    >
                        <div className="px-3 pt-2.5 pb-1.5">
                            <span className="micro-label">Instagram accounts</span>
                        </div>
                        <div className="px-1.5 pb-1.5 max-h-56 overflow-y-auto custom-scrollbar">
                            {accounts.length === 0 && (
                                <p className="px-2 py-2 text-[12px] text-muted-foreground">Nothing connected yet.</p>
                            )}
                            {accounts.map((a) => {
                                const isActive = a.id === account?.id;
                                return (
                                    <button
                                        key={a.id}
                                        role="option"
                                        aria-selected={isActive}
                                        onClick={() => { setActiveAccount(a.id); setOpen(false); }}
                                        className={cn(
                                            "w-full flex items-center gap-2.5 px-2 py-1.5 rounded-lg text-left transition-colors",
                                            isActive ? "bg-muted" : "hover:bg-muted/60"
                                        )}
                                    >
                                        <AccountAvatar account={a} size={6} />
                                        <div className="flex flex-col min-w-0 flex-1">
                                            <span className="text-[12.5px] font-medium text-foreground truncate leading-tight">@{a.username}</span>
                                            <span className="text-[10px] text-muted-foreground leading-tight">
                                                {a.is_paused ? "Safety pause" : a.token_status === "expired" ? "Token expired" : "Active"}
                                            </span>
                                        </div>
                                        {isActive && <Check className="w-3.5 h-3.5 text-foreground shrink-0" />}
                                    </button>
                                );
                            })}
                        </div>
                        <div className="border-t border-border p-1.5">
                            <button
                                onClick={() => void handleConnect()}
                                disabled={connecting}
                                className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-[12.5px] font-medium text-foreground hover:bg-muted/60 disabled:opacity-60 transition-colors"
                            >
                                {connecting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                                {connecting ? "Redirecting…" : "Add account"}
                            </button>
                            {connectError && <p className="px-2 pb-1 text-[11px] text-destructive">{connectError}</p>}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}

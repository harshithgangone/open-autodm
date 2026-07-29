"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Instagram, CheckCircle2, XCircle, Loader2, Unlink, AlertTriangle, RefreshCw, Wrench, PauseCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { createBrowserClient } from "@/lib/supabase";
import { apiClient, ApiError } from "@/lib/api/client";
import { useInstagramAccounts, useRefreshInstagramToken, useResubscribeWebhook, useCheckSubscription } from "@/hooks/useInstagramAccounts";
import { useSetupStatus } from "@/hooks/useSetup";
import { useQueryClient } from "@tanstack/react-query";

export default function SettingsPage() {
    return (
        <Suspense fallback={<div className="w-full max-w-3xl mx-auto py-24 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>}>
            <SettingsContent />
        </Suspense>
    );
}

function SettingsContent() {
    const searchParams = useSearchParams();
    const queryClient = useQueryClient();
    const { data: accounts, isLoading } = useInstagramAccounts();
    const { data: setup } = useSetupStatus();

    const refreshMutation = useRefreshInstagramToken();
    const resubscribeMutation = useResubscribeWebhook();
    const checkSubscriptionMutation = useCheckSubscription();
    const [connectingIG, setConnectingIG] = useState(false);
    const [disconnectingId, setDisconnectingId] = useState<string | null>(null);
    const [refreshingId, setRefreshingId] = useState<string | null>(null);
    const [resubscribingId, setResubscribingId] = useState<string | null>(null);
    const [checkingSubId, setCheckingSubId] = useState<string | null>(null);
    const [subStatus, setSubStatus] = useState<Record<string, { subscribedFields: string[]; hasComments: boolean; hasMessages: boolean } | null>>({});
    const [banner, setBanner] = useState<{ type: "success" | "error"; message: string } | null>(null);

    // Handle Instagram OAuth callback query params
    useEffect(() => {
        const igConnected = searchParams.get("instagram_connected");
        const igError = searchParams.get("instagram_error");

        if (igConnected === "true") {
            setBanner({ type: "success", message: "Instagram account connected successfully!" });
            void queryClient.invalidateQueries({ queryKey: ["instagram-accounts"] });
            window.history.replaceState({}, "", "/settings");
        } else if (igError) {
            const errorMessages: Record<string, string> = {
                access_denied: "Instagram connection was cancelled.",
                no_instagram_business_account: "No Instagram Business or Creator account found. Switch your Instagram to Business or Creator first.",
                account_already_connected: "This Instagram account is already connected to another user on this instance.",
                state_mismatch: "Connection expired or invalid. Please try again.",
                setup_required: "Complete the Setup Wizard (Meta app credentials) before connecting Instagram.",
                server_error: "Something went wrong. Check the debug info and try again.",
                invalid_callback: "Invalid callback. Please try again.",
            };
            const debugDetail = searchParams.get("debug");
            setBanner({
                type: "error",
                message: (errorMessages[igError] ?? `Error: ${igError}`) + (debugDetail ? ` — ${debugDetail}` : ""),
            });
            window.history.replaceState({}, "", "/settings");
        }
    }, [searchParams, queryClient]);

    // Auto-dismiss banner after 8 seconds
    useEffect(() => {
        if (!banner) return;
        const timer = setTimeout(() => setBanner(null), 8000);
        return () => clearTimeout(timer);
    }, [banner]);

    const handleConnectInstagram = async () => {
        setConnectingIG(true);
        try {
            const { url } = await apiClient<{ url: string }>("/instagram/connect");
            window.location.href = url;
        } catch (err) {
            const message = err instanceof ApiError ? err.message : "Failed to start Instagram connection";
            setBanner({ type: "error", message });
            setConnectingIG(false);
        }
    };

    const handleDisconnect = async (accountId: string) => {
        if (!confirm("Disconnect this Instagram account? All automations attached to it will be deleted.")) return;
        setDisconnectingId(accountId);
        try {
            await apiClient(`/instagram/disconnect/${accountId}`, { method: "DELETE" });
            void queryClient.invalidateQueries({ queryKey: ["instagram-accounts"] });
            setBanner({ type: "success", message: "Instagram account disconnected." });
        } catch (err) {
            const message = err instanceof ApiError ? err.message : "Failed to disconnect account";
            setBanner({ type: "error", message });
        } finally {
            setDisconnectingId(null);
        }
    };

    const handleCheckSubscription = async (accountId: string) => {
        setCheckingSubId(accountId);
        try {
            const result = await checkSubscriptionMutation.mutateAsync(accountId);
            setSubStatus(prev => ({ ...prev, [accountId]: result }));
        } catch {
            setSubStatus(prev => ({ ...prev, [accountId]: null }));
        } finally {
            setCheckingSubId(null);
        }
    };

    const handleResubscribe = async (accountId: string) => {
        setResubscribingId(accountId);
        try {
            const result = await resubscribeMutation.mutateAsync(accountId);
            setBanner({ type: "success", message: `Webhook subscription refreshed! Fields: ${result.subscribedFields}. Comment on one of your posts to test.` });
            void handleCheckSubscription(accountId);
        } catch (err) {
            const message = err instanceof ApiError ? err.message : "Failed to resubscribe webhook";
            setBanner({ type: "error", message: `Webhook resubscription failed: ${message}` });
        } finally {
            setResubscribingId(null);
        }
    };

    const handleRefreshToken = async (accountId: string) => {
        setRefreshingId(accountId);
        try {
            await refreshMutation.mutateAsync(accountId);
            setBanner({ type: "success", message: "Token refreshed — good for another 60 days. (The cron also does this automatically.)" });
        } catch (err) {
            const apiErr = err instanceof ApiError ? err : null;
            if (apiErr?.status === 400) {
                setBanner({ type: "error", message: "Token has expired. Please reconnect your Instagram account." });
            } else {
                setBanner({ type: "error", message: "Failed to refresh token. Please try again." });
            }
        } finally {
            setRefreshingId(null);
        }
    };

    const handleSignOut = async () => {
        const supabase = createBrowserClient();
        await supabase.auth.signOut();
        window.location.href = "/";
    };

    return (
        <div className="w-full max-w-3xl mx-auto space-y-10 pb-12">
            <div>
                <h1 className="text-3xl font-heading font-extrabold text-foreground">Settings</h1>
                <p className="text-muted-foreground mt-1 text-sm">Manage your connected accounts and this instance.</p>
            </div>

            {/* Status Banner */}
            {banner && (
                <div className={cn(
                    "flex items-center gap-3 p-4 rounded-2xl border text-sm font-medium",
                    banner.type === "success"
                        ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400"
                        : "bg-destructive/10 border-destructive/30 text-destructive"
                )}>
                    {banner.type === "success"
                        ? <CheckCircle2 className="w-5 h-5 shrink-0" />
                        : <XCircle className="w-5 h-5 shrink-0" />}
                    {banner.message}
                </div>
            )}

            {/* Meta App */}
            <section className="bg-card border border-border rounded-3xl p-6 flex items-center justify-between gap-4">
                <div>
                    <h2 className="text-lg font-bold font-heading text-foreground">Meta App</h2>
                    <p className="text-sm text-muted-foreground mt-0.5">
                        {setup?.configured
                            ? <>Configured — App ID <code className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">{setup.metaAppId}</code></>
                            : "Not configured yet — the automation engine is offline until you finish setup."}
                    </p>
                </div>
                <Link
                    href="/setup"
                    className={cn(
                        "inline-flex items-center gap-2 px-4 py-2 rounded-xl font-bold text-sm transition-all active:scale-95 shrink-0",
                        setup?.configured
                            ? "border border-border hover:bg-muted text-foreground"
                            : "bg-[#F97316] text-white hover:bg-[#ea580c] shadow-lg shadow-[#F97316]/20"
                    )}
                >
                    <Wrench className="w-4 h-4" />
                    {setup?.configured ? "Open Setup Wizard" : "Complete Setup"}
                </Link>
            </section>

            {/* Connected Accounts */}
            <section className="bg-card border border-border rounded-3xl p-6 space-y-5">
                <div className="flex items-center justify-between">
                    <div>
                        <h2 className="text-lg font-bold font-heading text-foreground">Instagram Accounts</h2>
                        <p className="text-sm text-muted-foreground mt-0.5">
                            Connect your Instagram Business or Creator account to enable automations.
                        </p>
                    </div>
                    <button
                        onClick={handleConnectInstagram}
                        disabled={connectingIG}
                        className="inline-flex items-center gap-2 bg-[#F97316] text-white hover:bg-[#ea580c] disabled:opacity-70 px-4 py-2 rounded-xl font-bold text-sm shadow-lg shadow-[#F97316]/20 transition-all active:scale-95 shrink-0"
                    >
                        {connectingIG ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                            <Instagram className="w-4 h-4" />
                        )}
                        {connectingIG ? "Connecting..." : "Connect Instagram"}
                    </button>
                </div>

                <div className="space-y-3">
                    {isLoading ? (
                        <div className="space-y-3">
                            {[1, 2].map((i) => (
                                <div key={i} className="h-20 rounded-2xl bg-muted/40 animate-pulse" />
                            ))}
                        </div>
                    ) : accounts && accounts.length > 0 ? (
                        accounts.map((account) => (
                            <div key={account.id} className="space-y-2">
                                {/* Circuit breaker pause banner */}
                                {account.is_paused && (
                                    <div className="flex items-center gap-3 px-4 py-2.5 rounded-xl text-xs font-medium border bg-destructive/10 border-destructive/30 text-destructive">
                                        <PauseCircle className="w-4 h-4 shrink-0" />
                                        <span>
                                            <b>Safety pause active</b> — Instagram flagged sends from this account, so the engine paused
                                            all DMs until {account.paused_until ? new Date(account.paused_until).toLocaleString() : "later"} to
                                            protect your account. {account.pause_reason ? `Reason: ${account.pause_reason}` : ""}
                                        </span>
                                    </div>
                                )}

                                {/* Token expiry warning banner */}
                                {account.token_status !== "ok" && (
                                    <div className={cn(
                                        "flex items-center justify-between gap-3 px-4 py-2.5 rounded-xl text-xs font-medium border",
                                        account.token_status === "expired"
                                            ? "bg-destructive/10 border-destructive/30 text-destructive"
                                            : "bg-amber-500/10 border-amber-500/30 text-amber-600 dark:text-amber-400"
                                    )}>
                                        <div className="flex items-center gap-2">
                                            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                                            {account.token_status === "expired"
                                                ? "Access token expired — automations are paused. Reconnect to resume."
                                                : `Access token expires in ${account.token_days_remaining} day${account.token_days_remaining === 1 ? "" : "s"} — the cron refreshes it automatically, or refresh now.`
                                            }
                                        </div>
                                        {account.token_status === "expiring" ? (
                                            <button
                                                onClick={() => handleRefreshToken(account.id)}
                                                disabled={refreshingId === account.id}
                                                className="inline-flex items-center gap-1 font-bold shrink-0 hover:opacity-80 transition-opacity"
                                            >
                                                {refreshingId === account.id
                                                    ? <Loader2 className="w-3 h-3 animate-spin" />
                                                    : <RefreshCw className="w-3 h-3" />
                                                }
                                                Refresh token
                                            </button>
                                        ) : (
                                            <button
                                                onClick={handleConnectInstagram}
                                                disabled={connectingIG}
                                                className="inline-flex items-center gap-1 font-bold shrink-0 hover:opacity-80 transition-opacity"
                                            >
                                                {connectingIG ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
                                                Reconnect
                                            </button>
                                        )}
                                    </div>
                                )}

                                <div className={cn(
                                    "flex items-center justify-between p-4 rounded-2xl bg-muted/30 border",
                                    account.token_status === "expired"
                                        ? "border-destructive/30"
                                        : account.token_status === "expiring"
                                        ? "border-amber-500/30"
                                        : "border-border/50"
                                )}>
                                    <div className="flex items-center gap-3">
                                        <div className="relative w-10 h-10 rounded-full bg-gradient-to-tr from-[#f09433] via-[#e6683c] to-[#bc1888] p-[2px] shrink-0">
                                            <div className="w-full h-full rounded-full bg-background overflow-hidden flex items-center justify-center">
                                                {account.profile_picture_url ? (
                                                    <img
                                                        src={account.profile_picture_url}
                                                        alt={account.username}
                                                        className="w-full h-full object-cover"
                                                    />
                                                ) : (
                                                    <Instagram className="w-5 h-5 text-foreground/70" />
                                                )}
                                            </div>
                                        </div>
                                        <div>
                                            <div className="flex items-center gap-2">
                                                <span className="font-bold text-foreground">@{account.username}</span>
                                                {account.token_status === "ok" && !account.is_paused
                                                    ? <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                                                    : <AlertTriangle className={cn("w-4 h-4", account.token_status === "expired" ? "text-destructive" : "text-amber-500")} />
                                                }
                                            </div>
                                            <span className="text-xs text-muted-foreground">
                                                Connected {new Date(account.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                                            </span>
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-2">
                                        <button
                                            onClick={() => handleCheckSubscription(account.id)}
                                            disabled={checkingSubId === account.id}
                                            title="Check which webhook fields Meta has subscribed for this account"
                                            className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-blue-400 hover:bg-blue-400/10 px-3 py-1.5 rounded-lg transition-colors"
                                        >
                                            {checkingSubId === account.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                                            {checkingSubId === account.id ? "Checking..." : "Check Status"}
                                        </button>
                                        <button
                                            onClick={() => handleResubscribe(account.id)}
                                            disabled={resubscribingId === account.id}
                                            title="Re-sync webhook subscription so Instagram delivers comment events"
                                            className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-emerald-500 hover:bg-emerald-500/10 px-3 py-1.5 rounded-lg transition-colors"
                                        >
                                            {resubscribingId === account.id ? (
                                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                            ) : (
                                                <RefreshCw className="w-3.5 h-3.5" />
                                            )}
                                            {resubscribingId === account.id ? "Syncing..." : "Fix Webhooks"}
                                        </button>
                                        <button
                                            onClick={() => handleDisconnect(account.id)}
                                            disabled={disconnectingId === account.id}
                                            className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-destructive hover:bg-destructive/10 px-3 py-1.5 rounded-lg transition-colors"
                                        >
                                            {disconnectingId === account.id ? (
                                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                            ) : (
                                                <Unlink className="w-3.5 h-3.5" />
                                            )}
                                            Disconnect
                                        </button>
                                    </div>
                                </div>

                                {/* Subscription status — shown after Check Status */}
                                {subStatus[account.id] !== undefined && (
                                    <div className={cn(
                                        "mt-2 px-4 py-3 rounded-xl text-xs border font-mono",
                                        subStatus[account.id] === null
                                            ? "bg-destructive/10 border-destructive/30 text-destructive"
                                            : subStatus[account.id]?.hasComments
                                            ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                                            : "bg-amber-500/10 border-amber-500/30 text-amber-400"
                                    )}>
                                        {subStatus[account.id] === null ? (
                                            <span>Failed to fetch subscription status from Meta.</span>
                                        ) : (
                                            <div className="space-y-1">
                                                <div className="flex items-center gap-3">
                                                    <span className={cn("font-bold", subStatus[account.id]?.hasComments ? "text-emerald-400" : "text-red-400")}>
                                                        {subStatus[account.id]?.hasComments ? "✓ comments" : "✗ comments"}
                                                    </span>
                                                    <span className={cn("font-bold", subStatus[account.id]?.hasMessages ? "text-emerald-400" : "text-amber-400")}>
                                                        {subStatus[account.id]?.hasMessages ? "✓ messages" : "✗ messages"}
                                                    </span>
                                                </div>
                                                <div className="text-muted-foreground text-[10px]">
                                                    All subscribed: {subStatus[account.id]?.subscribedFields.join(", ") || "none"}
                                                </div>
                                                {!subStatus[account.id]?.hasComments && (
                                                    <div className="text-amber-400 text-[10px] mt-1">
                                                        ⚠ comments not subscribed — click &quot;Fix Webhooks&quot;. If it still fails, verify the webhook
                                                        Callback URL is saved and verified in the Meta portal.
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        ))
                    ) : (
                        <div className="text-center py-8 text-muted-foreground text-sm">
                            <Instagram className="w-8 h-8 mx-auto mb-3 opacity-30" />
                            <p>No Instagram accounts connected yet.</p>
                            <p className="mt-1 text-xs">Connect your account above to start creating automations.</p>
                        </div>
                    )}
                </div>
            </section>

            {/* Account */}
            <section className="bg-card border border-border rounded-3xl p-6">
                <h2 className="text-lg font-bold font-heading text-foreground mb-4">Account</h2>
                <button
                    onClick={handleSignOut}
                    className="text-sm font-semibold text-muted-foreground hover:text-destructive transition-colors"
                >
                    Sign out
                </button>
            </section>
        </div>
    );
}

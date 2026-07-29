"use client";

/**
 * Setup Wizard — walks the self-hoster from "fresh deployment" to
 * "webhook verified in the Meta portal" in four guided steps:
 *
 *  1. Create a Meta app (guided external instructions)
 *  2. Paste App ID + App Secret (stored encrypted in their Supabase)
 *  3. Copy webhook URL + verify token + OAuth redirect URI into the Meta portal
 *  4. Enable the background cron (one SQL snippet for their Supabase)
 */

import { useState } from "react";
import { motion } from "framer-motion";
import {
    Wrench, KeyRound, Webhook, Clock3, CheckCircle2, Copy, Check,
    ExternalLink, Loader2, ShieldCheck, AlertTriangle
} from "lucide-react";
import { useSetupStatus, useSaveSetup } from "@/hooks/useSetup";
import { cn } from "@/lib/utils";

function CopyField({ label, value, mono = true }: { label: string; value: string; mono?: boolean }) {
    const [copied, setCopied] = useState(false);
    const copy = () => {
        void navigator.clipboard.writeText(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
    };
    return (
        <div>
            <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest block mb-1">{label}</label>
            <div className="flex items-center gap-2">
                <code className={cn(
                    "flex-1 text-xs bg-muted/40 border border-border rounded-xl px-3 py-2.5 break-all select-all",
                    mono && "font-mono"
                )}>
                    {value}
                </code>
                <button
                    onClick={copy}
                    className="p-2.5 rounded-xl border border-border hover:bg-muted text-muted-foreground hover:text-foreground transition-colors shrink-0"
                    title="Copy"
                >
                    {copied ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
                </button>
            </div>
        </div>
    );
}

function StepCard({
    step, title, icon: Icon, done, children,
}: {
    step: number;
    title: string;
    icon: React.ComponentType<{ className?: string }>;
    done?: boolean;
    children: React.ReactNode;
}) {
    return (
        <motion.section
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: step * 0.08 }}
            className="bg-card border border-border rounded-3xl overflow-hidden"
        >
            <div className="flex items-center gap-3 px-6 py-4 border-b border-border bg-muted/20">
                <div className={cn(
                    "w-9 h-9 rounded-xl flex items-center justify-center shrink-0",
                    done ? "bg-emerald-500/10" : "bg-primary/10"
                )}>
                    {done ? <CheckCircle2 className="w-5 h-5 text-emerald-500" /> : <Icon className="w-5 h-5 text-primary" />}
                </div>
                <div className="flex items-center gap-2.5">
                    <span className="text-[10px] font-extrabold text-muted-foreground uppercase tracking-widest">Step {step}</span>
                    <h2 className="text-base font-heading font-bold text-foreground">{title}</h2>
                </div>
            </div>
            <div className="p-6">{children}</div>
        </motion.section>
    );
}

export default function SetupPage() {
    const { data: setup, isLoading } = useSetupStatus();
    const saveMutation = useSaveSetup();

    const [appId, setAppId] = useState("");
    const [appSecret, setAppSecret] = useState("");
    const [fbAppSecret, setFbAppSecret] = useState("");
    const [saveError, setSaveError] = useState<string | null>(null);
    const [justSaved, setJustSaved] = useState(false);

    const handleSave = () => {
        setSaveError(null);
        saveMutation.mutate(
            {
                metaAppId: appId.trim(),
                metaAppSecret: appSecret.trim(),
                ...(fbAppSecret.trim() ? { metaFbAppSecret: fbAppSecret.trim() } : {}),
            },
            {
                onSuccess: () => { setJustSaved(true); setAppSecret(""); setFbAppSecret(""); },
                onError: (err) => setSaveError(err.message),
            }
        );
    };

    if (isLoading) {
        return (
            <div className="w-full max-w-3xl mx-auto py-24 flex justify-center">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
        );
    }

    const configured = !!setup?.configured;

    return (
        <div className="w-full max-w-3xl mx-auto space-y-6 pb-16">
            <div className="flex items-start justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-heading font-extrabold text-foreground flex items-center gap-3">
                        <Wrench className="w-7 h-7 text-primary" />
                        Setup Wizard
                    </h1>
                    <p className="text-muted-foreground mt-1 text-sm max-w-xl">
                        Connect your own (free) Meta developer app. Everything you enter here is stored
                        AES-256-GCM encrypted in <span className="font-semibold">your</span> Supabase database.
                    </p>
                </div>
                {configured && (
                    <span className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-500 bg-emerald-500/10 border border-emerald-500/20 px-3 py-1.5 rounded-full shrink-0 mt-1">
                        <ShieldCheck className="w-3.5 h-3.5" /> Configured
                    </span>
                )}
            </div>

            {/* ── Step 1: Create the Meta app ── */}
            <StepCard step={1} title="Create your Meta app" icon={ExternalLink} done={configured}>
                <ol className="space-y-2.5 text-sm text-foreground/90 list-none">
                    {[
                        <>Go to <a href="https://developers.facebook.com/apps" target="_blank" rel="noopener noreferrer" className="text-primary font-semibold underline underline-offset-2">developers.facebook.com/apps</a> and click <b>Create App</b>.</>,
                        <>Choose use case: <b>Other</b> → app type: <b>Business</b>.</>,
                        <>In the app dashboard, find <b>Instagram</b> → click <b>Set up</b> (this adds “Instagram API with Instagram Login”).</>,
                        <>Under <b>App settings → Basic</b>, copy your <b>App ID</b> and <b>App Secret</b> (click “Show”).</>,
                        <>Your Instagram account must be a <b>Business or Creator</b> account (switch in the Instagram app: Settings → Account type).</>,
                    ].map((content, i) => (
                        <li key={i} className="flex gap-3">
                            <span className="w-5 h-5 rounded-full bg-primary/10 text-primary text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">{i + 1}</span>
                            <span>{content}</span>
                        </li>
                    ))}
                </ol>
                <div className="mt-4 flex items-start gap-2 text-xs text-muted-foreground bg-muted/30 border border-border/50 rounded-xl px-3 py-2.5">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-amber-500" />
                    <span>
                        Your app stays in <b>Development mode</b> — that&apos;s perfect. Development mode delivers real webhooks
                        for the app admin&apos;s own Instagram account, so <b>you never need Meta App Review</b> to automate your own account.
                    </span>
                </div>
            </StepCard>

            {/* ── Step 2: Credentials ── */}
            <StepCard step={2} title="Enter your app credentials" icon={KeyRound} done={configured && !justSaved}>
                {configured && (
                    <div className="mb-4 flex items-center gap-2 text-xs font-medium text-emerald-500 bg-emerald-500/10 border border-emerald-500/20 rounded-xl px-3 py-2.5">
                        <CheckCircle2 className="w-4 h-4 shrink-0" />
                        Credentials saved for App ID <code className="font-mono font-bold">{setup?.metaAppId}</code>.
                        Re-enter both fields below only if you need to change them.
                    </div>
                )}
                <div className="space-y-3">
                    <div>
                        <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest block mb-1">Meta App ID</label>
                        <input
                            value={appId}
                            onChange={(e) => setAppId(e.target.value)}
                            placeholder={setup?.metaAppId ?? "e.g. 1234567890123456"}
                            className="w-full text-sm font-mono bg-background border border-border rounded-xl px-3 py-2.5 outline-none focus:border-primary/50 transition-colors"
                        />
                    </div>
                    <div>
                        <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest block mb-1">Meta App Secret</label>
                        <input
                            type="password"
                            value={appSecret}
                            onChange={(e) => setAppSecret(e.target.value)}
                            placeholder="32-character hex secret — stored encrypted"
                            className="w-full text-sm font-mono bg-background border border-border rounded-xl px-3 py-2.5 outline-none focus:border-primary/50 transition-colors"
                        />
                        <p className="text-[10px] text-muted-foreground/70 mt-1">
                            Encrypted with your TOKEN_ENCRYPTION_KEY before it touches the database. Never logged, never displayed again.
                        </p>
                    </div>
                    <div>
                        <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest block mb-1">
                            Facebook App Secret <span className="text-muted-foreground/50 normal-case font-medium">(optional)</span>
                        </label>
                        <input
                            type="password"
                            value={fbAppSecret}
                            onChange={(e) => setFbAppSecret(e.target.value)}
                            placeholder="Only needed if webhook signature checks fail"
                            className="w-full text-sm font-mono bg-background border border-border rounded-xl px-3 py-2.5 outline-none focus:border-primary/50 transition-colors"
                        />
                        <p className="text-[10px] text-muted-foreground/70 mt-1">
                            Meta signs webhooks with either the Instagram or the Facebook app secret depending on app type.
                            If the debug panel shows &quot;signature mismatch&quot; on real events, paste the App Secret from
                            App settings → Basic here — verification then accepts both.
                        </p>
                    </div>
                    {saveError && <p className="text-xs text-destructive font-medium">{saveError}</p>}
                    {justSaved && <p className="text-xs text-emerald-500 font-semibold">Saved! Continue with Step 3 below.</p>}
                    <button
                        onClick={handleSave}
                        disabled={saveMutation.isPending || !appId.trim() || !appSecret.trim()}
                        className="inline-flex items-center gap-2 bg-[#F97316] text-white hover:bg-[#ea580c] disabled:opacity-50 px-5 py-2.5 rounded-xl font-bold text-sm shadow-lg shadow-[#F97316]/20 transition-all active:scale-95"
                    >
                        {saveMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />}
                        {saveMutation.isPending ? "Saving..." : "Save Credentials"}
                    </button>
                </div>
            </StepCard>

            {/* ── Step 3: Meta portal wiring ── */}
            <StepCard step={3} title="Wire up the Meta portal" icon={Webhook}>
                {!configured && !justSaved ? (
                    <p className="text-sm text-muted-foreground">Complete Step 2 first — your webhook verify token is generated when you save credentials.</p>
                ) : (
                    <div className="space-y-5">
                        <div>
                            <p className="text-sm font-semibold text-foreground mb-3">
                                A. Webhooks — in your Meta app: <span className="text-muted-foreground font-medium">Instagram → API setup with Instagram login → Step 2 “Configure webhooks”</span>
                            </p>
                            <div className="space-y-3">
                                <CopyField label="Callback URL" value={setup?.webhookUrl ?? ""} />
                                <CopyField label="Verify Token" value={setup?.webhookVerifyToken ?? ""} />
                            </div>
                            <p className="text-xs text-muted-foreground mt-2">
                                Click <b>Verify and save</b> in the portal, then subscribe to the <b>comments</b> and <b>messages</b> fields.
                            </p>
                        </div>
                        <div className="h-px bg-border/60" />
                        <div>
                            <p className="text-sm font-semibold text-foreground mb-3">
                                B. Business Login — <span className="text-muted-foreground font-medium">Instagram → API setup with Instagram login → Step 3 “Set up Instagram business login”</span>
                            </p>
                            <CopyField label="Valid OAuth Redirect URI" value={setup?.oauthRedirectUri ?? ""} />
                            <p className="text-xs text-muted-foreground mt-2">
                                Paste it under <b>Business login settings → OAuth redirect URIs</b> — it must match character-for-character.
                            </p>
                        </div>
                    </div>
                )}
            </StepCard>

            {/* ── Step 4: Background cron ── */}
            <StepCard step={4} title="Enable the background engine (1 SQL snippet)" icon={Clock3}>
                <p className="text-sm text-muted-foreground mb-3">
                    Most DMs send instantly when the webhook fires. This cron is the safety net that delivers
                    <b> rate-limited overflow, retries and token auto-refresh</b>. Open your Supabase project →
                    <b> SQL Editor</b>, replace <code className="font-mono text-xs bg-muted px-1 rounded">YOUR_CRON_SECRET</code> with
                    the CRON_SECRET from your deployment env vars, and run:
                </p>
                <div className="relative">
                    <pre className="text-[11px] font-mono bg-zinc-950 text-zinc-200 border border-border rounded-xl p-4 overflow-x-auto whitespace-pre">
                        {setup?.cronSnippet ?? ""}
                    </pre>
                    <button
                        onClick={() => void navigator.clipboard.writeText(setup?.cronSnippet ?? "")}
                        className="absolute top-2.5 right-2.5 p-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition-colors"
                        title="Copy SQL"
                    >
                        <Copy className="w-3.5 h-3.5" />
                    </button>
                </div>
                <p className="text-xs text-muted-foreground mt-3">
                    Verify it works: the query <code className="font-mono bg-muted px-1 rounded">select * from cron.job;</code> should
                    list <code className="font-mono bg-muted px-1 rounded">open-autodm-process-jobs</code>.
                </p>
            </StepCard>

            {/* Done card */}
            {configured && (
                <motion.div
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="rounded-3xl border border-emerald-500/25 bg-emerald-500/5 p-6 flex items-start gap-4"
                >
                    <CheckCircle2 className="w-6 h-6 text-emerald-500 shrink-0" />
                    <div>
                        <p className="font-bold text-foreground">Setup complete — next: connect Instagram</p>
                        <p className="text-sm text-muted-foreground mt-1">
                            Head to <a href="/settings" className="text-primary font-semibold underline underline-offset-2">Settings</a> and
                            click <b>Connect Instagram</b>. Log in with the same Instagram account that owns (or is a tester on) your Meta app.
                        </p>
                    </div>
                </motion.div>
            )}
        </div>
    );
}

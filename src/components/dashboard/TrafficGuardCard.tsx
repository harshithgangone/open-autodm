'use client';

import { useState } from 'react';
import {
  ShieldAlert,
  ShieldCheck,
  Activity,
  AlertTriangle,
  PauseCircle,
  PlayCircle,
  Clock,
  CheckCircle2,
  Info,
  RefreshCw,
} from 'lucide-react';
import { useTrafficGuard } from '@/hooks/useTrafficGuard';
import { cn } from '@/lib/utils';

interface TrafficGuardCardProps {
  accountId: string | null;
}

export function TrafficGuardCard({ accountId }: TrafficGuardCardProps) {
  const {
    data: guard,
    isLoading,
    pauseAccount,
    isPausing,
    resumeAccount,
    isResuming,
    refetch,
    isRefetching,
  } = useTrafficGuard(accountId);

  const [actionError, setActionError] = useState<string | null>(null);

  if (!accountId || isLoading) {
    return (
      <div className="bg-card border border-border rounded-xl p-5 animate-pulse">
        <div className="h-5 w-44 bg-muted rounded mb-3" />
        <div className="h-16 bg-muted/60 rounded" />
      </div>
    );
  }

  if (!guard) return null;

  const status = guard.traffic_status;
  const isHighTraffic = status === 'high_traffic';
  const isRecovered = status === 'recovered';
  const isPaused = guard.is_paused;
  const incident = guard.incident;
  const currentCount = guard.current_60s_count;
  const highThreshold = guard.settings?.high_traffic_threshold ?? 20;
  const recoveryThreshold = guard.settings?.recovery_threshold ?? 5;

  const handlePause = async () => {
    if (!incident?.id) return;
    setActionError(null);
    try {
      await pauseAccount({ accountId, incidentId: incident.id });
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to pause account');
    }
  };

  const handleResume = async () => {
    if (!guard.paused_incident_id) return;
    setActionError(null);
    try {
      await resumeAccount({ accountId, incidentId: guard.paused_incident_id });
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to resume account');
    }
  };

  return (
    <div className={cn(
      "relative bg-card rounded-xl border transition-all overflow-hidden",
      isHighTraffic
        ? "border-rose-500/40 shadow-sm shadow-rose-500/5 bg-gradient-to-br from-card via-card to-rose-500/5"
        : isRecovered
        ? "border-sky-500/40 shadow-sm shadow-sky-500/5 bg-gradient-to-br from-card via-card to-sky-500/5"
        : "border-border"
    )}>
      {/* Top Banner Alert when in High Traffic or Recovered */}
      {isHighTraffic && !isPaused && (
        <div className="flex items-center justify-between gap-3 px-4 py-2.5 bg-rose-500/15 border-b border-rose-500/20 text-rose-600 dark:text-rose-400 text-[13px] font-medium">
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 shrink-0 animate-pulse" />
            <span>Unusually high comment traffic ({currentCount} unique comments in last 60s)</span>
          </div>
          <span className="text-[11px] uppercase tracking-wider font-semibold px-2 py-0.5 rounded bg-rose-500/20">
            High Traffic
          </span>
        </div>
      )}

      {isRecovered && isPaused && (
        <div className="flex items-center justify-between gap-3 px-4 py-2.5 bg-sky-500/15 border-b border-sky-500/20 text-sky-600 dark:text-sky-400 text-[13px] font-medium">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>Traffic has normalized (&lt; {recoveryThreshold} comments/60s for 5m). Ready to resume.</span>
          </div>
          <span className="text-[11px] uppercase tracking-wider font-semibold px-2 py-0.5 rounded bg-sky-500/20">
            Recovered
          </span>
        </div>
      )}

      <div className="p-5 space-y-4">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-[15px] font-heading font-semibold text-foreground flex items-center gap-2">
                <Activity className="w-4 h-4 text-primary shrink-0" />
                Smart Comment Traffic Guard
              </h2>
              <span className={cn(
                "inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium border",
                isHighTraffic
                  ? "bg-rose-500/10 text-rose-500 border-rose-500/20"
                  : isRecovered
                  ? "bg-sky-500/10 text-sky-500 border-sky-500/20"
                  : "bg-emerald-500/10 text-emerald-500 border-emerald-500/20"
              )}>
                <span className={cn(
                  "w-1.5 h-1.5 rounded-full",
                  isHighTraffic ? "bg-rose-500 animate-ping" : isRecovered ? "bg-sky-500" : "bg-emerald-500"
                )} />
                {isHighTraffic ? "High Traffic Incident" : isRecovered ? "Recovered (Normal)" : "Normal Traffic"}
              </span>
            </div>
            <p className="text-[12px] text-muted-foreground mt-0.5">
              Rolling 60-second unique comment monitor &amp; proactive Meta rate-limit protection.
            </p>
          </div>

          <button
            onClick={() => refetch()}
            disabled={isRefetching}
            className="p-1.5 rounded-lg border border-border text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-50"
            title="Refresh metrics"
          >
            <RefreshCw className={cn("w-3.5 h-3.5", isRefetching && "animate-spin")} />
          </button>
        </div>

        {actionError && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-destructive/10 text-destructive text-[12px]">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
            <span>{actionError}</span>
          </div>
        )}

        {/* Metrics Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          <div className="bg-muted/40 border border-border rounded-lg p-3">
            <span className="micro-label block text-muted-foreground">Rolling 60s Volume</span>
            <div className="flex items-baseline gap-1 mt-1">
              <span className="text-xl font-heading font-semibold tabular-nums text-foreground">
                {currentCount}
              </span>
              <span className="text-[11px] text-muted-foreground">comments</span>
            </div>
          </div>

          <div className="bg-muted/40 border border-border rounded-lg p-3">
            <span className="micro-label block text-muted-foreground">High Threshold</span>
            <div className="flex items-baseline gap-1 mt-1">
              <span className="text-xl font-heading font-semibold tabular-nums text-foreground">
                {highThreshold}
              </span>
              <span className="text-[11px] text-muted-foreground">/ 60s</span>
            </div>
          </div>

          <div className="bg-muted/40 border border-border rounded-lg p-3">
            <span className="micro-label block text-muted-foreground">Recovery Criteria</span>
            <div className="flex items-baseline gap-1 mt-1">
              <span className="text-xl font-heading font-semibold tabular-nums text-foreground">
                &lt; {recoveryThreshold}
              </span>
              <span className="text-[11px] text-muted-foreground">for 5m</span>
            </div>
          </div>

          <div className="bg-muted/40 border border-border rounded-lg p-3">
            <span className="micro-label block text-muted-foreground">Guard Paused</span>
            <div className="flex items-baseline gap-1 mt-1">
              <span className="text-xl font-heading font-semibold tabular-nums text-foreground">
                {guard.paused_by_guard_count}
              </span>
              <span className="text-[11px] text-muted-foreground">automations</span>
            </div>
          </div>
        </div>

        {/* Status Callout & Controls */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-3.5 rounded-lg bg-muted/30 border border-border">
          <div className="space-y-0.5">
            <p className="text-[13px] font-medium text-foreground flex items-center gap-1.5">
              {isHighTraffic && !isPaused && (
                <>
                  <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0" />
                  Spike active: Consider pausing to protect creator account.
                </>
              )}
              {isHighTraffic && isPaused && (
                <>
                  <PauseCircle className="w-4 h-4 text-amber-500 shrink-0" />
                  Automations safely paused. {guard.held_jobs_count} queued jobs held.
                </>
              )}
              {isRecovered && isPaused && (
                <>
                  <CheckCircle2 className="w-4 h-4 text-sky-500 shrink-0" />
                  Traffic normalized: Ready to resume {guard.paused_by_guard_count} paused automations.
                </>
              )}
              {status === 'normal' && (
                <>
                  <ShieldCheck className="w-4 h-4 text-emerald-500 shrink-0" />
                  Traffic within normal bounds. All safeguards active.
                </>
              )}
            </p>
            <p className="text-[12px] text-muted-foreground">
              {isPaused
                ? "Queued jobs are held without deletion. Resuming will safely reactivate them."
                : "Detection never automatically changes your automations without owner confirmation."}
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2 shrink-0 w-full sm:w-auto">
            {isHighTraffic && !isPaused && incident?.id && !incident.resumed_at && (
              <button
                onClick={handlePause}
                disabled={isPausing}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-[12px] font-semibold transition-colors disabled:opacity-50"
              >
                <PauseCircle className="w-3.5 h-3.5" />
                {isPausing ? "Pausing..." : "Pause account automations"}
              </button>
            )}

            {isPaused && guard.paused_incident_id && (
              <button
                onClick={handleResume}
                disabled={isResuming}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[12px] font-semibold transition-colors disabled:opacity-50"
              >
                <PlayCircle className="w-3.5 h-3.5" />
                {isResuming ? "Resuming..." : "Review and resume"}
              </button>
            )}
          </div>
        </div>

        {/* Incident History / Unread Notifications */}
        {guard.notifications && guard.notifications.length > 0 && (
          <div className="space-y-1.5 pt-1">
            <span className="micro-label block text-muted-foreground">Recent Traffic Guard Alerts</span>
            <div className="space-y-1">
              {guard.notifications.slice(0, 3).map((notif) => (
                <div
                  key={notif.id}
                  className="flex items-center justify-between gap-3 text-[12px] p-2 rounded-lg bg-muted/20 border border-border/60"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={cn(
                      "w-1.5 h-1.5 rounded-full shrink-0",
                      notif.type === 'high_traffic' ? "bg-rose-500" : "bg-sky-500"
                    )} />
                    <span className="font-medium text-foreground truncate">{notif.title}</span>
                    <span className="text-muted-foreground truncate hidden md:inline">{notif.message}</span>
                  </div>
                  <span className="text-[11px] text-muted-foreground shrink-0 tabular-nums">
                    {new Date(notif.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

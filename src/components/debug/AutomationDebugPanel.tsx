"use client";

/**
 * AutomationDebugPanel - real-time automation event log.
 *
 * Only rendered when NEXT_PUBLIC_DEBUG=true (add to .env.local).
 * Polls /debug/events every 2.5 seconds.
 * Shows every step from webhook received → signature check → account lookup
 * → keyword match → job enqueue → DM sent → session complete.
 */

import React, { useEffect, useRef, useState, useCallback } from "react";
import { apiClient } from "@/lib/api/client";
import { ChevronDown, ChevronUp, Trash2, RefreshCw, Circle } from "lucide-react";
import { cn } from "@/lib/utils";

interface DebugEvent {
  id: string;
  created_at: string;
  service: string;
  level: "info" | "warn" | "error";
  event_type: string;
  status: string;
  message: string;
  metadata: Record<string, unknown>;
}

const LEVEL_STYLES: Record<string, string> = {
  info:  "text-emerald-400 bg-emerald-400/10 border-emerald-400/20",
  warn:  "text-amber-400  bg-amber-400/10  border-amber-400/20",
  error: "text-red-400    bg-red-400/10    border-red-400/20",
};

const STATUS_STYLES: Record<string, string> = {
  ok:         "text-emerald-300",
  processing: "text-blue-300",
  skipped:    "text-amber-300",
  error:      "text-red-300",
};

const SERVICE_COLORS: Record<string, string> = {
  webhook:   "text-purple-400",
  worker:    "text-cyan-400",
  instagram: "text-pink-400",
};

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
}

function MetadataBlock({ metadata }: { metadata: Record<string, unknown> }) {
  const [open, setOpen] = useState(false);
  const keys = Object.keys(metadata).filter(k => metadata[k] !== null && metadata[k] !== undefined);
  if (keys.length === 0) return null;

  return (
    <div className="mt-1">
      <button
        onClick={() => setOpen(v => !v)}
        className="text-[10px] text-zinc-500 hover:text-zinc-300 transition-colors flex items-center gap-0.5"
      >
        {open ? <ChevronUp className="w-2.5 h-2.5" /> : <ChevronDown className="w-2.5 h-2.5" />}
        {open ? "hide" : `${keys.length} field${keys.length !== 1 ? "s" : ""}`}
      </button>
      {open && (
        <pre className="mt-1 text-[10px] text-zinc-400 bg-zinc-900/60 rounded-md px-2 py-1.5 overflow-x-auto max-w-full whitespace-pre-wrap break-all">
          {JSON.stringify(metadata, null, 2)}
        </pre>
      )}
    </div>
  );
}

export function AutomationDebugPanel(): React.ReactElement | null {
  // Only render in development debug mode
  if (process.env["NEXT_PUBLIC_DEBUG"] !== "true") return null;

  return <DebugPanelInner />;
}

function DebugPanelInner(): React.ReactElement {
  const [events, setEvents] = useState<DebugEvent[]>([]);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isLive, setIsLive] = useState(true);
  const [isClearing, setIsClearing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isAutoScrollRef = useRef(true);

  const fetchEvents = useCallback(async (): Promise<void> => {
    try {
      const res = await apiClient<{ events: DebugEvent[] }>("/debug/events");
      // API returns newest first; we display oldest first (append-style log)
      setEvents(res.events.slice().reverse());
      setLastUpdated(new Date());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load debug events");
    }
  }, []);

  // Auto-scroll to bottom whenever new events arrive
  useEffect(() => {
    if (isAutoScrollRef.current && scrollRef.current && !isCollapsed) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [events, isCollapsed]);

  // Poll every 2.5s when live
  useEffect(() => {
    if (isLive) {
      void fetchEvents();
      intervalRef.current = setInterval(() => { void fetchEvents(); }, 2500);
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isLive, fetchEvents]);

  const handleClear = async (): Promise<void> => {
    setIsClearing(true);
    try {
      await apiClient("/debug/events", { method: "DELETE" });
      setEvents([]);
    } catch {
      // ignore
    } finally {
      setIsClearing(false);
    }
  };

  const handleScroll = (): void => {
    if (!scrollRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
    isAutoScrollRef.current = scrollHeight - scrollTop - clientHeight < 60;
  };

  return (
    <div className="w-full rounded-2xl overflow-hidden border border-zinc-700/60 bg-zinc-950 shadow-2xl font-mono text-sm">

      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-zinc-900 border-b border-zinc-700/60">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setIsCollapsed(v => !v)}
            className="flex items-center gap-2 text-zinc-300 hover:text-white transition-colors"
          >
            {isCollapsed
              ? <ChevronDown className="w-3.5 h-3.5" />
              : <ChevronUp   className="w-3.5 h-3.5" />
            }
            <span className="text-xs font-bold tracking-widest uppercase text-zinc-400">
              Automation Debug Log
            </span>
          </button>

          {/* Live indicator */}
          <button
            onClick={() => setIsLive(v => !v)}
            className={cn(
              "flex items-center gap-1.5 text-[10px] font-bold px-2 py-0.5 rounded-full border transition-colors",
              isLive
                ? "text-emerald-400 bg-emerald-400/10 border-emerald-400/20"
                : "text-zinc-500 bg-zinc-700/30 border-zinc-600/30"
            )}
          >
            <Circle
              className={cn("w-2 h-2 fill-current", isLive && "animate-pulse")}
            />
            {isLive ? "LIVE" : "PAUSED"}
          </button>

          {!isCollapsed && (
            <span className="text-[10px] text-zinc-600">
              {events.length} event{events.length !== 1 ? "s" : ""}
              {lastUpdated && ` · ${formatTime(lastUpdated.toISOString())}`}
            </span>
          )}
        </div>

        {!isCollapsed && (
          <div className="flex items-center gap-1">
            <button
              onClick={() => { void fetchEvents(); }}
              className="p-1.5 text-zinc-500 hover:text-zinc-200 hover:bg-zinc-700/40 rounded-lg transition-colors"
              title="Refresh now"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => { void handleClear(); }}
              disabled={isClearing || events.length === 0}
              className="p-1.5 text-zinc-500 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-colors disabled:opacity-30"
              title="Clear all events"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* Event list */}
      {!isCollapsed && (
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          className="h-[380px] overflow-y-auto px-3 py-2 space-y-0.5"
          style={{ scrollbarWidth: "thin", scrollbarColor: "#3f3f46 transparent" }}
        >
          {error && (
            <div className="text-red-400 text-xs py-2 px-2">
              Error: {error}
            </div>
          )}

          {events.length === 0 && !error && (
            <div className="flex flex-col items-center justify-center h-full text-zinc-600 text-xs py-8 text-center">
              <p>No events yet.</p>
              <p className="mt-1 text-zinc-700">
                Comment on a post connected to an active automation to see events flow here.
              </p>
            </div>
          )}

          {events.map((event) => (
            <div
              key={event.id}
              className="group px-2 py-1.5 rounded-md hover:bg-zinc-800/40 transition-colors"
            >
              <div className="flex items-start gap-2 flex-wrap">
                {/* Timestamp */}
                <span className="text-[10px] text-zinc-600 shrink-0 mt-px w-[68px]">
                  {formatTime(event.created_at)}
                </span>

                {/* Level badge */}
                <span className={cn(
                  "text-[9px] font-black uppercase px-1.5 py-px rounded border shrink-0",
                  LEVEL_STYLES[event.level] ?? LEVEL_STYLES["info"]
                )}>
                  {event.level}
                </span>

                {/* Service */}
                <span className={cn(
                  "text-[10px] font-bold shrink-0",
                  SERVICE_COLORS[event.service] ?? "text-zinc-400"
                )}>
                  [{event.service}]
                </span>

                {/* Event type */}
                <span className="text-[10px] text-zinc-400 shrink-0">
                  {event.event_type}
                </span>

                {/* Status */}
                <span className={cn(
                  "text-[10px] font-bold shrink-0",
                  STATUS_STYLES[event.status] ?? "text-zinc-400"
                )}>
                  {event.status.toUpperCase()}
                </span>

                {/* Message */}
                <span className="text-[11px] text-zinc-200 flex-1 min-w-0 break-words">
                  {event.message}
                </span>
              </div>

              {/* Metadata expandable */}
              <div className="pl-[84px]">
                <MetadataBlock metadata={event.metadata} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

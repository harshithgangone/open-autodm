'use client';

import { useState, useRef, useEffect } from 'react';
import { Bell, Check, AlertTriangle, CheckCircle2, ShieldAlert, X } from 'lucide-react';
import { useActiveAccount } from '@/hooks/useActiveAccount';
import { useTrafficGuard } from '@/hooks/useTrafficGuard';
import { cn } from '@/lib/utils';

export function NotificationCenter() {
  const { accountId } = useActiveAccount();
  const { data: guard, dismissNotification } = useTrafficGuard(accountId);
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const notifications = guard?.notifications ?? [];
  const unreadCount = notifications.filter((n) => !n.is_read).length;

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const handleDismiss = async (notificationId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await dismissNotification({ notificationId });
    } catch {
      // ignore error
    }
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
        aria-label="Traffic Guard notifications"
        title="Traffic Guard notifications"
      >
        <Bell className="w-4 h-4" />
        {unreadCount > 0 && (
          <span className="absolute top-1.5 right-1.5 flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-500" />
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 sm:w-96 rounded-xl bg-card border border-border shadow-lg z-50 overflow-hidden animate-in fade-in-0 zoom-in-95">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/40">
            <div className="flex items-center gap-2">
              <span className="text-[13px] font-heading font-semibold text-foreground">Traffic Guard Alerts</span>
              {unreadCount > 0 && (
                <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-rose-500/15 text-rose-600 dark:text-rose-400">
                  {unreadCount} unread
                </span>
              )}
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="max-h-80 overflow-y-auto divide-y divide-border">
            {notifications.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground text-[13px]">
                <CheckCircle2 className="w-5 h-5 mx-auto mb-2 text-muted-foreground/60" />
                No traffic alerts. All systems running normally.
              </div>
            ) : (
              notifications.map((notif) => (
                <div
                  key={notif.id}
                  className={cn(
                    "p-3.5 transition-colors flex items-start gap-3",
                    notif.is_read ? "opacity-75 bg-card hover:bg-muted/30" : "bg-muted/25 hover:bg-muted/40"
                  )}
                >
                  <div className="mt-0.5 shrink-0">
                    {notif.type === 'high_traffic' ? (
                      <ShieldAlert className="w-4 h-4 text-rose-500" />
                    ) : (
                      <CheckCircle2 className="w-4 h-4 text-sky-500" />
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-[13px] font-medium text-foreground truncate">{notif.title}</p>
                      <span className="text-[11px] text-muted-foreground tabular-nums shrink-0">
                        {new Date(notif.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    <p className="text-[12px] text-muted-foreground mt-0.5 leading-relaxed line-clamp-2">
                      {notif.message}
                    </p>
                  </div>

                  {!notif.is_read && (
                    <button
                      onClick={(e) => handleDismiss(notif.id, e)}
                      className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted shrink-0"
                      title="Mark as read"
                    >
                      <Check className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

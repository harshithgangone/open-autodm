"use client";

import React from "react";
import { X, Trash2, Plus, Clock, MessageCircle, Send, Film, GitFork, Cog, AlertTriangle } from "lucide-react";
import type { FlowNode, CardButton } from "@/lib/types";

interface NodeInspectorProps {
  node: FlowNode | null;
  onUpdateNode: (nodeId: string, dataPatch: Partial<FlowNode['data']>) => void;
  onDeleteNode: (nodeId: string) => void;
  onClose: () => void;
}

export function NodeInspector({ node, onUpdateNode, onDeleteNode, onClose }: NodeInspectorProps) {
  if (!node) return null;

  const data = node.data;

  const [keywordsInput, setKeywordsInput] = React.useState<string>(
    () => (data.keywords || []).join(", ")
  );

  React.useEffect(() => {
    setKeywordsInput((data.keywords || []).join(", "));
  }, [node.id, data.keywords]);

  return (
    <div className="w-80 border-l border-border bg-card/95 backdrop-blur-md h-full flex flex-col shadow-xl z-20">
      {/* Header */}
      <div className="p-4 border-b border-border flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-primary/10 text-primary flex items-center justify-center font-bold text-xs uppercase">
            {node.type.slice(0, 2)}
          </div>
          <div>
            <h3 className="text-xs font-semibold text-foreground">{data.label || node.type}</h3>
            <p className="text-[10px] text-muted-foreground font-mono">{node.id}</p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-1 text-muted-foreground hover:text-foreground rounded-md hover:bg-muted"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs">
        <div>
          <label className="block text-[11px] font-semibold text-muted-foreground mb-1">
            Display Label
          </label>
          <input
            type="text"
            value={data.label || ""}
            onChange={(e) => onUpdateNode(node.id, { label: e.target.value })}
            placeholder="Node Title"
            className="w-full px-2.5 py-1.5 rounded-lg bg-muted/50 border border-border text-xs"
          />
        </div>

        {/* ── TRIGGER NODE PROPERTIES ── */}
        {node.type === "trigger" && (
          <div className="space-y-3 pt-2 border-t border-border">
            <div>
              <label className="block text-[11px] font-semibold text-muted-foreground mb-1">
                Trigger Type
              </label>
              <select
                value={data.triggerType || "comment_dm"}
                onChange={(e) => onUpdateNode(node.id, { triggerType: e.target.value as any })}
                className="w-full px-2.5 py-1.5 rounded-lg bg-muted/50 border border-border text-xs"
              >
                <option value="comment_dm">Comment on Post or Reel</option>
                <option value="reel_dm">Someone sends me a Reel</option>
                <option value="dm_reply">Direct Message Keyword</option>
                <option value="story_reply">Story Reply</option>
              </select>
            </div>

            {data.triggerType === "reel_dm" ? (
              <div className="space-y-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={data.reelMatchAny ?? true}
                    onChange={(e) => onUpdateNode(node.id, { reelMatchAny: e.target.checked, reelId: e.target.checked ? null : data.reelId })}
                    className="w-3.5 h-3.5 text-primary rounded"
                  />
                  <span>Match Any Shared Reel</span>
                </label>
                {!(data.reelMatchAny ?? true) && (
                  <input
                    type="text"
                    value={data.reelId || ""}
                    onChange={(e) => onUpdateNode(node.id, { reelId: e.target.value })}
                    placeholder="Enter Reel Video ID"
                    className="w-full px-2.5 py-1.5 rounded-lg bg-muted/50 border border-border text-xs"
                  />
                )}
              </div>
            ) : (
              <div className="space-y-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={data.keywordsAnyMode ?? false}
                    onChange={(e) => onUpdateNode(node.id, { keywordsAnyMode: e.target.checked })}
                    className="w-3.5 h-3.5 text-primary rounded"
                  />
                  <span>Any Comment / Any Message</span>
                </label>
                {!(data.keywordsAnyMode ?? false) && (
                  <div>
                    <label className="block text-[10px] text-muted-foreground mb-1">Keywords (comma separated)</label>
                    <input
                      type="text"
                      value={keywordsInput}
                      onChange={(e) => {
                        const raw = e.target.value;
                        setKeywordsInput(raw);
                        const kwList = raw
                          .split(",")
                          .map((k) => k.trim().toUpperCase())
                          .filter(Boolean);
                        onUpdateNode(node.id, { keywords: kwList });
                      }}
                      onBlur={() => {
                        setKeywordsInput((data.keywords || []).join(", "));
                      }}
                      placeholder="e.g. LINK, PROMO, INFO"
                      className="w-full px-2.5 py-1.5 rounded-lg bg-muted/50 border border-border text-xs"
                    />
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── SEND DM NODE PROPERTIES ── */}
        {node.type === "send_dm" && (
          <div className="space-y-3 pt-2 border-t border-border">
            <div>
              <label className="block text-[11px] font-semibold text-muted-foreground mb-1">
                Direct Message Content
              </label>
              <textarea
                rows={4}
                value={data.messageText || ""}
                onChange={(e) => onUpdateNode(node.id, { messageText: e.target.value })}
                placeholder="Message sent to the user..."
                className="w-full px-2.5 py-1.5 rounded-lg bg-muted/50 border border-border text-xs leading-relaxed"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-[11px] font-semibold text-muted-foreground">Link Buttons (Max 3)</label>
                <button
                  type="button"
                  disabled={(data.buttons || []).length >= 3}
                  onClick={() => {
                    const current = data.buttons || [];
                    if (current.length < 3) {
                      onUpdateNode(node.id, {
                        buttons: [...current, { id: `btn_${Date.now()}`, title: "Open Link", link: "https://" }],
                      });
                    }
                  }}
                  className="text-[10px] text-primary hover:underline font-semibold disabled:opacity-40"
                >
                  + Add Link
                </button>
              </div>

              <div className="space-y-2">
                {(data.buttons || []).map((btn, idx) => (
                  <div key={btn.id || idx} className="p-2 rounded-lg bg-muted/60 border border-border space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold text-muted-foreground">Button {idx + 1}</span>
                      <button
                        type="button"
                        onClick={() => {
                          const updated = (data.buttons || []).filter((_, i) => i !== idx);
                          onUpdateNode(node.id, { buttons: updated });
                        }}
                        className="text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                    <input
                      type="text"
                      value={btn.title}
                      maxLength={20}
                      onChange={(e) => {
                        const updated = [...(data.buttons || [])];
                        if (updated[idx]) {
                          updated[idx] = { ...updated[idx]!, title: e.target.value };
                          onUpdateNode(node.id, { buttons: updated });
                        }
                      }}
                      placeholder="Button Title (max 20 chars)"
                      className="w-full px-2 py-1 rounded bg-card border border-border text-[11px]"
                    />
                    <input
                      type="url"
                      value={btn.link}
                      onChange={(e) => {
                        const updated = [...(data.buttons || [])];
                        if (updated[idx]) {
                          updated[idx] = { ...updated[idx]!, link: e.target.value };
                          onUpdateNode(node.id, { buttons: updated });
                        }
                      }}
                      placeholder="https://..."
                      className="w-full px-2 py-1 rounded bg-card border border-border text-[11px]"
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── DELAY NODE PROPERTIES ── */}
        {node.type === "delay" && (
          <div className="space-y-3 pt-2 border-t border-border">
            <div>
              <label className="block text-[11px] font-semibold text-muted-foreground mb-1">
                Delay Duration (Minutes)
              </label>
              <div className="grid grid-cols-4 gap-1.5">
                {[10, 20, 60, 120].map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => onUpdateNode(node.id, { delayMinutes: m, label: `Wait ${m}m` })}
                    className={`py-1.5 rounded-lg border text-center font-medium ${
                      data.delayMinutes === m ? "bg-primary text-primary-foreground border-primary" : "bg-muted/40 border-border"
                    }`}
                  >
                    {m < 60 ? `${m}m` : `${m / 60}h`}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── CONDITION NODE PROPERTIES ── */}
        {node.type === "condition" && (
          <div className="space-y-3 pt-2 border-t border-border">
            <div>
              <label className="block text-[11px] font-semibold text-muted-foreground mb-1">
                Condition Type
              </label>
              <select
                value={data.conditionType || "is_following"}
                onChange={(e) => onUpdateNode(node.id, { conditionType: e.target.value as any })}
                className="w-full px-2.5 py-1.5 rounded-lg bg-muted/50 border border-border text-xs"
              >
                <option value="is_following">Is user following account?</option>
                <option value="has_interacted">Has user interacted back?</option>
                <option value="keyword_match">Message text contains keyword</option>
              </select>
            </div>
            {data.conditionType === "keyword_match" && (
              <div>
                <label className="block text-[10px] text-muted-foreground mb-1">Target Keyword</label>
                <input
                  type="text"
                  value={data.conditionValue || ""}
                  onChange={(e) => onUpdateNode(node.id, { conditionValue: e.target.value })}
                  placeholder="e.g. YES"
                  className="w-full px-2.5 py-1.5 rounded-lg bg-muted/50 border border-border text-xs"
                />
              </div>
            )}
            <div className="p-2.5 rounded-lg bg-muted/40 border border-border text-[11px] text-muted-foreground">
              Branches: Connect from the <span className="text-emerald-500 font-semibold">Green (Yes)</span> port or <span className="text-rose-500 font-semibold">Red (No)</span> port.
            </div>
          </div>
        )}

        {/* ── FOLLOW-UP NODE PROPERTIES ── */}
        {node.type === "follow_up" && (
          <div className="space-y-3 pt-2 border-t border-border">
            <div>
              <label className="block text-[11px] font-semibold text-muted-foreground mb-1">
                Follow-up Message Text
              </label>
              <textarea
                rows={3}
                value={data.followUpText || ""}
                onChange={(e) => onUpdateNode(node.id, { followUpText: e.target.value })}
                placeholder="Hey {username}, just wanted to check if you got the link..."
                className="w-full px-2.5 py-1.5 rounded-lg bg-muted/50 border border-border text-xs leading-relaxed"
              />
            </div>
            <p className="text-[10px] text-muted-foreground">
              Dispatched only to eligible recipients within Meta&apos;s 24-hour interaction window.
            </p>
          </div>
        )}

        {/* ── ACTION NODE PROPERTIES ── */}
        {node.type === "action" && (
          <div className="space-y-3 pt-2 border-t border-border">
            <div>
              <label className="block text-[11px] font-semibold text-muted-foreground mb-1">
                Action Type
              </label>
              <select
                value={data.actionType || "public_reply"}
                onChange={(e) => onUpdateNode(node.id, { actionType: e.target.value as any })}
                className="w-full px-2.5 py-1.5 rounded-lg bg-muted/50 border border-border text-xs"
              >
                <option value="public_reply">Post Public Reply</option>
                <option value="tag_contact">Tag Contact</option>
                <option value="log_analytics">Log Interaction Event</option>
              </select>
            </div>
          </div>
        )}
      </div>

      {/* Footer / Delete */}
      <div className="p-4 border-t border-border shrink-0">
        {node.type !== "trigger" ? (
          <button
            type="button"
            onClick={() => onDeleteNode(node.id)}
            className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-destructive hover:bg-destructive/10 transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Delete Node</span>
          </button>
        ) : (
          <p className="text-center text-[11px] text-muted-foreground italic py-1">
            Trigger node cannot be deleted
          </p>
        )}
      </div>
    </div>
  );
}

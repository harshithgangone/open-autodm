"use client";

import React, { useState, useRef, useCallback, useEffect } from "react";
import { motion } from "framer-motion";
import {
  Plus,
  ZoomIn,
  ZoomOut,
  Maximize2,
  RotateCcw,
  Sparkles,
  MessageCircle,
  Send,
  Film,
  Clock,
  GitFork,
  CheckCircle2,
  AlertTriangle,
  Play,
  Layers,
  Trash2,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { FlowGraph, FlowNode, FlowEdge, FlowNodeType } from "@/lib/types";
import { validateFlowGraph, getGraphAutoLayout } from "@/lib/automation/flowGraph";
import { NodeInspector } from "./NodeInspector";

interface VisualFlowCanvasProps {
  graph: FlowGraph;
  onChangeGraph: (graph: FlowGraph) => void;
  onSave?: (activate: boolean) => void;
  isPending?: boolean;
}

export function VisualFlowCanvas({
  graph,
  onChangeGraph,
  onSave,
  isPending = false,
}: VisualFlowCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Pan & Zoom state
  const [zoom, setZoom] = useState<number>(1);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [startPan, setStartPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  // Node selection & dragging
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [draggingNodeId, setDraggingNodeId] = useState<string | null>(null);
  const [dragStartMouse, setDragStartMouse] = useState<{ x: number; y: number } | null>(null);
  const [dragStartNodePos, setDragStartNodePos] = useState<{ x: number; y: number } | null>(null);

  // Edge drawing
  const [connectingSource, setConnectingSource] = useState<{ nodeId: string; handle: string } | null>(null);
  const [mouseCanvasPos, setMouseCanvasPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  // Add node menu
  const [showAddMenu, setShowAddMenu] = useState(false);

  // Graph validation
  const validation = validateFlowGraph(graph);

  // Pan handlers
  const handleMouseDownCanvas = (e: React.MouseEvent) => {
    // Only pan if clicking canvas background directly
    if (e.target === containerRef.current || (e.target as HTMLElement).tagName === "svg") {
      setIsPanning(true);
      setStartPan({ x: e.clientX - pan.x, y: e.clientY - pan.y });
      setSelectedNodeId(null);
      setConnectingSource(null);
    }
  };

  const handleMouseMoveCanvas = (e: React.MouseEvent) => {
    if (isPanning) {
      setPan({ x: e.clientX - startPan.x, y: e.clientY - startPan.y });
    }

    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const canvasX = (e.clientX - rect.left - pan.x) / zoom;
      const canvasY = (e.clientY - rect.top - pan.y) / zoom;
      setMouseCanvasPos({ x: canvasX, y: canvasY });
    }

    if (draggingNodeId && dragStartMouse && dragStartNodePos) {
      const dx = (e.clientX - dragStartMouse.x) / zoom;
      const dy = (e.clientY - dragStartMouse.y) / zoom;
      const newX = Math.round(dragStartNodePos.x + dx);
      const newY = Math.round(dragStartNodePos.y + dy);

      const updatedNodes = graph.nodes.map((n) =>
        n.id === draggingNodeId ? { ...n, position: { x: newX, y: newY } } : n
      );
      onChangeGraph({ ...graph, nodes: updatedNodes });
    }
  };

  const handleMouseUpCanvas = () => {
    setIsPanning(false);
    setDraggingNodeId(null);
    setDragStartMouse(null);
    setDragStartNodePos(null);
  };

  // Node dragging
  const handleNodeMouseDown = (e: React.MouseEvent, nodeId: string) => {
    e.stopPropagation();
    setSelectedNodeId(nodeId);
    setDraggingNodeId(nodeId);

    const node = graph.nodes.find((n) => n.id === nodeId);
    if (node) {
      setDragStartMouse({ x: e.clientX, y: e.clientY });
      setDragStartNodePos({ x: node.position.x, y: node.position.y });
    }
  };

  // Add node
  const handleAddNode = (type: FlowNodeType) => {
    const id = `node_${type}_${Date.now().toString().slice(-4)}`;
    const offset = (graph.nodes.length % 6) * 35;
    const newNode: FlowNode = {
      id,
      type,
      position: {
        x: Math.round((-pan.x + 350 + offset) / zoom),
        y: Math.round((-pan.y + 250 + offset) / zoom),
      },
      data: {
        label:
          type === "trigger"
            ? "New Trigger"
            : type === "send_dm"
            ? "Send Message"
            : type === "delay"
            ? "Wait Delay"
            : type === "condition"
            ? "Check Condition"
            : type === "follow_up"
            ? "Follow-up"
            : type === "action"
            ? "Action"
            : "End",
        delayMinutes: type === "delay" ? 60 : undefined,
        messageText: type === "send_dm" ? "Hey! Thanks for reaching out ✨" : undefined,
      },
    };

    onChangeGraph({
      ...graph,
      nodes: [...graph.nodes, newNode],
    });
    setSelectedNodeId(id);
    setShowAddMenu(false);
  };

  // Delete node
  const handleDeleteNode = (nodeId: string) => {
    const newNodes = graph.nodes.filter((n) => n.id !== nodeId);
    const newEdges = graph.edges.filter((e) => e.source !== nodeId && e.target !== nodeId);
    onChangeGraph({ ...graph, nodes: newNodes, edges: newEdges });
    if (selectedNodeId === nodeId) setSelectedNodeId(null);
  };

  // Update node data
  const handleUpdateNode = (nodeId: string, patch: Partial<FlowNode["data"]>) => {
    const updated = graph.nodes.map((n) =>
      n.id === nodeId ? { ...n, data: { ...n.data, ...patch } } : n
    );
    onChangeGraph({ ...graph, nodes: updated });
  };

  // Connect edge
  const handleStartConnection = (e: React.MouseEvent, nodeId: string, handle: string = "default") => {
    e.stopPropagation();
    setConnectingSource({ nodeId, handle });
  };

  const handleCompleteConnection = (e: React.MouseEvent, targetNodeId: string) => {
    e.stopPropagation();
    if (!connectingSource || connectingSource.nodeId === targetNodeId) {
      setConnectingSource(null);
      return;
    }

    const newEdge: FlowEdge = {
      id: `edge_${connectingSource.nodeId}_${targetNodeId}_${Date.now()}`,
      source: connectingSource.nodeId,
      target: targetNodeId,
      sourceHandle: connectingSource.handle,
      targetHandle: "default",
    };

    // Replace existing edge from this specific handle if only single connection allowed
    const filteredEdges = graph.edges.filter(
      (e) => !(e.source === connectingSource.nodeId && e.sourceHandle === connectingSource.handle)
    );

    onChangeGraph({ ...graph, edges: [...filteredEdges, newEdge] });
    setConnectingSource(null);
  };

  // Delete edge
  const handleDeleteEdge = (edgeId: string) => {
    onChangeGraph({
      ...graph,
      edges: graph.edges.filter((e) => e.id !== edgeId),
    });
  };

  // Auto layout
  const handleAutoLayout = () => {
    const laidOut = getGraphAutoLayout(graph);
    onChangeGraph(laidOut);
  };

  // Reset view
  const handleResetView = () => {
    setZoom(1);
    setPan({ x: 50, y: 50 });
  };

  const selectedNode = graph.nodes.find((n) => n.id === selectedNodeId) || null;

  return (
    <div className="flex h-full w-full overflow-hidden bg-[#0d0e12] select-none relative">
      {/* Canvas Workspace */}
      <div
        ref={containerRef}
        onMouseDown={handleMouseDownCanvas}
        onMouseMove={handleMouseMoveCanvas}
        onMouseUp={handleMouseUpCanvas}
        className="flex-1 h-full w-full relative overflow-hidden cursor-grab active:cursor-grabbing"
        style={{
          backgroundImage: `radial-gradient(circle, rgba(255,255,255,0.08) 1px, transparent 1px)`,
          backgroundSize: `${24 * zoom}px ${24 * zoom}px`,
          backgroundPosition: `${pan.x}px ${pan.y}px`,
        }}
      >
        {/* Zoomed & Panned Content Layer */}
        <div
          className="absolute inset-0 origin-top-left pointer-events-none"
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
          }}
        >
          {/* SVG Edges Layer */}
          <svg className="absolute inset-0 w-[4000px] h-[4000px] pointer-events-none overflow-visible">
            <defs>
              <marker
                id="arrowhead"
                viewBox="0 0 10 10"
                refX="8"
                refY="5"
                markerWidth="6"
                markerHeight="6"
                orient="auto-start-reverse"
              >
                <path d="M 0 1 L 9 5 L 0 9 z" fill="#64748b" />
              </marker>
              <marker
                id="arrowhead-yes"
                viewBox="0 0 10 10"
                refX="8"
                refY="5"
                markerWidth="6"
                markerHeight="6"
                orient="auto-start-reverse"
              >
                <path d="M 0 1 L 9 5 L 0 9 z" fill="#10b981" />
              </marker>
              <marker
                id="arrowhead-no"
                viewBox="0 0 10 10"
                refX="8"
                refY="5"
                markerWidth="6"
                markerHeight="6"
                orient="auto-start-reverse"
              >
                <path d="M 0 1 L 9 5 L 0 9 z" fill="#ef4444" />
              </marker>
            </defs>

            {/* Rendered Edges */}
            {graph.edges.map((edge) => {
              const srcNode = graph.nodes.find((n) => n.id === edge.source);
              const tgtNode = graph.nodes.find((n) => n.id === edge.target);
              if (!srcNode || !tgtNode) return null;

              const isCondition = srcNode.type === "condition";
              let startX = srcNode.position.x + 110;
              let startY = srcNode.position.y + 80;

              if (isCondition && edge.sourceHandle === "yes") {
                startX = srcNode.position.x + 55;
              } else if (isCondition && edge.sourceHandle === "no") {
                startX = srcNode.position.x + 165;
              }

              const endX = tgtNode.position.x + 110;
              const endY = tgtNode.position.y;

              const deltaY = Math.abs(endY - startY) * 0.5;
              const pathData = `M ${startX} ${startY} C ${startX} ${startY + deltaY}, ${endX} ${endY - deltaY}, ${endX} ${endY}`;

              const strokeColor =
                edge.sourceHandle === "yes"
                  ? "#10b981"
                  : edge.sourceHandle === "no"
                  ? "#ef4444"
                  : "#64748b";

              const markerId =
                edge.sourceHandle === "yes"
                  ? "url(#arrowhead-yes)"
                  : edge.sourceHandle === "no"
                  ? "url(#arrowhead-no)"
                  : "url(#arrowhead)";

              return (
                <g key={edge.id} className="pointer-events-auto group cursor-pointer" onClick={() => handleDeleteEdge(edge.id)}>
                  <path
                    d={pathData}
                    fill="none"
                    stroke={strokeColor}
                    strokeWidth="2.5"
                    markerEnd={markerId}
                    className="transition-all hover:stroke-destructive hover:stroke-[3.5]"
                  />
                  {edge.sourceHandle && edge.sourceHandle !== "default" && (
                    <text
                      x={(startX + endX) / 2}
                      y={(startY + endY) / 2 - 8}
                      fill={strokeColor}
                      fontSize="10"
                      fontWeight="bold"
                      textAnchor="middle"
                      className="select-none bg-black px-1"
                    >
                      {edge.sourceHandle.toUpperCase()}
                    </text>
                  )}
                </g>
              );
            })}

            {/* In-progress connecting line */}
            {connectingSource && (
              (() => {
                const srcNode = graph.nodes.find((n) => n.id === connectingSource.nodeId);
                if (!srcNode) return null;
                const startX = srcNode.position.x + 110;
                const startY = srcNode.position.y + 80;
                return (
                  <path
                    d={`M ${startX} ${startY} L ${mouseCanvasPos.x} ${mouseCanvasPos.y}`}
                    fill="none"
                    stroke="#3b82f6"
                    strokeWidth="2"
                    strokeDasharray="4 4"
                  />
                );
              })()
            )}
          </svg>

          {/* Rendered Nodes Layer */}
          {graph.nodes.map((node) => {
            const isSelected = selectedNodeId === node.id;
            const isCondition = node.type === "condition";

            return (
              <div
                key={node.id}
                onMouseDown={(e) => handleNodeMouseDown(e, node.id)}
                style={{
                  transform: `translate(${node.position.x}px, ${node.position.y}px)`,
                }}
                className={cn(
                  "absolute w-56 rounded-xl border bg-card/95 backdrop-blur-md shadow-lg pointer-events-auto transition-shadow select-none",
                  isSelected
                    ? "border-primary ring-2 ring-primary/40 shadow-primary/10"
                    : "border-border hover:border-foreground/30",
                  node.type === "trigger" && "border-t-4 border-t-amber-500",
                  node.type === "send_dm" && "border-t-4 border-t-blue-500",
                  node.type === "delay" && "border-t-4 border-t-purple-500",
                  node.type === "condition" && "border-t-4 border-t-emerald-500",
                  node.type === "follow_up" && "border-t-4 border-t-pink-500",
                  node.type === "end" && "border-t-4 border-t-zinc-500"
                )}
              >
                {/* Top Input Handle */}
                {node.type !== "trigger" && (
                  <div
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={(e) => handleCompleteConnection(e, node.id)}
                    className="absolute -top-2 left-1/2 -translate-x-1/2 w-4 h-4 rounded-full bg-border border-2 border-background hover:bg-primary hover:scale-125 transition-all cursor-crosshair z-10"
                    title="Connect to this node"
                  />
                )}

                {/* Node Header */}
                <div className="p-3 border-b border-border/50 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {node.type === "trigger" && <Play className="w-3.5 h-3.5 text-amber-500" />}
                    {node.type === "send_dm" && <MessageCircle className="w-3.5 h-3.5 text-blue-500" />}
                    {node.type === "delay" && <Clock className="w-3.5 h-3.5 text-purple-500" />}
                    {node.type === "condition" && <GitFork className="w-3.5 h-3.5 text-emerald-500" />}
                    {node.type === "follow_up" && <Send className="w-3.5 h-3.5 text-pink-500" />}
                    {node.type === "end" && <CheckCircle2 className="w-3.5 h-3.5 text-zinc-400" />}
                    <span className="text-xs font-semibold text-foreground truncate max-w-[120px]">
                      {node.data.label || node.type}
                    </span>
                  </div>
                  <span className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground/70">
                    {node.type}
                  </span>
                </div>

                {/* Node Summary Body */}
                <div className="p-3 text-[11px] text-muted-foreground leading-relaxed">
                  {node.type === "trigger" && (
                    <p className="truncate">
                      {node.data.triggerType === "reel_dm"
                        ? "Incoming Shared Reel"
                        : node.data.keywordsAnyMode
                        ? "Any Comment (Wildcard)"
                        : `Keywords: ${(node.data.keywords || []).join(", ") || "None"}`}
                    </p>
                  )}
                  {node.type === "send_dm" && (
                    <div>
                      <p className="line-clamp-2">{node.data.messageText || "No message text"}</p>
                      {(node.data.buttons || []).length > 0 && (
                        <span className="inline-block mt-1 text-[9px] font-semibold text-primary">
                          {(node.data.buttons || []).length} button(s)
                        </span>
                      )}
                    </div>
                  )}
                  {node.type === "delay" && (
                    <p className="font-semibold text-foreground">
                      Wait {node.data.delayMinutes || 60} minutes
                    </p>
                  )}
                  {node.type === "condition" && (
                    <p className="truncate font-medium text-foreground">
                      {node.data.conditionType || "is_following"}
                    </p>
                  )}
                  {node.type === "follow_up" && (
                    <p className="line-clamp-2">{node.data.followUpText || "Follow-up message..."}</p>
                  )}
                  {node.type === "end" && <p className="text-zinc-400">Flow complete</p>}
                </div>

                {/* Bottom Output Handles */}
                {node.type !== "end" && !isCondition && (
                  <div
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={(e) => handleStartConnection(e, node.id, "default")}
                    className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-4 h-4 rounded-full bg-primary border-2 border-background hover:scale-125 transition-all cursor-crosshair z-10 shadow-sm"
                    title="Drag or click to connect next step"
                  />
                )}

                {/* Condition Dual Handles: Yes (Green) & No (Red) */}
                {isCondition && (
                  <div className="flex justify-between px-8 relative -bottom-2 z-10">
                    <div
                      onMouseDown={(e) => e.stopPropagation()}
                      onClick={(e) => handleStartConnection(e, node.id, "yes")}
                      className="w-4 h-4 rounded-full bg-emerald-500 border-2 border-background hover:scale-125 transition-all cursor-crosshair"
                      title="Yes / Met condition branch"
                    />
                    <div
                      onMouseDown={(e) => e.stopPropagation()}
                      onClick={(e) => handleStartConnection(e, node.id, "no")}
                      className="w-4 h-4 rounded-full bg-rose-500 border-2 border-background hover:scale-125 transition-all cursor-crosshair"
                      title="No / Unmet condition branch"
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Floating Canvas Controls Toolbar */}
        <div className="absolute top-4 left-4 z-20 flex items-center gap-2 bg-card/90 backdrop-blur-md border border-border p-1.5 rounded-xl shadow-lg">
          <div className="relative">
            <button
              onClick={() => setShowAddMenu((prev) => !prev)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 transition-all shadow-sm"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Node</span>
            </button>

            {showAddMenu && (
              <div className="absolute top-full left-0 mt-2 w-48 bg-card border border-border rounded-xl shadow-xl p-1.5 space-y-1 z-30">
                {[
                  { type: "send_dm" as const, label: "Send Message", icon: MessageCircle },
                  { type: "delay" as const, label: "Delay Timer", icon: Clock },
                  { type: "condition" as const, label: "Condition (Yes/No)", icon: GitFork },
                  { type: "follow_up" as const, label: "Follow-up DM", icon: Send },
                  { type: "action" as const, label: "Action (Tag/Log)", icon: Layers },
                  { type: "end" as const, label: "End Flow", icon: CheckCircle2 },
                ].map((item) => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.type}
                      onClick={() => handleAddNode(item.type)}
                      className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-medium text-foreground hover:bg-muted text-left transition-colors"
                    >
                      <Icon className="w-3.5 h-3.5 text-primary" />
                      <span>{item.label}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="h-4 w-px bg-border" />

          <button
            onClick={handleAutoLayout}
            title="Auto-organize graph layout"
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors text-xs flex items-center gap-1"
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-500" />
            <span className="hidden sm:inline">Auto Layout</span>
          </button>

          <div className="h-4 w-px bg-border" />

          <button
            onClick={() => setZoom((z) => Math.min(1.5, z + 0.1))}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted"
            title="Zoom In"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
          <span className="text-[10px] font-mono text-muted-foreground min-w-[32px] text-center">
            {Math.round(zoom * 100)}%
          </span>
          <button
            onClick={() => setZoom((z) => Math.max(0.5, z - 0.1))}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted"
            title="Zoom Out"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={handleResetView}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted"
            title="Reset View"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Validation Warning Pill */}
        {!validation.valid && (
          <div className="absolute bottom-4 left-4 z-20 max-w-md p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-500 text-xs flex items-start gap-2 shadow-lg backdrop-blur-md">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">Flow Validation Notice</p>
              <ul className="list-disc list-inside mt-0.5 space-y-0.5 text-[11px] text-amber-400">
                {validation.errors.slice(0, 3).map((err, i) => (
                  <li key={i}>{err}</li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </div>

      {/* Node Inspector Side Panel */}
      {selectedNode && (
        <NodeInspector
          node={selectedNode}
          onUpdateNode={handleUpdateNode}
          onDeleteNode={handleDeleteNode}
          onClose={() => setSelectedNodeId(null)}
        />
      )}
    </div>
  );
}

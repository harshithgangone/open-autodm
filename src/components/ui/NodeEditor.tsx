"use client";

import { motion, useMotionValue, useMotionTemplate, useTransform } from "framer-motion";
import { Workflow, Calendar, BarChart, Send, Layers } from "lucide-react";
import { useEffect, useState, useRef } from "react";

// Helper component to dry up the animated connecting lines
function AnimatedConnection({
    startX, startY, endX, endY, color
}: { startX: any, startY: any, endX: any, endY: any, color: string }) {

    // Calculate horizontal midpoint for the bezier control points (Classic n8n S-Curve)
    const midX = useTransform([startX, endX], ([s, e]: any) => (s + e) / 2);

    // Create the precise S-curve path string dynamically
    const path = useMotionTemplate`M ${startX} ${startY} C ${midX} ${startY}, ${midX} ${endY}, ${endX} ${endY}`;

    return (
        <motion.path
            d={path}
            stroke={color}
            strokeWidth="3"
            strokeDasharray="8 8"
            fill="none"
            className="animate-[flowDots_1s_linear_infinite]"
            style={{
                filter: "drop-shadow(0px 0px 6px " + color + "a0)"
            }}
        />
    );
}

export function NodeEditor() {
    const [mounted, setMounted] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    // Motion values for the Center node ("AutoDM Hub") - fully draggable
    const cx = useMotionValue(-150);
    const cy = useMotionValue(0);

    // Motion values for peripheral nodes - branching to the right like n8n
    const dmX = useMotionValue(80);
    const dmY = useMotionValue(-80);

    const contentX = useMotionValue(250);
    const contentY = useMotionValue(-80);

    const linksX = useMotionValue(80);
    const linksY = useMotionValue(90);

    const analyticsX = useMotionValue(250);
    const analyticsY = useMotionValue(90);

    useEffect(() => {
        setMounted(true);
    }, []);

    if (!mounted) {
        return <div className="w-full h-full min-h-[300px]" />;
    }

    return (
        <div ref={containerRef} className="relative w-full h-full min-h-[350px] flex items-center justify-center pointer-events-auto bg-transparent z-10">

            {/*
        This wrapper perfectly aligns the SVG's 0,0 origin to the center of the viewport,
        ensuring 1:1 sync with Framer's center-origin coordinate matrix.
        Giving it 1x1 size prevents WebKit/Blink from culling the SVG entirely.
      */}
            <div className="absolute inset-0 pointer-events-none z-0 flex items-center justify-center">
                <svg
                    className="overflow-visible"
                    style={{ width: "1px", height: "1px" }}
                >
                    <style dangerouslySetInnerHTML={{
                        __html: `
            @keyframes flowDots {
              from { stroke-dashoffset: 16; }
              to { stroke-dashoffset: 0; }
            }
          `}} />

                    {/* n8n style vivid connecting lines */}
                    <AnimatedConnection startX={cx} startY={cy} endX={dmX} endY={dmY} color="#F97316" />
                    <AnimatedConnection startX={cx} startY={cy} endX={contentX} endY={contentY} color="#F97316" />
                    <AnimatedConnection startX={cx} startY={cy} endX={linksX} endY={linksY} color="#22C55E" />
                    <AnimatedConnection startX={cx} startY={cy} endX={analyticsX} endY={analyticsY} color="#22C55E" />
                </svg>
            </div>

            {/* Core Node - Draggable */}
            <motion.div
                drag
                dragMomentum={false}
                dragElastic={0}
                whileHover={{ scale: 1.05 }}
                dragConstraints={{ left: -1000, right: 1000, top: -1000, bottom: 1000 }}
                style={{ x: cx, y: cy }}
                className="absolute z-20 flex flex-col items-center justify-center pointer-events-auto shadow-2xl shadow-primary/40 p-4 px-6 rounded-3xl cursor-grab active:cursor-grabbing border border-primary/50 backdrop-blur-md bg-gradient-to-br from-[#F97316] to-[#ea580c]"
            >
                <div className="w-8 h-8 sm:w-10 sm:h-10 mb-1.5 rounded-full bg-white/20 flex items-center justify-center backdrop-blur-sm">
                    <Workflow className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
                </div>
                <span className="font-bold text-[11px] sm:text-[13px] tracking-tight text-white drop-shadow-sm">AutoDM Hub</span>
            </motion.div>

            {/* Peripheral Nodes - Draggable */}
            <motion.div
                drag
                dragMomentum={false}
                dragElastic={0}
                dragConstraints={{ left: -1000, right: 1000, top: -1000, bottom: 1000 }}
                style={{ x: dmX, y: dmY }}
                className="absolute z-10 pointer-events-auto flex items-center space-x-2.5 p-2 px-3 sm:p-2.5 sm:px-4 bg-white dark:bg-[#111] border border-border dark:border-white/10 rounded-xl shadow-lg cursor-grab active:cursor-grabbing hover:border-primary/50 transition-colors"
            >
                <div className="w-6 h-6 sm:w-7 sm:h-7 rounded-md bg-primary/10 flex items-center justify-center">
                    <Send className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-primary" />
                </div>
                <span className="font-semibold text-[10px] sm:text-xs uppercase tracking-wider text-foreground dark:text-white/80">DM Auto</span>
            </motion.div>

            <motion.div
                drag
                dragMomentum={false}
                dragElastic={0}
                dragConstraints={{ left: -1000, right: 1000, top: -1000, bottom: 1000 }}
                style={{ x: contentX, y: contentY }}
                className="absolute z-10 pointer-events-auto flex items-center space-x-2.5 p-2 px-3 sm:p-2.5 sm:px-4 bg-white dark:bg-[#111] border border-border dark:border-white/10 rounded-xl shadow-lg cursor-grab active:cursor-grabbing hover:border-primary/50 transition-colors"
            >
                <div className="w-6 h-6 sm:w-7 sm:h-7 rounded-md bg-primary/10 flex items-center justify-center">
                    <Calendar className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-primary" />
                </div>
                <span className="font-semibold text-[10px] sm:text-xs uppercase tracking-wider text-foreground dark:text-white/80">Content</span>
            </motion.div>

            <motion.div
                drag
                dragMomentum={false}
                dragElastic={0}
                dragConstraints={{ left: -1000, right: 1000, top: -1000, bottom: 1000 }}
                style={{ x: linksX, y: linksY }}
                className="absolute z-10 pointer-events-auto flex items-center space-x-2.5 p-2 px-3 sm:p-2.5 sm:px-4 bg-white dark:bg-[#111] border border-border dark:border-white/10 rounded-xl shadow-lg cursor-grab active:cursor-grabbing hover:border-secondary/50 transition-colors"
            >
                <div className="w-6 h-6 sm:w-7 sm:h-7 rounded-md bg-secondary/10 flex items-center justify-center">
                    <Layers className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-secondary" />
                </div>
                <span className="font-semibold text-[10px] sm:text-xs uppercase tracking-wider text-foreground dark:text-white/80">Links</span>
            </motion.div>

            <motion.div
                drag
                dragMomentum={false}
                dragElastic={0}
                dragConstraints={{ left: -1000, right: 1000, top: -1000, bottom: 1000 }}
                style={{ x: analyticsX, y: analyticsY }}
                className="absolute z-10 pointer-events-auto flex items-center space-x-2.5 p-2 px-3 sm:p-2.5 sm:px-4 bg-white dark:bg-[#111] border border-border dark:border-white/10 rounded-xl shadow-lg cursor-grab active:cursor-grabbing hover:border-secondary/50 transition-colors"
            >
                <div className="w-6 h-6 sm:w-7 sm:h-7 rounded-md bg-secondary/10 flex items-center justify-center">
                    <BarChart className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-secondary" />
                </div>
                <span className="font-semibold text-[10px] sm:text-xs uppercase tracking-wider text-foreground dark:text-white/80">Analytics</span>
            </motion.div>

            {/* Hint Text */}
            <div className="absolute bottom-2 right-4 text-[9px] uppercase tracking-widest text-muted-foreground/60 font-mono pointer-events-none">
                Drag Any Node
            </div>
        </div>
    );
}

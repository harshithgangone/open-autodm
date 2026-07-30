"use client";

import { motion } from "framer-motion";
import { LoginForm } from "@/components/auth/LoginForm";
import { NodeEditor } from "@/components/ui/NodeEditor";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { LogoMark, LogoWordmark } from "@/components/ui/Logo";

// Creative animated background doodles component
function BackgroundDoodles() {
  return (
    <div className="absolute inset-0 z-0 pointer-events-none overflow-hidden opacity-30 dark:opacity-20 mix-blend-multiply dark:mix-blend-screen">
      <svg className="w-full h-full" viewBox="0 0 1000 1000" preserveAspectRatio="none">
        <motion.path
          d="M -100,500 C 100,400 300,700 500,500 S 800,400 1100,600"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeDasharray="12 12"
          initial={{ pathLength: 0, opacity: 0 }}
          animate={{ pathLength: 1, opacity: 0.5 }}
          transition={{ duration: 4, ease: "easeInOut", opacity: { duration: 1 } }}
          className="text-primary/40"
        />
        <motion.path
          d="M 200, -100 C 300, 200 100, 500 400, 800 S 700, 1000 600, 1200"
          fill="none"
          stroke="currentColor"
          strokeWidth="1"
          initial={{ pathLength: 0, opacity: 0 }}
          animate={{ pathLength: 1, opacity: 0.3 }}
          transition={{ duration: 6, ease: "easeInOut", delay: 1 }}
          className="text-secondary/40"
        />
      </svg>
    </div>
  );
}

export default function LoginPage() {
  return (
    <div className="h-screen w-screen flex flex-col p-4 sm:p-8 md:p-12 font-sans relative overflow-hidden text-foreground bg-background">

      {/* Global Theme Toggle */}
      <div className="absolute top-6 right-6 lg:top-8 lg:right-8 z-50 flex items-center">
        <ThemeToggle />
      </div>

      {/* Full-Screen Seamless Dotted Pattern */}
      <div
        className="absolute inset-0 z-0 opacity-[0.15] dark:opacity-30 transition-opacity"
        style={{
          backgroundImage: `radial-gradient(circle at 1.5px 1.5px, currentColor 1.5px, transparent 0)`,
          backgroundSize: "32px 32px"
        }}
      />

      <BackgroundDoodles />

      {/* Header Logo Row */}
      <div className="relative z-10 flex items-center space-x-3 mb-2 mx-auto lg:mx-0 lg:ml-12 w-full max-w-[90rem]">
        <LogoMark className="w-9 h-9 drop-shadow-lg" />
        <LogoWordmark className="text-xl" />
      </div>

      {/* Main Container */}
      <div className="flex flex-col lg:flex-row gap-6 w-full max-w-[90rem] z-10 mx-auto flex-1 min-h-0 items-center justify-between">

        {/* Left Area - headline + interactive nodes */}
        <div className="hidden lg:flex relative flex-col justify-center items-start flex-1 w-full lg:w-[55%] h-full lg:pl-16 pt-2 lg:pt-8 pointer-events-none">

          <div className="relative z-10 flex flex-col w-full max-w-2xl shrink-0 text-left mt-2 lg:mt-4 pointer-events-auto">
            <motion.h1
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.1 }}
              className="text-5xl lg:text-[68px] font-heading font-extrabold leading-[1.0] tracking-tighter mb-6 relative"
            >
              <div className="absolute -inset-4 bg-primary/10 blur-[60px] rounded-full z-[-1] hidden lg:block" />
              Comment-to-DM, <motion.span
                initial={{ rotate: 0 }}
                animate={{ rotate: -3 }}
                transition={{ duration: 0.7, delay: 0.8, type: "spring", stiffness: 200, damping: 10 }}
                className="inline-block relative ml-1 mr-2"
              >
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#F97316] to-[#fc9c54] font-serif italic drop-shadow-sm px-1 font-light tracking-normal">
                  self-hosted
                </span>
                <svg className="absolute -bottom-2 left-0 w-full h-4 text-[#F97316] opacity-90" viewBox="0 0 100 20" preserveAspectRatio="none">
                  <motion.path
                    d="M 5 15 Q 50 25 95 10"
                    stroke="currentColor"
                    strokeWidth="5"
                    fill="none"
                    strokeLinecap="round"
                    initial={{ pathLength: 0, opacity: 0 }}
                    animate={{ pathLength: 1, opacity: 1 }}
                    transition={{ duration: 0.8, delay: 1.2, ease: "easeOut" }}
                  />
                </svg>
              </motion.span><br className="hidden sm:block" />
              <div className="mt-3 lg:mt-5">and 100% yours.</div>
            </motion.h1>
            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.2 }}
              className="text-base lg:text-[1.1rem] text-muted-foreground font-medium max-w-screen-sm mb-2 leading-relaxed mx-auto lg:mx-0 opacity-90"
            >
              Automate Instagram comment replies and DMs through your own Meta app, on your own
              infrastructure - free, open source, and built to respect every Instagram API rule.
              Drag the nodes to interact.
            </motion.p>
          </div>

          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.8, delay: 0.4 }}
            className="w-full relative z-50 flex-1 min-h-[350px] flex items-center justify-center lg:justify-start mt-4 pointer-events-auto"
          >
            <NodeEditor />
          </motion.div>

        </div>

        {/* Right Area - auth form */}
        <div className="flex w-full lg:w-1/2 max-w-[460px] flex-col justify-center items-center lg:items-end relative h-full shrink-0 lg:pr-12 pointer-events-none">

          <div className="absolute inset-0 pointer-events-none items-center justify-center lg:justify-end opacity-80 mix-blend-multiply dark:mix-blend-screen z-20 hidden lg:flex">
            <svg width="650" height="650" viewBox="0 0 650 650" className="absolute -right-8 pointer-events-none">
              <motion.path
                d="M 325,40 C 550,20 650,250 550,480 C 450,710 150,650 50,450 C -50,250 100,60 325,40"
                fill="none"
                stroke="#F97316"
                strokeWidth="2.5"
                strokeLinecap="round"
                initial={{ pathLength: 0, opacity: 0 }}
                animate={{
                  pathLength: 1,
                  opacity: 0.8,
                  d: [
                    "M 325,40 C 550,20 650,250 550,480 C 450,710 150,650 50,450 C -50,250 100,60 325,40",
                    "M 315,35 C 560,25 640,240 560,490 C 460,700 140,660 60,440 C -40,260 110,65 315,35",
                    "M 335,45 C 540,15 660,260 540,470 C 440,720 160,640 40,460 C -60,240 90,55 335,45",
                    "M 325,40 C 550,20 650,250 550,480 C 450,710 150,650 50,450 C -50,250 100,60 325,40"
                  ]
                }}
                transition={{
                  pathLength: { duration: 2, ease: "easeOut" },
                  opacity: { duration: 1 },
                  d: { duration: 15, repeat: Infinity, ease: "easeInOut" }
                }}
                style={{ filter: "drop-shadow(0px 0px 8px rgba(249,115,22,0.4))" }}
              />
            </svg>
          </div>

          <div className="relative z-30 w-full flex justify-end pointer-events-auto">
            <LoginForm />
          </div>
        </div>

      </div>

      <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 z-10 text-[9px] text-muted-foreground uppercase tracking-widest font-mono">
        open-autoDM · MIT Licensed · Self-Hosted &amp; Free Forever
      </div>
    </div>
  );
}

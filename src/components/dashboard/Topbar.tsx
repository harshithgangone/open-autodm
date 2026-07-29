"use client";

import { Menu, Zap } from "lucide-react";
import { ThemeToggle } from "@/components/ui/ThemeToggle";

export function Topbar() {
    return (
        <header className="sticky top-0 z-40 flex w-full items-center justify-between bg-background/80 backdrop-blur-md border-b border-border/40 p-4 lg:px-8">

            {/* Mobile Menu Toggle - Hidden on Desktop */}
            <div className="flex items-center lg:hidden">
                <button className="p-2 -ml-2 rounded-xl text-muted-foreground hover:bg-muted/50 hover:text-foreground transition-colors">
                    <Menu className="w-5 h-5" />
                    <span className="sr-only">Toggle Menu</span>
                </button>
            </div>

            {/* Page Context Title */}
            <div className="flex-1 flex items-center lg:pl-0 pl-4">
                <h1 className="text-xl font-heading font-bold tracking-tight text-foreground hidden sm:block">
                    Automation Hub
                </h1>
            </div>

            {/* Right Actions */}
            <div className="flex items-center space-x-4">
                <ThemeToggle />

                <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-[#f09433] via-[#e6683c] to-[#bc1888] flex items-center justify-center shadow-md ring-2 ring-background">
                    <Zap className="w-4 h-4 text-white fill-current" />
                </div>
            </div>
        </header>
    );
}

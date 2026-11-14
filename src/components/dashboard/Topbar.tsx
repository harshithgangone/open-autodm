"use client";

import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { NotificationCenter } from "@/components/dashboard/NotificationCenter";
import { useUiStore } from "@/lib/store";

const TITLES: Record<string, string> = {
    "/dashboard": "Dashboard",
    "/automations": "Automations",
    "/analytics": "Analytics",
    "/settings": "Settings",
    "/setup": "Setup Wizard",
};

export function Topbar() {
    const pathname = usePathname();
    const openMobileSidebar = useUiStore((s) => s.openMobileSidebar);
    const title = Object.entries(TITLES).find(([path]) => pathname.startsWith(path))?.[1] ?? "open-autoDM";

    return (
        <header className="sticky top-0 z-40 flex h-14 w-full items-center justify-between bg-background/85 backdrop-blur-md border-b border-border px-4 lg:px-8">
            <div className="flex items-center gap-3">
                <button
                    onClick={openMobileSidebar}
                    className="lg:hidden p-1.5 -ml-1.5 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                    aria-label="Open menu"
                >
                    <Menu className="w-4 h-4" />
                </button>
                <h1 className="text-[15px] font-heading font-semibold tracking-tight text-foreground">{title}</h1>
            </div>

            <div className="flex items-center gap-1.5">
                <NotificationCenter />
                <ThemeToggle />
            </div>
        </header>
    );
}

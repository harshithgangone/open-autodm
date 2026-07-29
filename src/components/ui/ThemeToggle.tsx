"use client"

import * as React from "react"
import { Moon, Sun } from "lucide-react"
import { useTheme } from "next-themes"

export function ThemeToggle() {
    const { theme, setTheme } = useTheme()
    const [mounted, setMounted] = React.useState(false)

    React.useEffect(() => {
        setMounted(true)
    }, [])

    if (!mounted) {
        return <div className="w-8 h-8" />
    }

    return (
        <button
            onClick={() => setTheme(theme === "light" ? "dark" : "light")}
            className="flex items-center justify-center w-8 h-8 rounded-md border border-border text-muted-foreground hover:text-foreground hover:bg-muted transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
            aria-label="Toggle theme"
        >
            {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </button>
    )
}

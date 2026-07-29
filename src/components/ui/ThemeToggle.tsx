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
        return <div className="w-10 h-10" />
    }

    return (
        <button
            onClick={() => setTheme(theme === "light" ? "dark" : "light")}
            className="relative flex items-center justify-center w-11 h-11 rounded-full bg-black dark:bg-white shadow-xl hover:scale-105 transition-all text-white dark:text-black border border-transparent"
            aria-label="Toggle theme"
        >
            {theme === "dark" ? (
                <Sun className="h-5 w-5 fill-current" />
            ) : (
                <Moon className="h-5 w-5 fill-current" />
            )}
        </button>
    )
}

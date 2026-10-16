"use client"

import * as React from "react"
import { ThemeProvider as NextThemesProvider, useTheme } from "next-themes"

/** ⌘⇧L (Ctrl+Shift+L elsewhere): Notion's key for light or dark (V27). Pure. */
export function isThemeHotkey(e: Pick<KeyboardEvent, "key" | "metaKey" | "ctrlKey" | "shiftKey" | "altKey" | "isComposing" | "defaultPrevented">): boolean {
    return (e.metaKey || e.ctrlKey) && e.shiftKey && !e.altKey && !e.isComposing && !e.defaultPrevented && e.key.toLowerCase() === "l"
}

/** Switches between light and dark from the keyboard, from whichever shows now. */
function ThemeHotkey() {
    const { resolvedTheme, setTheme } = useTheme()
    const current = React.useRef(resolvedTheme)
    current.current = resolvedTheme
    React.useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (!isThemeHotkey(e)) return
            e.preventDefault()
            setTheme(current.current === "dark" ? "light" : "dark")
        }
        document.addEventListener("keydown", onKey)
        return () => document.removeEventListener("keydown", onKey)
    }, [setTheme])
    return null
}

export function ThemeProvider({
                                  children,
                                  ...props
                              }: React.ComponentProps<typeof NextThemesProvider>) {
    return (
        <NextThemesProvider
            attribute="class"
            defaultTheme="system"
            enableSystem
            disableTransitionOnChange
            enableColorScheme
            {...props}
        >
            <ThemeHotkey />
            {children}
        </NextThemesProvider>
    )
}

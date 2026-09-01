"use client"

import {
    createContext,
    ReactNode,
    useContext,
    useEffect,
    useState,
    useCallback,
} from "react"

// The product's own accent. It was "blue", which is a shadcn default and meant a
// fresh install introduced itself in a colour OneCamp does not use anywhere else.
// Anyone with a stored choice keeps it; this only decides what someone who has
// never chosen sees.
const DEFAULT_THEME = "onecamp"
const THEME_STORAGE_KEY = "onecamp-theme-color"

// Every entry here MUST have a matching .theme-<name> block in app/themes.css.
// slate, zinc and stone were offered for as long as this list existed and had no
// CSS at all, so choosing one silently did nothing. themeCoverage.test.ts now
// fails the build rather than letting that happen again.
export const VALID_COLOR_THEMES = [
  "onecamp",
  "blue",
  "green",
  "amber",
  "rose",
  "violet",
  "teal",
  "orange",
  "slate",
  "zinc",
  "stone",
] as const

export type ColorTheme = (typeof VALID_COLOR_THEMES)[number]

export function isValidColorTheme(theme: string): theme is ColorTheme {
  return VALID_COLOR_THEMES.includes(theme as ColorTheme)
}

type ThemeContextType = {
    activeTheme: ColorTheme
    setActiveTheme: (theme: string) => void
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined)

function getStoredTheme(): ColorTheme {
    if (typeof window === "undefined") return DEFAULT_THEME
    try {
        const stored = localStorage.getItem(THEME_STORAGE_KEY)
        if (stored && isValidColorTheme(stored)) return stored
    } catch {
        // ignore
    }
    return DEFAULT_THEME
}

export function ActiveThemeProvider({
    children,
}: {
    children: ReactNode
}) {
    const [activeTheme, setActiveThemeState] = useState<ColorTheme>(getStoredTheme)

    const setActiveTheme = useCallback((theme: string) => {
        if (isValidColorTheme(theme)) {
            setActiveThemeState(theme)
            try {
                localStorage.setItem(THEME_STORAGE_KEY, theme)
            } catch {
                // ignore
            }
        }
    }, [])

    useEffect(() => {
        Array.from(document.body.classList)
            .filter((className) => className.startsWith("theme-"))
            .forEach((className) => {
                document.body.classList.remove(className)
            })
        document.body.classList.add(`theme-${activeTheme}`)
        if (activeTheme.endsWith("-scaled")) {
            document.body.classList.add("theme-scaled")
        }
    }, [activeTheme])

    return (
        <ThemeContext.Provider value={{ activeTheme, setActiveTheme }}>
            {children}
        </ThemeContext.Provider>
    )
}

export function useThemeConfig() {
    const context = useContext(ThemeContext)
    if (context === undefined) {
        throw new Error("useThemeConfig must be used within an ActiveThemeProvider")
    }
    return context
}

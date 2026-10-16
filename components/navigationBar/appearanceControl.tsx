"use client"

/**
 * Appearance in the account menu (design v3, hub.md P2): Light, Dark and
 * System as one segmented control whose raised chip slides between them
 * (lib/hub/slidingKnob), and under it six theme swatches. Hovering a swatch
 * previews its theme on the whole app (the frame's glow and the accent);
 * leaving puts the chosen one back, and a click keeps it. A change
 * cross-fades the app through the View Transitions API, instantly where that
 * is missing or motion is reduced.
 */
import { useRef } from "react"
import type React from "react"
import { useTheme } from "next-themes"

import { useThemeConfig } from "@/components/activeTheme/activeTheme"
import { prefersReducedMotion } from "@/lib/celebrate"
import { useSlidingKnob } from "@/lib/hub/slidingKnob"
import { cn } from "@/lib/utils/helpers/cn"

const MODES = [
  { id: "light", label: "Light" },
  { id: "dark", label: "Dark" },
  { id: "system", label: "System" },
] as const

/** The six swatches, each a theme in app/themes.css, with the colour its circle shows. */
export const SWATCHES = [
  { id: "onecamp", label: "Camp", color: "oklch(0.5808 0.1764 40.35)" },
  { id: "blue", label: "Blue", color: "oklch(0.55 0.19 258)" },
  { id: "green", label: "Green", color: "oklch(0.56 0.14 150)" },
  { id: "violet", label: "Violet", color: "oklch(0.54 0.2 292)" },
  { id: "rose", label: "Rose", color: "oklch(0.58 0.2 12)" },
  { id: "slate", label: "Slate", color: "oklch(0.45 0.03 257)" },
] as const

/** Runs a theme change inside a view transition when the browser has one and motion is welcome. */
export function withViewTransition(change: () => void): void {
  const doc = typeof document !== "undefined" ? (document as Document & { startViewTransition?: (cb: () => void) => unknown }) : null
  if (!doc?.startViewTransition || prefersReducedMotion()) {
    change()
    return
  }
  doc.startViewTransition(change)
}

/** Shows a theme on the body for a moment without choosing it; returns the undo. */
export function previewTheme(id: string): () => void {
  const body = document.body
  const before = Array.from(body.classList).filter((c) => c.startsWith("theme-"))
  before.forEach((c) => body.classList.remove(c))
  body.classList.add(`theme-${id}`)
  return () => {
    body.classList.remove(`theme-${id}`)
    before.forEach((c) => body.classList.add(c))
  }
}

export function AppearanceControl({ className, more }: { className?: string; more?: React.ReactNode }) {
  const { theme, setTheme } = useTheme()
  const mode = theme === "light" || theme === "dark" ? theme : "system"
  const row = useRef<HTMLDivElement>(null)
  const knob = useRef<HTMLSpanElement>(null)
  useSlidingKnob(row, knob, mode)

  return (
    <div data-appearance="" className={cn("flex flex-col gap-2.5 px-2 py-2", className)}>
      <div ref={row} role="radiogroup" aria-label="Appearance" className="hub-chip-rest relative grid h-[26px] grid-cols-3 rounded-md p-0.5">
        <span ref={knob} aria-hidden data-appearance-knob="" className="pointer-events-none absolute left-0 top-0.5 h-[22px] origin-left rounded-[5px] bg-raised opacity-0 shadow-sel" />
        {MODES.map((m) => {
          const on = m.id === mode
          return (
            <button
              key={m.id}
              type="button"
              role="radio"
              aria-checked={on}
              data-selected={on ? "" : undefined}
              onClick={() => withViewTransition(() => setTheme(m.id))}
              className={cn("relative z-[1] rounded-[5px] text-meta font-medium transition-colors focus-visible:outline-2 focus-visible:outline-brand", on ? "text-foreground" : "text-ink-3 hover:text-foreground")}
            >
              {m.label}
            </button>
          )
        })}
      </div>
      {/* The six, and the way to every colour Settings offers (QA SH-18:
          the menu had 6 and Settings 11, with no way between them). */}
      <div className="flex items-center justify-between gap-2">
        <ThemeSwatches />
        {more}
      </div>
    </div>
  )
}

/**
 * The six theme swatches on their own: under the account menu's segmented
 * control, and on the phone's More sheet beside its 44px Theme row, where
 * each circle sits in a 44px target (`touch`).
 */
export function ThemeSwatches({ touch = false }: { touch?: boolean }) {
  const { activeTheme, setActiveTheme } = useThemeConfig()
  const undo = useRef<(() => void) | null>(null)
  const endPreview = () => {
    undo.current?.()
    undo.current = null
  }
  return (
    // On a phone the six spread evenly over the room beside the label and the
    // last one ends on the row's own edge, so the row keeps one gutter on both
    // sides at any width; each 24px circle is touched as 44px.
    <div role="radiogroup" aria-label="Theme colour" className={cn("flex items-center", touch ? "ml-auto w-full max-w-[248px] justify-between" : "gap-2")} onMouseLeave={endPreview}>
      {SWATCHES.map((s) => {
        const on = s.id === activeTheme
        return (
          <button
            key={s.id}
            type="button"
            role="radio"
            aria-checked={on}
            aria-label={s.label}
            title={s.label}
            data-theme-swatch={s.id}
            onMouseEnter={() => {
              endPreview()
              if (!on) undo.current = previewTheme(s.id)
            }}
            onClick={() => {
              // The preview already shows it; keep it rather than undo it.
              undo.current = null
              withViewTransition(() => setActiveTheme(s.id))
            }}
            className={cn(
              "shrink-0 rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand",
              "transition-shadow",
              touch ? "relative size-6 after:absolute after:-inset-2.5 after:content-['']" : "size-[18px]",
              on && "hub-swatch-on",
            )}
            style={{ background: s.color }}
          />
        )
      })}
    </div>
  )
}

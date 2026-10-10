"use client"

import { Fragment, useCallback, useEffect, useState } from "react"
import { X } from "@/lib/icons"
import { Button } from "@/components/ui/button"
import { openShortcuts } from "@/components/shortcuts/ShortcutsDialog"
import { getShortcutKey } from "@/components/minimal-tiptap/utils"

const KEY = "oc_keys_tip_seen"
/** Long enough for the page to settle and the person to have looked around. */
export const SHOW_AFTER_MS = 6_000

const seen = () => {
  try {
    return localStorage.getItem(KEY) === "1"
  } catch {
    // No storage to remember a dismissal in: better never than every visit.
    return true
  }
}

const markSeen = () => {
  try {
    localStorage.setItem(KEY, "1")
  } catch {
    /* nothing to remember it in */
  }
}

/**
 * Once, on a computer: the three keys that change how OneCamp feels to use.
 * Gone for good on "Got it" or "See all shortcuts", and also once the person
 * presses Ctrl/⌘ K or ? on their own, since then they know. Bottom left, where
 * the demo's own notice (bottom right) never is.
 */
export function KeyboardTip() {
  const [open, setOpen] = useState(false)
  const done = useCallback(() => {
    markSeen()
    setOpen(false)
  }, [])

  useEffect(() => {
    if (seen()) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "?" || ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k")) done()
    }
    const t = setTimeout(() => setOpen(!seen()), SHOW_AFTER_MS)
    document.addEventListener("keydown", onKey)
    return () => {
      clearTimeout(t)
      document.removeEventListener("keydown", onKey)
    }
  }, [done])

  if (!open) return null
  const mod = getShortcutKey("mod").symbol
  const alt = getShortcutKey("alt").symbol
  const rows = [
    { keys: [mod, "K"], does: "Find anything, or run any command" },
    { keys: [alt, "click"], does: "Open a link side by side" },
    { keys: ["?"], does: "Every shortcut" },
  ]
  return (
    <aside
      role="complementary"
      aria-label="Keyboard tips"
      className="fixed bottom-4 left-4 z-[var(--z-toast)] w-[min(20rem,calc(100vw-2rem))] rounded-xl border border-border bg-background p-4 shadow-overlay motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-2"
    >
      <div className="flex items-start justify-between gap-2">
        <p className="pt-1.5 text-sm font-semibold">Three keys worth knowing</p>
        <button
          type="button"
          onClick={done}
          aria-label="Close the keyboard tips"
          className="-mr-2 -mt-1 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-highlight hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <dl className="mt-2 grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-2 text-sm">
        {rows.map((r) => (
          <Fragment key={r.does}>
            <dt className="flex items-center gap-1">
              {r.keys.map((k) => (
                <kbd key={k} className="rounded-sm border border-border bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground">
                  {k}
                </kbd>
              ))}
            </dt>
            <dd className="text-foreground">{r.does}</dd>
          </Fragment>
        ))}
      </dl>
      <div className="mt-4 flex justify-end gap-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            done()
            openShortcuts()
          }}
        >
          See all shortcuts
        </Button>
        {/* Outline: the tip floats over a page whose own primary action is
            the one filled button on screen. */}
        <Button size="sm" variant="outline" onClick={done}>
          Got it
        </Button>
      </div>
    </aside>
  )
}

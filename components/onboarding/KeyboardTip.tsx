"use client"

import { useCallback, useEffect, useState } from "react"
import { Check, X } from "@/lib/icons"
import { Button } from "@/components/ui/button"
import { CornerCard } from "@/components/ui/CornerStack"
import { openShortcuts } from "@/components/shortcuts/ShortcutsDialog"
import { getShortcutKey } from "@/components/minimal-tiptap/utils"
import { SHOW_AFTER_MS, keysTipSeen, knowsTheKeys, markSeen, onComputer, rowOf, type Row } from "./keysTip"

/**
 * Once, on a computer: the three keys that change how OneCamp feels to use
 * (design v3, admin.md E7). --pop, r12, e3, 300px; it rises 6 s into the
 * visit (KeysTipLoader fetches it and passes what is left of the wait).
 * Pressing one of its keys while it shows presses its chip (down 1px on the
 * press fill) and ticks the row in moss: it teaches by doing. Pressing ⌘K or
 * ? before it ever shows means the person knows, so it never does. Gone for
 * good on "Got it" or "See all".
 */
export function KeyboardTip({ showAfterMs = SHOW_AFTER_MS }: { showAfterMs?: number }) {
  const [open, setOpen] = useState(false)
  const [pressed, setPressed] = useState<Row | null>(null)
  const [done, setDone] = useState<Set<Row>>(() => new Set())
  const close = useCallback(() => {
    markSeen()
    setOpen(false)
  }, [])

  useEffect(() => {
    if (keysTipSeen() || !onComputer()) return
    let showing = false
    const onKey = (e: KeyboardEvent) => {
      const row = rowOf(e)
      if (!row) return
      if (!showing) {
        if (knowsTheKeys(e)) {
          markSeen()
          clearTimeout(t)
        }
        return
      }
      setPressed(row)
      setDone((d) => new Set(d).add(row))
    }
    const onUp = () => setPressed(null)
    const t = setTimeout(() => {
      if (keysTipSeen()) return
      showing = true
      setOpen(true)
    }, showAfterMs)
    document.addEventListener("keydown", onKey)
    document.addEventListener("keyup", onUp)
    return () => {
      clearTimeout(t)
      document.removeEventListener("keydown", onKey)
      document.removeEventListener("keyup", onUp)
    }
  }, [showAfterMs])

  if (!open) return null
  return (
    // The left-hand corner stack places it (components/ui/CornerStack).
    <CornerCard side="left" order={1}>
      <aside role="complementary" aria-label="Keyboard tips" className="ktip text-ink">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-medium">Three keys worth knowing</p>
          <button
            type="button"
            onClick={close}
            aria-label="Close the keyboard tips"
            className="-mr-1 inline-flex size-7 shrink-0 items-center justify-center rounded-md text-faint-foreground transition-colors hover:bg-hover hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
        <KeyRows pressed={pressed} done={done} />
        <div className="mt-3 flex items-center justify-between">
          <button
            type="button"
            className="text-xs font-medium text-brand-text underline-offset-[3px] hover:underline"
            onClick={() => {
              close()
              openShortcuts()
            }}
          >
            See all
          </button>
          <Button variant="ghost" size="xs" onClick={close}>
            Got it
          </Button>
        </div>
      </aside>
    </CornerCard>
  )
}

/** The three rows: here, and on the guided first run's last step. */
export function KeyRows({ pressed, done }: { pressed: Row | null; done: ReadonlySet<Row> }) {
  const mod = getShortcutKey("mod").symbol
  const alt = getShortcutKey("alt").symbol
  const rows: Array<{ id: Row; keys: string[]; does: string }> = [
    { id: "search", keys: [mod, "K"], does: "Search or ask" },
    // The spec's "C, New task" is not a shortcut the app has; this row is
    // one it does (see the slice report).
    { id: "side", keys: [alt, "click"], does: "Open side by side" },
    { id: "help", keys: ["?"], does: "All shortcuts" },
  ]
  return (
    <ul className="ktip-list mt-2">
      {rows.map((r) => (
        <li key={r.id} className="ktip-row" data-row={r.id}>
          <span className="ktip-keys">
            {r.keys.map((k) => (
              <kbd key={k} className="kbd ktip-key" data-pressed={pressed === r.id ? "" : undefined}>
                {k}
              </kbd>
            ))}
          </span>
          <span className="text-foreground">{r.does}</span>
          {done.has(r.id) && <Check className="ktip-tick" aria-label="Tried" role="img" />}
        </li>
      ))}
    </ul>
  )
}

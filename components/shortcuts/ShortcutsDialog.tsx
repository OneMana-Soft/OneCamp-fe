"use client"

import * as React from "react"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { SPLIT_SHORTCUTS } from "@/lib/split"
import { GO_KEYS } from "@/lib/goKeys"
import { LIST_SHORTCUTS } from "@/lib/listKeys"

/** Opens the list from anywhere (the command palette): `openShortcuts()`. */
const EVENT = "onecamp:shortcuts"
export const openShortcuts = () => window.dispatchEvent(new Event(EVENT))

const GENERAL = [
  { keys: "Ctrl/⌘ + K", does: "Search, and every command" },
  { keys: "Ctrl/⌘ + J", does: "Ask OneCamp AI (where AI is on)" },
  { keys: "?", does: "This list" },
]

const typing = (t: EventTarget | null) => {
  const el = t as HTMLElement | null
  return !!el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))
}

/**
 * The keyboard shortcuts, behind "?" (when not typing) and the palette. On a
 * Mac, Ctrl is Control and Alt is Option.
 */
export function ShortcutsDialog() {
  const [open, setOpen] = React.useState(false)
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "?" && !e.ctrlKey && !e.metaKey && !e.altKey && !typing(e.target)) {
        e.preventDefault()
        setOpen(true)
      }
    }
    const onOpen = () => setOpen(true)
    document.addEventListener("keydown", onKey)
    window.addEventListener(EVENT, onOpen)
    return () => {
      document.removeEventListener("keydown", onKey)
      window.removeEventListener(EVENT, onOpen)
    }
  }, [])
  const section = (title: string, rows: { keys: string; does: string }[]) => (
    <section className="flex flex-col gap-1.5">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</h3>
      <dl className="grid grid-cols-[minmax(0,11rem)_1fr] gap-x-4 gap-y-1.5 text-sm">
        {rows.map((r) => (
          <React.Fragment key={r.keys}>
            <dt>
              <kbd className="whitespace-nowrap rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-xs">{r.keys}</kbd>
            </dt>
            <dd className="text-muted-foreground">{r.does}</dd>
          </React.Fragment>
        ))}
      </dl>
    </section>
  )
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
          <DialogDescription>On a Mac, Ctrl is Control and Alt is Option.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-5">
          {section("Everywhere", GENERAL)}
          {section("Go to", GO_KEYS.map((g) => ({ keys: `G then ${g.key.toUpperCase()}`, does: g.label })))}
          {section("Lists and boards of tasks", LIST_SHORTCUTS)}
          {section("Side by side", SPLIT_SHORTCUTS)}
        </div>
      </DialogContent>
    </Dialog>
  )
}

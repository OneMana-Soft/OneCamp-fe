"use client"

import * as React from "react"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { SPLIT_SHORTCUTS } from "@/lib/split"
import { GO_KEYS } from "@/lib/goKeys"
import { LIST_SHORTCUTS } from "@/lib/listKeys"
import { Search } from "@/lib/icons"
import { cn } from "@/lib/utils/helpers/cn"

/** Opens the list from anywhere (the command palette): `openShortcuts()`. */
const EVENT = "onecamp:shortcuts"
export const openShortcuts = () => window.dispatchEvent(new Event(EVENT))

export interface ShortcutRow {
  keys: string
  does: string
}

export interface ShortcutGroup {
  title: string
  rows: ShortcutRow[]
}

const typing = (t: EventTarget | null) => {
  const el = t as HTMLElement | null
  return !!el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))
}

/**
 * The groups, in the order the dialog shows them (design v3, shell §K):
 * Everywhere, Go to, Lists and boards, Split view, Composer. "Ctrl/⌘" reads ⌘
 * on a Mac and Ctrl elsewhere. Go to comes from lib/goKeys, one row per place
 * (G A is kept as another way to Inbox).
 */
export function shortcutGroups({ ai }: { ai: boolean }): ShortcutGroup[] {
  const goRows: ShortcutRow[] = []
  for (const g of GO_KEYS) {
    const keys = `G then ${g.key.toUpperCase()}`
    const same = goRows.find((r) => r.does === g.label)
    if (same) same.keys = `${same.keys} or ${keys}`
    else goRows.push({ keys, does: g.label })
  }
  return [
    {
      title: "Everywhere",
      rows: [
        { keys: "Ctrl/⌘ + K", does: "Search or ask" },
        ...(ai ? [{ keys: "Ctrl/⌘ + J", does: "Ask OneCamp AI" }] : []),
        { keys: "Ctrl/⌘ + \\", does: "Toggle the sidebar" },
        { keys: "?", does: "This list" },
      ],
    },
    { title: "Go to", rows: goRows },
    { title: "Lists and boards", rows: LIST_SHORTCUTS },
    { title: "Split view", rows: SPLIT_SHORTCUTS },
    {
      title: "Composer",
      rows: [
        { keys: "Enter", does: "Send" },
        { keys: "Shift + Enter", does: "A new line" },
        { keys: "Ctrl/⌘ + B", does: "Bold" },
        { keys: "Ctrl/⌘ + I", does: "Italic" },
        { keys: "@", does: "Mention someone" },
      ],
    },
  ]
}

/** One piece of a written shortcut: a key, or a word between keys ("then", "or", "click"). */
export type Piece = { key: string } | { word: string }

/**
 * A written shortcut as keys and words. "J / K (or ↓ / ↑)" is J, /, K, or, ↓,
 * /, ↑; "Ctrl + Alt + S" is three keys; an all-lower-case word is a word.
 */
export function pieces(keys: string, mac: boolean): Piece[] {
  const out: Piece[] = []
  for (const raw of keys.replace(/[()]/g, " ").split(/\s+/).filter(Boolean)) {
    if (raw === "+") continue
    if (raw === "/" || /^[a-z]+$/.test(raw)) out.push({ word: raw })
    else out.push({ key: raw === "Ctrl/⌘" ? (mac ? "⌘" : "Ctrl") : raw })
  }
  return out
}

/**
 * The key combinations a row lists, each as normalised names, for lighting
 * the row up when they are pressed. Only combinations with a modifier: a
 * single key goes into the filter, which finds the row too.
 */
export function combosOf(keys: string): string[][] {
  const combos: string[][] = []
  for (const alt of keys.replace(/[()]/g, " ").split(/\s+or\s+/)) {
    if (/\bthen\b|click/.test(alt)) continue
    const parts = alt.split(/\s+\+\s+/).map((p) => p.trim()).filter(Boolean)
    if (parts.length < 2) continue
    const last = parts.pop()!
    // "Ctrl + Alt + 1 / 2 / 3" is three combinations.
    for (const finalKey of last.split(/\s*\/\s*/).filter(Boolean)) {
      combos.push([...parts, finalKey].map((p) => (p === "Ctrl/⌘" ? "mod" : p.toLowerCase())))
    }
  }
  return combos
}

/** What a key event presses, in combosOf's names. */
export function pressedOf(e: Pick<KeyboardEvent, "key" | "ctrlKey" | "metaKey" | "altKey" | "shiftKey">): string[] {
  const names: string[] = []
  if (e.ctrlKey) names.push("ctrl")
  if (e.metaKey) names.push("⌘")
  if (e.altKey) names.push("alt")
  if (e.shiftKey) names.push("shift")
  names.push(e.key.toLowerCase())
  return names
}

const MODS = ["ctrl", "⌘", "alt", "shift"]

/** Whether a combination was pressed: every key in it, and no modifier outside it. "mod" is Ctrl or ⌘. */
export function pressedMatches(combo: string[], pressed: string[]): boolean {
  const usesMod = combo.includes("mod")
  for (const k of combo) {
    if (k === "mod") {
      if (!pressed.includes("ctrl") && !pressed.includes("⌘")) return false
    } else if (!pressed.includes(k)) return false
  }
  for (const p of pressed) {
    if (!MODS.includes(p) || combo.includes(p)) continue
    if (usesMod && (p === "ctrl" || p === "⌘")) continue
    return false
  }
  return true
}

function Keys({ keys, mac, hit }: { keys: string; mac: boolean; hit: boolean }) {
  return (
    <span className="flex shrink-0 items-center gap-1">
      {pieces(keys, mac).map((p, i) =>
        "key" in p ? (
          <kbd key={i} className={cn("kbd", hit && "kbd-hit")}>
            {p.key}
          </kbd>
        ) : (
          <span key={i} className="text-3xs text-ink-3">
            {p.word}
          </span>
        ),
      )}
    </span>
  )
}

/**
 * The keyboard shortcuts, behind "?" (when not typing) and the palette
 * (design v3, shell §K, mock M7): 720px, r16, e4. A filter field takes the
 * focus and narrows by what a shortcut does or by its keys; two columns of
 * groups; v3 kbd chips. Pressing a listed combination while it is open lights
 * its row and brings it into view, without doing it.
 */
export function ShortcutsDialog() {
  const [open, setOpen] = React.useState(false)
  const [filter, setFilter] = React.useState("")
  const [hit, setHit] = React.useState<{ id: string; n: number } | null>(null)
  const filterRef = React.useRef<HTMLInputElement>(null)
  // This edition has no AI, so no ⌘J.
  const ai = false
  const [mac, setMac] = React.useState(false)
  React.useEffect(() => {
    setMac(/Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent))
  }, [])

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

  const groups = React.useMemo(() => shortcutGroups({ ai }), [ai])

  // Live keys: while the list is open, a listed combination lights its row and
  // goes no further, so ⌘K finds "Search or ask" rather than opening the palette.
  React.useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey || e.altKey)) return
      if (["Control", "Meta", "Alt", "Shift"].includes(e.key)) return
      const pressed = pressedOf(e)
      for (const g of groups) {
        for (const r of g.rows) {
          if (combosOf(r.keys).some((c) => pressedMatches(c, pressed))) {
            e.preventDefault()
            e.stopPropagation()
            setFilter("")
            setHit((h) => ({ id: `${g.title}:${r.does}`, n: (h?.n ?? 0) + 1 }))
            return
          }
        }
      }
    }
    window.addEventListener("keydown", onKey, true)
    return () => window.removeEventListener("keydown", onKey, true)
  }, [open, groups])

  React.useEffect(() => {
    if (!hit) return
    const row = Array.from(document.querySelectorAll<HTMLElement>("[data-shortcut-row]")).find((el) => el.dataset.shortcutRow === hit.id)
    row?.scrollIntoView?.({ block: "nearest" })
  }, [hit])

  const q = filter.trim().toLowerCase()
  const shown = groups
    .map((g) => ({
      ...g,
      rows: q ? g.rows.filter((r) => r.does.toLowerCase().includes(q) || r.keys.toLowerCase().includes(q) || pieces(r.keys, mac).some((p) => "key" in p && p.key.toLowerCase() === q)) : g.rows,
    }))
    .filter((g) => g.rows.length > 0)

  // Two columns: the first holds Everywhere and Go to, the second the rest.
  const first = (g: ShortcutGroup) => g.title === "Everywhere" || g.title === "Go to"
  const columns = [shown.filter(first), shown.filter((g) => !first(g))].filter((c) => c.length > 0)

  const section = (g: ShortcutGroup) => (
    <section key={g.title} data-shortcut-group={g.title}>
      {/* As the palette titles its groups: sentence case, quiet. */}
      <h3 className="flex h-8 items-end pb-1.5 text-2xs font-medium text-ink-3">{g.title}</h3>
      <ul>
        {g.rows.map((r) => {
          const id = `${g.title}:${r.does}`
          const lit = hit?.id === id
          return (
            <li
              key={id}
              data-shortcut-row={id}
              data-hit={lit || undefined}
              className={cn("flex min-h-8 items-center justify-between gap-4 border-b border-line py-1 text-sm", lit ? "text-foreground" : "text-ink-2")}
            >
              <span className="min-w-0">{r.does}</span>
              <Keys key={lit ? hit.n : 0} keys={r.keys} mac={mac} hit={lit} />
            </li>
          )
        })}
      </ul>
    </section>
  )

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o)
        if (!o) {
          setFilter("")
          setHit(null)
        }
      }}
    >
      <DialogContent
        data-shortcuts-dialog=""
        className="max-h-[85dvh] max-w-[720px] gap-0 bg-pop p-0 shadow-e4"
        onOpenAutoFocus={(e) => {
          // The filter, never the close button: focus on the x opened the list
          // with an orange box on it.
          e.preventDefault()
          filterRef.current?.focus({ preventScroll: true })
        }}
      >
        <DialogHeader className="px-5 pb-3 pt-5 text-left">
          <DialogTitle className="text-title-3 font-semibold">Keyboard shortcuts</DialogTitle>
          <DialogDescription className="text-xs text-ink-2">On a Mac, Ctrl is ⌘. Press a shortcut to find it.</DialogDescription>
        </DialogHeader>
        <label className="mx-5 mb-2 flex h-8 items-center gap-2 rounded-md bg-raised px-2.5 shadow-e1 focus-within:ring-1 focus-within:ring-brand/50">
          <Search className="size-3.5 shrink-0 text-ink-3" aria-hidden="true" />
          <input
            ref={filterRef}
            value={filter}
            onChange={(e) => {
              setFilter(e.target.value)
              setHit(null)
            }}
            placeholder="Filter shortcuts"
            aria-label="Filter shortcuts"
            className="h-full min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-ink-3"
          />
        </label>
        <div data-shortcut-columns="" className="grid grid-cols-1 gap-x-8 px-5 pb-5 pt-1 md:grid-cols-2">
          {shown.length === 0 ? (
            <p className="py-6 text-sm text-ink-3 md:col-span-2">No shortcut matches “{filter.trim()}”.</p>
          ) : (
            columns.map((col, i) => <div key={i}>{col.map(section)}</div>)
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

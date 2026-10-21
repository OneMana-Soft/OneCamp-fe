"use client"

import { useEffect, useLayoutEffect, useRef, type RefObject } from "react"
import { goArmed, isTyping } from "@/lib/goKeys"
import { stepIn } from "@/lib/listKeys"
import { showsTarget, type PanelTarget } from "@/lib/activity/panelTarget"

/**
 * The reading pane (STEP4 #6): the app's right panel, beside the Inbox. What
 * it shows now, and how to open a row in it or close it.
 */
export interface InboxPane {
  panel: { isOpen: boolean; data: PanelTarget }
  open: (target: PanelTarget) => void
  close: () => void
}

/** What a list of the Inbox hands its keys. */
export interface InboxListKeys<E> {
  /** The list's own box: its rows carry data-feed-key, and each row's stretched control data-row-link. */
  box: RefObject<HTMLElement | null>
  /** Its rows, in order. */
  entries: readonly E[]
  keyOf: (e: E) => string
  /** The reading pane, where the screen has room for it. */
  pane?: InboxPane
  /** Where a row opens beside the list; null for a row the panel can't hold. */
  targetOf: (e: E) => PanelTarget | null
  isUnread: (e: E) => boolean
  /** Marks a row read (true) or unread (false); without it, U does nothing. */
  setRead?: (e: E, read: boolean) => void
}

/**
 * The Inbox's keys, for every tab's list (STEP4 #6, chat P2): J and K (or the
 * arrows) move through the rows, starting at the first from the page; while
 * the panel shows one of the list's rows it follows, opening the next row's
 * thread, task or event and marking it read, and a row it can't hold closes
 * it. U marks the focused row read, or unread again. Never while typing, in a
 * menu or a dialog, or while the list is out of sight (another tab).
 *
 * Rows carry data-feed-key; J and K focus the row's [data-row-link], and a
 * row with nothing to open takes focus itself (tabIndex -1).
 */
export function useInboxListKeys<E>(opts: InboxListKeys<E>): void {
  const now = useRef(opts)
  useLayoutEffect(() => {
    now.current = opts
  })
  useEffect(() => {
    const rowOf = (box: HTMLElement, key: string) => box.querySelector<HTMLElement>(`[data-feed-key="${CSS.escape(key)}"]`)
    const focusRow = (box: HTMLElement, key: string) => {
      const row = rowOf(box, key)
      const control = row?.querySelector<HTMLElement>("[data-row-link]") ?? row
      control?.focus({ preventScroll: true })
      row?.scrollIntoView?.({ block: "nearest" })
    }
    const onKey = (e: KeyboardEvent) => {
      const { box: boxRef, entries, keyOf, pane, targetOf, isUnread, setRead } = now.current
      const el = boxRef.current
      if (!el || e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey || e.shiftKey || goArmed()) return
      const t = e.target instanceof Element ? e.target : null
      if (isTyping(t) || t?.closest("[role=dialog],[role=menu],[role=listbox],[role=combobox]")) return
      // Out of sight (another tab, a view set aside): not this list's keys.
      if (!el.isConnected || (typeof el.checkVisibility === "function" && !el.checkVisibility())) return
      const inList = !!t && el.contains(t)
      const onPage = !t || t === document.body || t === document.documentElement
      const shown = pane ? entries.find((x) => showsTarget(pane.panel, targetOf(x))) : undefined
      // In the panel while it shows one of these rows, J and K still walk the list.
      const inPanel = !!shown && !!t?.closest("[data-right-panel]")
      const focused = (t?.closest("[data-feed-key]") as HTMLElement | null)?.dataset.feedKey
      const k = e.key
      const by = k === "j" || k === "J" || k === "ArrowDown" ? 1 : k === "k" || k === "K" || k === "ArrowUp" ? -1 : 0
      const arrow = k === "ArrowDown" || k === "ArrowUp"
      if (by !== 0 && (inList || onPage || (inPanel && !arrow))) {
        const next = stepIn(entries.map(keyOf), focused ?? (shown ? keyOf(shown) : null), by)
        if (!next) return
        e.preventDefault()
        focusRow(el, next)
        const entry = entries.find((x) => keyOf(x) === next)
        if (!shown || !pane || !entry) return
        // The panel follows: the next row's thread, task or event; a row it can't hold closes it.
        const target = targetOf(entry)
        if (target) {
          setRead?.(entry, true)
          pane.open(target)
        } else pane.close()
        return
      }
      if ((k === "u" || k === "U") && inList && focused && setRead) {
        const entry = entries.find((x) => keyOf(x) === focused)
        if (!entry) return
        e.preventDefault()
        setRead(entry, isUnread(entry))
      }
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [])
}

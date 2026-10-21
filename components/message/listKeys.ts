// The message list's viewport keys (INTERACTION_SPEC §7; SHADCN-AUDIT's
// comparison with shadcn's message scroller). The list is a labelled region a
// keyboard can reach in one Tab stop, so someone without a pointer pages
// through the history without tabbing through every message's buttons:
// Page Up and Page Down move about a screenful, keeping a line or two of the
// last one in view, and Home and End go to the oldest message loaded and to
// the latest.

/** What a key does on the viewport: scroll by some pixels, or go to an end. */
export type ListKeyAction = { scrollBy: number } | { to: "start" | "end" }

/** What of a key press the rule reads (a React or DOM keyboard event). */
export interface ListKey {
  key: string
  altKey?: boolean
  ctrlKey?: boolean
  metaKey?: boolean
  target: EventTarget | null
  currentTarget?: EventTarget | null
}

/** How much of the last screen stays in view after Page Up or Page Down. */
export const PAGE_OVERLAP = 48

// Where a key belongs to something else: typing, or a menu, dialog or list
// box that has its own keys.
const OWN_KEYS =
  "input, textarea, select, [contenteditable=''], [contenteditable='true'], [role=textbox], [role=combobox], [role=menu], [role=menubar], [role=dialog], [role=listbox], [role=slider], [role=spinbutton]"

/**
 * What a key does on the message list's viewport whose visible height is
 * viewportHeight, or null for a key it leaves alone: any other key, one with
 * Alt, Ctrl or Cmd held, one pressed in a field, menu or dialog, and Home or
 * End pressed on a message's own control rather than the list. Pure.
 */
export function listKeyAction(e: ListKey, viewportHeight: number): ListKeyAction | null {
  if (e.altKey || e.ctrlKey || e.metaKey) return null
  const target = e.target instanceof Element ? e.target : null
  if (target?.closest(OWN_KEYS)) return null
  const page = Math.max(PAGE_OVERLAP, Math.round(viewportHeight) - PAGE_OVERLAP)
  switch (e.key) {
    case "PageDown":
      return { scrollBy: page }
    case "PageUp":
      return { scrollBy: -page }
    case "Home":
    case "End":
      // On the list itself only: a link or button in a message keeps its own.
      if (e.currentTarget && target !== e.currentTarget) return null
      return { to: e.key === "Home" ? "start" : "end" }
  }
  return null
}

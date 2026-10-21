/**
 * Split view: what can sit beside the main page, how a link names it, its
 * views' keys and its keys. Pure. The rules for many views are
 * lib/splitLayout's, which only the shell loads.
 */
export type PaneKind = "channel" | "chat" | "group" | "doc" | "project" | "task" | CallPaneKind

/** A call beside the page: in a channel, a DM or a group. */
export type CallPaneKind = "call-channel" | "call-chat" | "call-group"

export interface Pane {
  kind: PaneKind
  id: string
}

/** Side views at most: four views in all. */
export const MAX_PANES = 3

const ID = "([0-9a-zA-Z_-]{6,})"
const ROUTES: [RegExp, PaneKind][] = [
  [new RegExp(`^/app/meet/ch/${ID}`), "call-channel"],
  [new RegExp(`^/app/meet/chat/${ID}`), "call-chat"],
  [new RegExp(`^/app/meet/grp/${ID}`), "call-group"],
  [new RegExp(`^/app/channel/${ID}`), "channel"],
  [new RegExp(`^/app/chat/group/${ID}`), "group"],
  [new RegExp(`^/app/chat/${ID}`), "chat"],
  [new RegExp(`^/app/doc/${ID}`), "doc"],
  [new RegExp(`^/app/project/${ID}`), "project"],
  [new RegExp(`^/app/task/${ID}`), "task"],
]

/** The pane an in-app link opens, or null for one that can't be split. */
export function paneFromHref(href: string, origin = "http://x"): Pane | null {
  let path: string
  try {
    const u = new URL(href, origin)
    if (u.origin !== new URL(origin).origin) return null
    path = u.pathname
  } catch {
    return null
  }
  for (const [re, kind] of ROUTES) {
    const m = path.match(re)
    if (m) return { kind, id: m[1] }
  }
  return null
}

const CALL_PATHS: Record<CallPaneKind, string> = { "call-channel": "/app/meet/ch", "call-chat": "/app/meet/chat", "call-group": "/app/meet/grp" }

/** Whether a pane is a call. */
export const isCallPane = (p: Pane): p is Pane & { kind: CallPaneKind } => p.kind in CALL_PATHS

/** The page a pane shows, to open it full size. */
export function hrefOfPane(p: Pane): string {
  if (isCallPane(p)) return `${CALL_PATHS[p.kind]}/${p.id}`
  return p.kind === "group" ? `/app/chat/group/${p.id}` : `/app/${p.kind}/${p.id}`
}

export const same = (a: Pane, b: Pane) => a.kind === b.kind && a.id === b.id

/** The main page, among the views; a side view is its index in the panes. */
export const MAIN = -1

/** A view's key: the page's, or its pane's kind and id. */
export const MAIN_KEY = "main"
export const paneKey = (p: Pane) => `${p.kind}:${p.id}`
export const keyOf = (panes: Pane[], view: number) => (view === MAIN ? MAIN_KEY : paneKey(panes[view]))

/** The panes worth restoring next time: not calls, which nobody should rejoin by reloading. */
export const restorablePanes = (panes: Pane[]) => panes.filter((p) => !isCallPane(p))

/** Whether a stored value is a list of panes, so an old or edited one is dropped. */
export function isPaneList(v: unknown): v is Pane[] {
  return Array.isArray(v) && v.length <= MAX_PANES && v.every((p) => p && typeof p.id === "string" && ROUTES.some(([, k]) => k === p.kind))
}

export type SplitAction =
  | { type: "openHere" }
  | { type: "goTo"; view: number }
  | { type: "nth"; at: number }
  | { type: "step"; by: 1 | -1 }
  | { type: "move"; by: 1 | -1 }
  | { type: "even" }
  | { type: "focus" }
  | { type: "fullScreen" }
  | { type: "swap" }
  | { type: "close" }

interface Keys {
  code: string
  ctrlKey: boolean
  altKey: boolean
  metaKey: boolean
  shiftKey: boolean
  /** AltGr, which many European layouts need to type ś, @ or \\, arrives as Ctrl+Alt. */
  altGraph?: boolean
}

/**
 * The split-view shortcut a key press means, or null. All are Ctrl+Alt
 * (Control+Option on a Mac): the browser, the editor and the app's Ctrl/Cmd+K
 * and Ctrl/Cmd+J use none of them. Read from e.code, so a Mac's Option layer
 * (Option+1 types "¡") doesn't change what they mean.
 */
export function splitShortcut(e: Keys): SplitAction | null {
  if (!e.ctrlKey || !e.altKey || e.metaKey || e.altGraph) return null
  // Brackets, not arrows: GNOME switches workspaces on Ctrl+Alt+arrows. With
  // Shift they move the view.
  const by = e.code === "BracketRight" ? 1 : e.code === "BracketLeft" ? -1 : 0
  if (e.shiftKey) return by ? { type: "move", by } : null
  if (by) return { type: "step", by }
  const digit = /^Digit([1-4])$/.exec(e.code)
  if (digit) return { type: "nth", at: Number(digit[1]) - 1 }
  switch (e.code) {
    case "Backslash":
      return { type: "openHere" }
    case "Equal":
      return { type: "even" }
    case "Enter":
      return { type: "focus" }
    case "KeyF":
      return { type: "fullScreen" }
    case "KeyS":
      return { type: "swap" }
    case "KeyW":
      return { type: "close" }
  }
  return null
}

/**
 * Whether a shortcut is taken from the editor. In a doc, Ctrl+Alt+1-6 make
 * headings (Windows, Linux), so a view's number is the split's only while
 * that view is there: with one pane, Ctrl+Alt+3 stays Heading 3.
 */
export function claims(action: SplitAction, panes: number): boolean {
  if (action.type === "nth") return panes > 0 && action.at <= panes
  return !["goTo", "step", "move", "even", "swap", "close"].includes(action.type) || panes > 0
}

/** The shortcuts, for the list behind "?" and the palette. */
export const SPLIT_SHORTCUTS: { keys: string; does: string }[] = [
  { keys: "Alt + click a link", does: "Open it side by side" },
  { keys: "Ctrl + Alt + \\", does: "Open this page side by side" },
  { keys: "Ctrl + Alt + 1 / 2 / 3 / 4", does: "Go to the first, second, third or fourth view, left to right (while views are side by side)" },
  { keys: "Ctrl + Alt + [ / ]", does: "Go to the previous or next view" },
  { keys: "Ctrl + Alt + Shift + [ / ]", does: "Move this view left or right" },
  { keys: "Ctrl + Alt + =", does: "Even out the views' widths" },
  { keys: "Ctrl + Alt + Enter", does: "Focus: this view alone, and back" },
  { keys: "Ctrl + Alt + F", does: "Full screen, and back" },
  { keys: "Ctrl + Alt + S", does: "Swap this side view with the main one" },
  { keys: "Ctrl + Alt + W", does: "Close this side view" },
]

/**
 * Split view: what can sit beside the main page, and how a link names it.
 * Pure, for its test.
 */
export type PaneKind = "channel" | "chat" | "group" | "doc" | "project" | "task"

export interface Pane {
  kind: PaneKind
  id: string
}

/** Panes beside the main page. Two keeps each wide enough to work in. */
export const MAX_PANES = 2

const ID = "([0-9a-zA-Z_-]{6,})"
const ROUTES: [RegExp, PaneKind][] = [
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

/** The page a pane shows, to open it full size. */
export function hrefOfPane(p: Pane): string {
  return p.kind === "group" ? `/app/chat/group/${p.id}` : `/app/${p.kind}/${p.id}`
}

const same = (a: Pane, b: Pane) => a.kind === b.kind && a.id === b.id

/**
 * Panes after opening one: already open stays put; otherwise it goes on the
 * right, and the oldest makes room beyond MAX_PANES.
 */
export function withPane(panes: Pane[], p: Pane, max = MAX_PANES): Pane[] {
  if (panes.some((x) => same(x, p))) return panes
  return [...panes, p].slice(-max)
}

/** Whether a stored value is a list of panes, so an old or edited one is dropped. */
export function isPaneList(v: unknown): v is Pane[] {
  return Array.isArray(v) && v.length <= MAX_PANES && v.every((p) => p && typeof p.id === "string" && ROUTES.some(([, k]) => k === p.kind))
}

/** The main page, among the views; panes are 0 and 1. */
export const MAIN = -1

export type SplitAction =
  | { type: "openHere" }
  | { type: "goTo"; view: number }
  | { type: "step"; by: 1 | -1 }
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
  if (!e.ctrlKey || !e.altKey || e.metaKey || e.shiftKey || e.altGraph) return null
  switch (e.code) {
    case "Backslash":
      return { type: "openHere" }
    case "Digit1":
      return { type: "goTo", view: MAIN }
    case "Digit2":
      return { type: "goTo", view: 0 }
    case "Digit3":
      return { type: "goTo", view: 1 }
    // Brackets, not arrows: GNOME switches workspaces on Ctrl+Alt+arrows.
    case "BracketRight":
      return { type: "step", by: 1 }
    case "BracketLeft":
      return { type: "step", by: -1 }
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
 * Whether a shortcut should be taken away from the editor. In a doc,
 * Ctrl+Alt+1-3 make headings (Windows, Linux), so view numbers are only the
 * split's while there is a split to move around.
 */
export function claims(action: SplitAction, panes: number): boolean {
  if (action.type === "goTo" || action.type === "step") return panes > 0
  if (action.type === "swap" || action.type === "close") return panes > 0
  return true
}

/** The view after moving `by` from `from`, wrapping, among main and `panes` panes. */
export function stepView(from: number, by: 1 | -1, panes: number): number {
  const n = panes + 1
  return ((((from + 1 + by) % n) + n) % n) - 1
}

/** The shortcuts, for the list behind "?" and the palette. */
export const SPLIT_SHORTCUTS: { keys: string; does: string }[] = [
  { keys: "Alt + click a link", does: "Open it side by side" },
  { keys: "Ctrl + Alt + \\", does: "Open this page side by side" },
  { keys: "Ctrl + Alt + 1 / 2 / 3", does: "Go to the main view, the first or the second side view (while views are side by side)" },
  { keys: "Ctrl + Alt + [ / ]", does: "Go to the previous or next view" },
  { keys: "Ctrl + Alt + Enter", does: "Focus: this view alone, and back" },
  { keys: "Ctrl + Alt + F", does: "Full screen, and back" },
  { keys: "Ctrl + Alt + S", does: "Swap this side view with the main one" },
  { keys: "Ctrl + Alt + W", does: "Close this side view" },
]

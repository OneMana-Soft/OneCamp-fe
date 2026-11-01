/**
 * "Here now" on a board (miro-04 4): Jump to and Follow go to a person's tab,
 * never their name (N50), as a doc's do. A board's tabs share their name and
 * pointer on the collaboration's awareness (components/board/boardPresence):
 * a pointer is in the board's own coordinates. Who is here is grouped by the
 * doc's own rules (components/docEditor/presence/people); these are the
 * board's rules for where to look, pure so they are tested.
 * components/board/boardHereNow uses them.
 */
import type { DocCommandBus } from "@/components/docEditor/registry/types"
import { stampedEditor } from "@/components/docEditor/presence/stamp"

/** A board's own bus for its presence stack: no commands, only the key its list and the board share. Pure. */
export function boardBusOf(boardId: string): DocCommandBus {
  const key = `board:${boardId}`
  return { docId: key, key, emit() {}, on: () => () => {} }
}

/** Where a tab is pointing on the board, or null when it hasn't pointed at it. Pure. */
export function pointerOf(states: ReadonlyMap<number, unknown>, client: number): { x: number; y: number } | null {
  const p = (states.get(client) as { pointer?: { x: number; y: number } | null } | undefined)?.pointer
  return p && Number.isFinite(p.x) && Number.isFinite(p.y) ? { x: p.x, y: p.y } : null
}

/**
 * The scroll that puts a board point in the middle of the canvas, at the
 * zoom it's at: Excalidraw draws a point at (x + scrollX) * zoom. Pure.
 */
export function centreOn(view: { width: number; height: number; zoom: number }, point: { x: number; y: number }): { scrollX: number; scrollY: number } {
  return { scrollX: view.width / (2 * view.zoom) - point.x, scrollY: view.height / (2 * view.zoom) - point.y }
}

/** The awareness field a tab sets to bring everyone to its view, once (miro-21 1): a new id each time. */
export const BRING_FIELD = "bring"

type BroughtView = { scrollX: number; scrollY: number; zoom: number; width: number; height: number }

/** Another tab's bring: who made it, and the view to show, fitted to each screen (lib/board/viewport followView). */
export interface Bring {
  client: number
  id: string
  name?: string
  view: BroughtView
}

const isView = (v: unknown): v is BroughtView => {
  const o = v as Partial<BroughtView> | null
  const all = !!o && [o.scrollX, o.scrollY, o.zoom, o.width, o.height].every((n) => typeof n === "number" && Number.isFinite(n))
  return all && o!.zoom! > 0 && o!.width! > 0 && o!.height! > 0
}

/**
 * The brings other tabs made that this one hasn't seen, each once: `seen` keeps their ids. Called as the board
 * opens, it marks what is there as seen, so nobody is moved to a bring made before they came. A bring it can't
 * show (no id, or a view that isn't one) is left out, and so, unseen, is one from someone the relay doesn't stamp an
 * editor: only an editor brings everyone. Who brought it is the relay's name for them. Pure but for `seen`.
 */
export function bringsIn(states: ReadonlyMap<number, unknown>, self: number, seen: Set<string>): Bring[] {
  const out: Bring[] = []
  states.forEach((state, client) => {
    const s = state as { user?: { name?: string } | null; [BRING_FIELD]?: unknown } | undefined
    const b = s?.[BRING_FIELD] as { id?: unknown; view?: unknown } | null | undefined
    if (client === self || !stampedEditor(state) || !b || typeof b !== "object" || typeof b.id !== "string" || !b.id || seen.has(b.id) || !isView(b.view)) return
    seen.add(b.id)
    const { scrollX, scrollY, zoom, width, height } = b.view
    out.push({ client, id: b.id, name: s?.user?.name, view: { scrollX, scrollY, zoom, width, height } })
  })
  return out
}

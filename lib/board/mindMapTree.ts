// Mind maps (miro-15) as the drawing reads them. A node is a shape with words tagged customData.mindMap
// { map, parent, side, folded }, a connector a bound arrow tagged { map, child }: ordinary elements in the board's
// document. A folded node's branch leaves the drawing through the board's one scene filter (./layers splitHidden).
// Small on purpose: every canvas carries it. The layout, keys and bar load on first use (./mindMap).

import { selectedIn } from "./scene"

type Tagged = { id: string; containerId?: string | null; customData?: Record<string, unknown> | null }
export interface MindTag {
  map: string
  parent?: string | null
  side?: "l" | "r"
  folded?: boolean
  /** A connector's: the node it leads to. */
  child?: string
}

export const mindTag = (el: { customData?: Record<string, unknown> | null }): MindTag | undefined => {
  const t = el.customData?.mindMap as MindTag | undefined
  return t && typeof t === "object" && typeof t.map === "string" ? t : undefined
}

export const isFoldedNode = (el: { customData?: Record<string, unknown> | null }): boolean => {
  const t = mindTag(el)
  return !!t?.folded && !t.child
}

/** The board's own state, as far as the map keys and bar read it. */
export interface MindState {
  selectedElementIds?: Readonly<Record<string, boolean>>
  editingTextElement?: { containerId?: string | null } | null
}

/**
 * The one mind map node the board is on: the node whose words are being typed, else the one node selected; never a
 * connector. The bar's mount reads it from a change, the keys from Excalidraw's state at key time. `chosen`: the
 * selected elements, when the caller has them.
 */
export function mindNodeOf<T extends Tagged & { isDeleted?: boolean }>(elements: readonly T[], state: MindState, chosen?: readonly T[]): string | null {
  const holder = state.editingTextElement?.containerId
  const ids = state.selectedElementIds ?? {}
  const one = chosen ?? selectedIn(elements, Object.keys(ids).filter((id) => ids[id]))
  const node = (holder ? selectedIn(elements, [holder])[0] : undefined) ?? (one.length === 1 ? one[0] : undefined)
  const tag = node && mindTag(node)
  return tag && !tag.child ? node.id : null
}

/** What folded nodes hide: their descendants, those nodes' words and connectors. Never a folded node itself. Pure. */
export function foldedAway(elements: readonly Tagged[]): Set<string> {
  const up = new Map<string, string | null | undefined>()
  const folded = new Set<string>()
  for (const el of elements) {
    const t = mindTag(el)
    if (!t || t.child) continue
    up.set(el.id, t.parent)
    if (t.folded) folded.add(el.id)
  }
  const out = new Set<string>()
  if (folded.size === 0) return out
  // Up to the root; a parent cycle someone wrote ends after the map's size.
  for (const id of up.keys())
    for (let p = up.get(id), n = up.size; p && n > 0; p = up.get(p), n--)
      if (folded.has(p)) {
        out.add(id)
        break
      }
  return withAttached(elements, out)
}

/**
 * Map nodes with what goes with them: their words and the connectors into them, then a connector's words. Adds to
 * `ids` and returns it. The one walk for what a fold hides and what a branch's delete takes.
 */
export function withAttached(elements: readonly Tagged[], ids: Set<string>): Set<string> {
  for (let pass = 0; pass < 2; pass++)
    for (const el of elements) {
      const owner = mindTag(el)?.child ?? el.containerId
      if (owner && ids.has(owner)) ids.add(el.id)
    }
  return ids
}

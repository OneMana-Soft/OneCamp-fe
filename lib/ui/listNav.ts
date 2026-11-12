/** A windowed list's own order and reveal, for the keys (hooks/useListKeyboard); components/task/listWindow lends it. */
export interface ListNav {
  order: () => string[]
  has: (id: string) => boolean
  /** Into view and, unless `focus` is false, focused once drawn. */
  reveal: (id: string, focus?: boolean) => void
}

const navs = new WeakMap<Element, ListNav>()

/** Lends a [data-grouped-list] its nav; returns how to take it back. */
export function lendListNav(list: Element, nav: ListNav): () => void {
  navs.set(list, nav)
  return () => void (navs.get(list) === nav && navs.delete(list))
}

export function listNavIn(root: Element): ListNav | null {
  const list = root.matches("[data-grouped-list]") ? root : root.querySelector("[data-grouped-list]")
  return (list && navs.get(list)) ?? null
}

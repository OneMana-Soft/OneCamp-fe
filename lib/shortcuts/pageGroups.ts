// A page's own keys, first in the keys list while it's up (a call's: meet-18). An open list follows
// them (a table's come later, in their own chunk): one list per change, for useSyncExternalStore.
type Group = { title: string; rows: { keys: string; does: string }[] }
const shown = new Set<Group>()
const heard = new Set<() => void>()
let groups: readonly Group[] = []
const changed = () => {
  groups = [...shown]
  heard.forEach((f) => f())
}
export const pageGroups = () => groups
export function showPageKeys(g: Group): () => void {
  shown.add(g)
  changed()
  return () => void (shown.delete(g) && changed())
}
export function subscribePageGroups(f: () => void): () => void {
  heard.add(f)
  return () => void heard.delete(f)
}

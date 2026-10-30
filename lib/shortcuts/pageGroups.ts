// A page's own keys, first in the keys list while it's up (a call's: meet-18).
type Group = { title: string; rows: { keys: string; does: string }[] }
const shown = new Set<Group>()
export const pageGroups = (): Group[] => [...shown]
export function showPageKeys(g: Group): () => void {
  shown.add(g)
  return () => void shown.delete(g)
}

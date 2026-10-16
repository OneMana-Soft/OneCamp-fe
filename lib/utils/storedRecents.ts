/**
 * A short most-recent-first list kept in this browser: what someone used
 * last, for a menu to offer first ("/"'s Recent, a message's quick
 * reactions). Each item once, newest first, at most `size`. An entry that
 * isn't one (another version's, edited by hand) is left out, and storage that
 * can't be reached (a private window) reads as empty and keeps nothing.
 */
export function storedRecents<T>(key: string, size: number, rule: { valid: (x: unknown) => x is T; same: (a: T, b: T) => boolean }) {
  const read = (): T[] => {
    try {
      const list: unknown = JSON.parse(localStorage.getItem(key) || "[]")
      return Array.isArray(list) ? list.filter(rule.valid).slice(0, size) : []
    } catch {
      return []
    }
  }
  const note = (item: T): void => {
    try {
      localStorage.setItem(key, JSON.stringify([item, ...read().filter((x) => !rule.same(x, item))].slice(0, size)))
    } catch {
      /* a private window: nothing is kept */
    }
  }
  return { read, note }
}

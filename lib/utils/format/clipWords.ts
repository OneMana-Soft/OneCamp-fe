/**
 * Text cut to at most `max` characters at a word, with an ellipsis
 * ("Quarterly planning for…"), for a box that shows a name it can't widen
 * for (split view's ghost). A word longer than half of it is cut where it
 * must. Pure.
 */
export function clipWords(text: string, max: number): string {
  const flat = text.replace(/\s+/g, " ").trim()
  if (flat.length <= max) return flat
  const cut = flat.slice(0, max - 1)
  const at = cut.lastIndexOf(" ")
  return `${(at > max / 2 ? cut.slice(0, at) : cut).replace(/[\s,;:.]+$/, "")}…`
}

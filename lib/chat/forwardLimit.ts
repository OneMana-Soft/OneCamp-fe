/**
 * The most places one forward can go to: channels, groups and people
 * together. The server refuses a longer list in words (business/Send
 * MaxForwardPlaces, the same number), so the picker counts to it and says
 * why it stops.
 */
export const MAX_FORWARD_PLACES = 100

/** What the picker says under the places chosen; null when none is. Pure. */
export function forwardCountNote(count: number, max = MAX_FORWARD_PLACES): string | null {
  if (count <= 0) return null
  if (count >= max) return `${max} of ${max}: that's the most one forward can go to. Remove one to add another.`
  return `${count} of ${max} places`
}

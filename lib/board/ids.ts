/**
 * A new element id on a board: what it is, the time and a random part, so ids
 * made on two screens at the same moment never meet. The one id maker for
 * what the board adds itself: notes, frames, a generated diagram.
 */
export function newElementId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

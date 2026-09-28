/**
 * Whether a message list changed at its start: older messages loaded above,
 * or the oldest ones dropped, with the newest message the same.
 *
 * virtua keeps each row's measured height by position. Its `shift` mode moves
 * those heights along with the rows, which is right for a change at the start
 * and wrong for any other: with shift on while a message arrives at the end,
 * every row takes the height of the one before it and nothing re-measures, so
 * messages draw over each other. It was a timer (on for a second after asking
 * for older messages), which a message arriving in that second, or older
 * messages taking longer than it, got wrong. Deciding from the change itself
 * cannot drift.
 */
export function changedAtStart(prev: readonly { key: string }[] | null | undefined, next: readonly { key: string }[]): boolean {
  if (!prev?.length || !next.length) return false
  return prev[0].key !== next[0].key && prev[prev.length - 1].key === next[next.length - 1].key
}

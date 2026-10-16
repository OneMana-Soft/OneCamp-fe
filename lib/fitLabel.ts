/**
 * Which of a label's wordings to show: the first (they run longest first)
 * whose width fits the room, or the last when none does, which then
 * truncates. Pure, so the choice is testable without a layout engine.
 */
export function pickFitting(widths: readonly number[], room: number): number {
  if (widths.length === 0) return 0
  // Half a pixel of slack: widths come from layout, which rounds.
  const i = widths.findIndex((w) => w <= room + 0.5)
  return i < 0 ? widths.length - 1 : i
}

/**
 * The room a label has inside its row: the row's inner width, less every
 * other in-flow child and the gaps between them. Pure (sizes in, px out).
 */
export function roomFor({ inner, others, gap }: { inner: number; others: readonly number[]; gap: number }): number {
  const used = others.reduce((sum, w) => sum + w, 0) + gap * others.length
  return Math.max(0, inner - used)
}

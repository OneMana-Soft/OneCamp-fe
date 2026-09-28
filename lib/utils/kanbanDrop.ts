type Card = { task_uuid: string }
type Columns<T extends Card> = Record<string | number, T[]>

export interface SettledDrop<T extends Card> {
  items: Columns<T>
  column: string
  index: number
  /** The cards now directly above and below it; "" at a column's end. */
  before: string
  after: string
}

/** Whether a drop changed anything compared with where the drag began: a card
 * let go where it started sends nothing to the server. */
export function dropMovedCard<T extends Card>(start: Columns<T> | null, drop: SettledDrop<T>, activeId: string): boolean {
  if (!start) return true
  const startColumn = Object.keys(start).find((k) => start[k].some((t) => t.task_uuid === activeId))
  if (startColumn !== drop.column) return true
  const before = start[startColumn][start[startColumn].findIndex((t) => t.task_uuid === activeId) - 1]?.task_uuid ?? ""
  return before !== drop.before
}

/**
 * Put a card at a position in a column, the other cards keeping their order.
 * index counts the column's cards without the moved one, so "before the first
 * card" is 0 and "after the last" is the column's length. Returns null when
 * the card is not on the board or the column is unknown.
 */
export function placeCard<T extends Card>(items: Columns<T>, cardId: string, column: string, index: number): SettledDrop<T> | null {
  if (!(column in items)) return null
  const from = Object.keys(items).find((k) => items[k].some((t) => t.task_uuid === cardId))
  if (!from) return null
  const card = items[from].find((t) => t.task_uuid === cardId)!
  const next: Columns<T> = { ...items, [from]: items[from].filter((t) => t.task_uuid !== cardId) }
  const target = next[column]
  const at = Math.max(0, Math.min(index, target.length))
  const placed = [...target.slice(0, at), card, ...target.slice(at)]
  next[column] = placed
  return {
    items: next,
    column,
    index: at,
    before: placed[at - 1]?.task_uuid ?? "",
    after: placed[at + 1]?.task_uuid ?? "",
  }
}

/**
 * Where a card being dragged would land in a column: the index among the
 * column's other cards, from the pointer's height against each card's middle.
 * mids are the vertical middles of those cards, top to bottom.
 */
export function insertionIndex(mids: number[], pointerY: number): number {
  let i = 0
  while (i < mids.length && pointerY > mids[i]) i++
  return i
}

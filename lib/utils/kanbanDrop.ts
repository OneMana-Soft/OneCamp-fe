import { arrayMove } from "@dnd-kit/sortable"

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

/**
 * Where a dragged card lands when it is let go.
 *
 * During the drag, a card that crosses into another column is already moved
 * there (onDragOver). Reordering inside one column is left to the drop, as in
 * dnd-kit's own multi-column example: moving the array while the sortable
 * strategy is also animating the cards made them jitter, and the card could
 * land one place away from where it was let go.
 *
 * overId is a card or a column. Returns null when the drop does not place the
 * card anywhere (it is in no column, or the drop target is unknown).
 */
export function settleDrop<T extends Card>(items: Columns<T>, activeId: string, overId: string | number): SettledDrop<T> | null {
  const columnOf = (id: string | number) =>
    id in items ? String(id) : Object.keys(items).find((k) => items[k].some((t) => t.task_uuid === id))

  const column = columnOf(overId)
  if (!column || columnOf(activeId) !== column) return null

  let cards = items[column]
  const from = cards.findIndex((t) => t.task_uuid === activeId)
  const to = overId in items ? from : cards.findIndex((t) => t.task_uuid === overId)
  let next = items
  if (to >= 0 && to !== from) {
    cards = arrayMove(cards, from, to)
    next = { ...items, [column]: cards }
  }
  const index = cards.findIndex((t) => t.task_uuid === activeId)
  return {
    items: next,
    column,
    index,
    before: cards[index - 1]?.task_uuid ?? "",
    after: cards[index + 1]?.task_uuid ?? "",
  }
}

/** Whether a settled drop changed anything compared with where the drag began. */
export function dropMovedCard<T extends Card>(start: Columns<T> | null, drop: SettledDrop<T>, activeId: string): boolean {
  if (!start) return true
  const startColumn = Object.keys(start).find((k) => start[k].some((t) => t.task_uuid === activeId))
  if (startColumn !== drop.column) return true
  const before = start[startColumn][start[startColumn].findIndex((t) => t.task_uuid === activeId) - 1]?.task_uuid ?? ""
  return before !== drop.before
}

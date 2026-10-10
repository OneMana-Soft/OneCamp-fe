/**
 * Moving a card on a board from the keyboard, the way a pointer drag does it:
 * Space picks the card up, the arrows move the line that says where it will
 * land, Space (or Enter) puts it there and Escape puts it back. Pure, so the
 * steps are tested without a board.
 *
 * The board is a grid of lists: one row of status columns, or with swimlanes
 * a row per lane. A spot is a list and a place in it, counted among the
 * list's cards other than the one being moved (as the pointer's drop is):
 * 0 is above the first, `count` below the last.
 */

export type MoveKey = "up" | "down" | "left" | "right"

export interface Spot {
  column: string
  index: number
}

/** The arrow a key press means while a card is held, or null. */
export function moveKeyOf(key: string): MoveKey | null {
  switch (key) {
    case "ArrowUp":
    case "k":
      return "up"
    case "ArrowDown":
    case "j":
      return "down"
    case "ArrowLeft":
    case "h":
      return "left"
    case "ArrowRight":
    case "l":
      return "right"
  }
  return null
}

/**
 * Where the line goes on an arrow. Up and down walk the list, and at its ends
 * step into the lane above or below (the same status); left and right take
 * the next column in the row, at the same height or its last place. A step
 * off the board's edge stays put.
 *
 * count(list) is how many cards that list shows, the held one left out.
 */
export function stepSpot(grid: string[][], count: (list: string) => number, at: Spot, key: MoveKey): Spot {
  const row = grid.findIndex((r) => r.includes(at.column))
  if (row < 0) return at
  const col = grid[row].indexOf(at.column)
  const here = count(at.column)
  switch (key) {
    case "up":
      if (at.index > 0) return { column: at.column, index: Math.min(at.index, here) - 1 }
      if (row > 0) {
        const above = grid[row - 1][col]
        return above === undefined ? at : { column: above, index: count(above) }
      }
      return at
    case "down":
      if (at.index < here) return { column: at.column, index: at.index + 1 }
      if (row < grid.length - 1) {
        const below = grid[row + 1][col]
        return below === undefined ? at : { column: below, index: 0 }
      }
      return at
    case "left":
    case "right": {
      const next = grid[row][col + (key === "left" ? -1 : 1)]
      return next === undefined ? at : { column: next, index: Math.min(at.index, count(next)) }
    }
  }
}

/** "In progress, 2 of 4": where the line is, as a screen reader says it. */
export function spotLabel(listName: string, index: number, count: number): string {
  return `${listName}, ${index + 1} of ${count + 1}`
}

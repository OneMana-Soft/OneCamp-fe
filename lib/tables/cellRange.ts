/**
 * A block of a grid's cells (tables G1, gsheets-grid-01): where a range
 * started (anchor) and where it ends (focus), by row place in the view and
 * column in the grid's order. Pure.
 */
import type { CellPos } from "@/lib/tables/gridKeys"

export interface CellRange {
  anchor: CellPos
  focus: CellPos
}

/** A range's cells as a box: its first and last row and column, inclusive. */
export interface Box {
  top: number
  left: number
  bottom: number
  right: number
}

export function boxOf(r: CellRange): Box {
  return {
    top: Math.min(r.anchor.row, r.focus.row),
    left: Math.min(r.anchor.col, r.focus.col),
    bottom: Math.max(r.anchor.row, r.focus.row),
    right: Math.max(r.anchor.col, r.focus.col),
  }
}

export function inBox(b: Box, p: CellPos): boolean {
  return p.row >= b.top && p.row <= b.bottom && p.col >= b.left && p.col <= b.right
}

export function boxSize(b: Box): { rows: number; cols: number } {
  return { rows: b.bottom - b.top + 1, cols: b.right - b.left + 1 }
}

/** The step an arrow key takes, or null for any other key. */
function stepOf(key: string): CellPos | null {
  switch (key) {
    case "ArrowUp":
      return { row: -1, col: 0 }
    case "ArrowDown":
      return { row: 1, col: 0 }
    case "ArrowLeft":
      return { row: 0, col: -1 }
    case "ArrowRight":
      return { row: 0, col: 1 }
    default:
      return null
  }
}

/** Shift+an arrow: the focus moves a cell, the anchor stays, inside the grid. Null for any other key. */
export function extendRange(r: CellRange, key: string, size: { rows: number; cols: number }): CellRange | null {
  const step = stepOf(key)
  if (!step) return null
  const clamp = (n: number, count: number) => Math.min(Math.max(n, 0), Math.max(count - 1, 0))
  return { anchor: r.anchor, focus: { row: clamp(r.focus.row + step.row, size.rows), col: clamp(r.focus.col + step.col, size.cols) } }
}

/**
 * The box a pasted block fills from a range: a range of more than one cell
 * that is a whole multiple of the block both ways is filled whole (Sheets
 * tiles the block over it, and one value fills every cell); anything else
 * takes the block's own size from the range's top-left cell.
 */
export function pasteBox(range: Box, block: { rows: number; cols: number }): Box {
  const { rows, cols } = boxSize(range)
  const h = Math.max(block.rows, 1)
  const w = Math.max(block.cols, 1)
  if ((rows > 1 || cols > 1) && rows % h === 0 && cols % w === 0) return range
  return { top: range.top, left: range.left, bottom: range.top + h - 1, right: range.left + w - 1 }
}

/** A block repeated to fill rows by cols; a short line's missing cells are empty. */
export function tileBlock(block: string[][], rows: number, cols: number): string[][] {
  const width = Math.max(0, ...block.map((line) => line.length))
  if (!block.length || !width) return Array.from({ length: rows }, () => new Array<string>(cols).fill(""))
  return Array.from({ length: rows }, (_, r) => {
    const line = block[r % block.length] ?? []
    return Array.from({ length: cols }, (_, c) => line[c % width] ?? "")
  })
}

"use client"

// Where a dragged or keyed row lands in a tree, worked out from the rows on
// screen. Pure, so the tree and its tests share one answer: TreeView turns a
// pointer over a row, or ⌥⇧ and an arrow, into a TreeMove; the adapter sends
// it, and the server has the last word (it refuses a loop with 409).

/** A row as the tree shows it: enough to say where a move goes. */
export interface TreeSpot {
  id: string
  /** null at the top level. */
  parent: string | null
  /** Its siblings on screen, in order, itself included. */
  siblings: readonly string[]
  /** It shows its children (it's open). */
  open: boolean
  /** It can take children: the viewer may edit it. */
  canNest: boolean
  /** Its ancestors on screen, nearest first. */
  ancestors: readonly string[]
}

/** A move: the row goes under to (null: the top level), right after after
 *  (null: first or last, as place says). */
export interface TreeMove {
  id: string
  to: string | null
  after: string | null
  place?: "first" | "last"
}

export type DropZone = "before" | "inside" | "after"

/**
 * Which part of a row the pointer is over. The top and bottom quarters drop
 * beside the row, the middle half into it; a row that can't take children
 * splits in two.
 */
export function dropZone(rowTop: number, rowHeight: number, pointerY: number, canNest: boolean): DropZone {
  const y = Math.min(Math.max(pointerY - rowTop, 0), rowHeight)
  if (!canNest) return y < rowHeight / 2 ? "before" : "after"
  if (y < rowHeight / 4) return "before"
  if (y > (rowHeight * 3) / 4) return "after"
  return "inside"
}

/** Whether dragged may land on target at all: not on itself or anything under it. */
export function canDrop(dragged: string, target: TreeSpot): boolean {
  return dragged !== target.id && !target.ancestors.includes(dragged)
}

/** A move to sit right after `after` among `to`'s children, or first. */
function after(id: string, to: string | null, afterId: string | null): TreeMove {
  return afterId === null ? { id, to, after: null, place: "first" } : { id, to, after: afterId }
}

/**
 * The move a drop makes. Dropping below a row that shows its children puts
 * the dragged row first among them, where the line is drawn; inside a row
 * puts it last of its children. Null: nothing would change, or it can't go there.
 */
export function dropMove(dragged: TreeSpot, target: TreeSpot, zone: DropZone): TreeMove | null {
  if (!canDrop(dragged.id, target)) return null
  let move: TreeMove
  if (zone === "inside") {
    if (!target.canNest) return null
    move = { id: dragged.id, to: target.id, after: null, place: "last" }
  } else if (zone === "after" && target.open && target.canNest) {
    move = { id: dragged.id, to: target.id, after: null, place: "first" }
  } else {
    // The sibling the row will follow, not counting the row itself.
    const sibs = target.siblings.filter((s) => s !== dragged.id || target.parent !== dragged.parent)
    const at = sibs.indexOf(target.id)
    const prev = zone === "after" ? target.id : at > 0 ? sibs[at - 1] : null
    move = after(dragged.id, target.parent, prev === dragged.id ? null : prev)
  }
  return changes(dragged, move) ? move : null
}

/** Whether a move puts the row anywhere other than where it is. */
function changes(row: TreeSpot, move: TreeMove): boolean {
  if (move.to !== row.parent) return true
  const at = row.siblings.indexOf(row.id)
  if (move.after === null) return move.place === "last" ? at !== row.siblings.length - 1 : at !== 0
  return row.siblings[at - 1] !== move.after
}

export type KeyMove = "up" | "down" | "indent" | "outdent"

/**
 * The move a key makes: ⌥⇧↑ and ⌥⇧↓ swap a row with its neighbour; ⌥⇧→ makes
 * it the last child of the row above; ⌥⇧← puts it right after its parent.
 * Null at an edge, where the key does nothing.
 */
export function keyMove(row: TreeSpot, key: KeyMove, opts: { previousCanNest?: boolean; grandparent?: string | null } = {}): TreeMove | null {
  const at = row.siblings.indexOf(row.id)
  if (at < 0) return null
  switch (key) {
    case "up":
      if (at === 0) return null
      return after(row.id, row.parent, at === 1 ? null : row.siblings[at - 2])
    case "down":
      if (at === row.siblings.length - 1) return null
      return { id: row.id, to: row.parent, after: row.siblings[at + 1] }
    case "indent":
      if (at === 0 || opts.previousCanNest === false) return null
      return { id: row.id, to: row.siblings[at - 1], after: null, place: "last" }
    case "outdent":
      if (row.parent === null) return null
      return { id: row.id, to: opts.grandparent ?? null, after: row.parent }
  }
}

/**
 * Applies a move to the ids of one level, as the server will: out of the level
 * it leaves, into the one it joins. Used to show a move before its answer.
 */
export function moveWithin(ids: readonly string[], move: TreeMove, isSource: boolean, isTarget: boolean): string[] {
  let out = isSource ? ids.filter((id) => id !== move.id) : [...ids]
  if (!isTarget) return out
  out = out.filter((id) => id !== move.id)
  if (move.after !== null) {
    const at = out.indexOf(move.after)
    if (at >= 0) {
      out.splice(at + 1, 0, move.id)
      return out
    }
  }
  // No sibling to follow: first or last, as the server reads it (last unless told).
  return move.place === "first" ? [move.id, ...out] : [...out, move.id]
}

/** The line a drop would draw: above, below, or around the row; inset is the row's room before its indent. */
export function DropMark({ zone, depth, inset = 8 }: { zone: DropZone | null; depth: number; inset?: number }) {
  if (!zone) return null
  if (zone === "inside") {
    return <span aria-hidden="true" className="pointer-events-none absolute inset-0 rounded-md ring-2 ring-brand" data-drop="inside" />
  }
  return (
    <span
      aria-hidden="true"
      data-drop={zone}
      className={`pointer-events-none absolute right-1 h-0.5 rounded-xs bg-brand ${zone === "before" ? "-top-px" : "-bottom-px"}`}
      style={{ left: inset + depth * 16 }}
    />
  )
}

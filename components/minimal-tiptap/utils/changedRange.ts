import type { Node as PMNode } from "@tiptap/pm/model"

// Where a change is, from the docs themselves: y-prosemirror brings another
// person's change as the whole doc replaced, so steps say nothing useful.

/** Where two docs differ: from start to endA in the old, endB in the new. */
export function changedRange(before: PMNode, after: PMNode): { start: number; endA: number; endB: number } | null {
  const start = before.content.findDiffStart(after.content)
  if (start == null) return null
  const { a, b } = before.content.findDiffEnd(after.content)!
  // Repeated content can put an end before the start.
  const over = Math.max(0, start - Math.min(a, b))
  return { start, endA: a + over, endB: b + over }
}

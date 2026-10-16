import { diffRuns, wordsOf } from "@/lib/proposals/core"

// A changed block's words, marked as A9's review marks a suggestion's
// (PROGRAM §4 #19, "B8 reuses A9's"): its words (wordsOf) and its diff
// (diffRuns), so the history and a review never mark the same edit
// differently. Offsets are character offsets in the block's text: its words,
// joined, are the text.

/** A stretch of the new text that was added, or old text removed at an offset of the new. */
export type WordChange = { kind: "ins"; from: number; to: number } | { kind: "del"; at: number; text: string }

export interface WordDiff {
  changes: WordChange[]
  wordsAdded: number
  wordsRemoved: number
}

/** A block whose words mostly changed reads better as the old one struck and the new one whole. */
const MOSTLY = 0.75

const counts = (t: string) => /\S/.test(t)

/**
 * What changed between two texts of one block, word by word, as offsets in
 * the new text. Null when the block changed too much to say so usefully, or
 * is too long to compare word by word (the caller shows it removed and added).
 */
export function diffWords(before: string, after: string): WordDiff | null {
  const a = wordsOf(before)
  const b = wordsOf(after)
  const runs = diffRuns(a, b)
  if (!runs) return null
  const changes: WordChange[] = []
  let at = 0
  let wordsAdded = 0
  let wordsRemoved = 0
  for (const r of runs) {
    const added = b.slice(r.b0, r.b1)
    const size = added.join("").length
    if (!r.same) {
      const removed = a.slice(r.a0, r.a1)
      const text = removed.join("")
      if (counts(text)) changes.push({ kind: "del", at, text })
      if (size) changes.push({ kind: "ins", from: at, to: at + size })
      wordsRemoved += removed.filter(counts).length
      wordsAdded += added.filter(counts).length
    }
    at += size
  }
  // Rewritten, not edited: the old words struck through the new ones would be
  // harder to read than the two blocks. An empty side is never that: words
  // typed into an empty line are words added.
  const wordsBefore = a.filter(counts).length
  const wordsAfter = b.filter(counts).length
  if (wordsBefore && wordsAfter && (wordsAdded + wordsRemoved) / (wordsBefore + wordsAfter) > MOSTLY) return null
  // An added stretch is marked from its first word to its last: the spaces
  // round it stay plain, and one that only added spaces isn't marked at all.
  const marked: WordChange[] = []
  for (const c of changes) {
    if (c.kind === "del") {
      marked.push(c)
      continue
    }
    const s = after.slice(c.from, c.to)
    const from = c.from + (s.length - s.trimStart().length)
    const to = c.to - (s.length - s.trimEnd().length)
    if (to > from) marked.push({ kind: "ins", from, to })
  }
  return { changes: marked, wordsAdded, wordsRemoved }
}

/** How alike two texts are, 0..1, by the words they share (for pairing a removed block with an added one). */
export function likeness(before: string, after: string): number {
  const a = wordsOf(before).filter(counts)
  const b = wordsOf(after).filter(counts)
  if (!a.length && !b.length) return 1
  if (!a.length || !b.length) return 0
  const pool = new Map<string, number>()
  for (const t of a) pool.set(t, (pool.get(t) ?? 0) + 1)
  let shared = 0
  for (const t of b) {
    const n = pool.get(t) ?? 0
    if (n > 0) {
      shared++
      pool.set(t, n - 1)
    }
  }
  return (2 * shared) / (a.length + b.length)
}

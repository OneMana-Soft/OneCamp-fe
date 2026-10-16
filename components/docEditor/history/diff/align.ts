import { myers } from "./myers"
import { likeness } from "./words"

/** A block as the aligner sees it: its id (A1's data-block-id), its kind and its words. */
export interface BlockKey {
  id: string | null
  kind: string
  text: string
}

/** The new version's blocks in order, with the old ones that were removed where they stood. */
export type BlockStep =
  | { kind: "same"; a: number; b: number }
  | { kind: "changed"; a: number; b: number }
  | { kind: "added"; b: number }
  | { kind: "removed"; a: number }

/**
 * Past this many differences in one stretch of blocks without ids (a body
 * saved before blocks had them), the stretch reads as replaced whole.
 */
const MAX_BLOCK_EDITS = 500

/**
 * Lines the two versions' blocks up. Blocks with the same id are the same
 * block, wherever they went: the longest run that kept its order stays in
 * place, and a block that moved reads as removed where it was and added where
 * it is. Between those, blocks without a match (or saved before ids existed)
 * are lined up by their kind and words, and a removed block next to an added
 * one of the same kind with much the same words is one changed block. Pure.
 */
export function alignBlocks(before: BlockKey[], after: BlockKey[]): BlockStep[] {
  const byId = new Map<string, number>()
  before.forEach((blk, i) => {
    if (blk.id && !byId.has(blk.id)) byId.set(blk.id, i)
  })
  const pairs: Array<[number, number]> = []
  const seen = new Set<number>()
  after.forEach((blk, j) => {
    const i = blk.id ? byId.get(blk.id) : undefined
    if (i !== undefined && !seen.has(i)) {
      seen.add(i)
      pairs.push([i, j])
    }
  })
  const anchors = increasingRun(pairs)
  const steps: BlockStep[] = []
  let ai = 0
  let bj = 0
  for (const [i, j] of anchors) {
    steps.push(...alignGap(before, after, ai, i, bj, j))
    steps.push(same(before[i], after[j]) ? { kind: "same", a: i, b: j } : { kind: "changed", a: i, b: j })
    ai = i + 1
    bj = j + 1
  }
  steps.push(...alignGap(before, after, ai, before.length, bj, after.length))
  return steps
}

const same = (x: BlockKey, y: BlockKey) => x.kind === y.kind && x.text === y.text
const keyOf = (blk: BlockKey) => `${blk.kind}\u0000${blk.text}`

/** The pairs (in after order) whose before index keeps increasing, as many as can: a longest increasing subsequence. */
function increasingRun(pairs: Array<[number, number]>): Array<[number, number]> {
  const tails: number[] = []
  const prev = new Int32Array(pairs.length).fill(-1)
  for (let p = 0; p < pairs.length; p++) {
    const x = pairs[p][0]
    let lo = 0
    let hi = tails.length
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      if (pairs[tails[mid]][0] < x) lo = mid + 1
      else hi = mid
    }
    if (lo > 0) prev[p] = tails[lo - 1]
    tails[lo] = p
  }
  const out: Array<[number, number]> = []
  for (let p = tails.length ? tails[tails.length - 1] : -1; p >= 0; p = prev[p]) out.push(pairs[p])
  return out.reverse()
}

/** One stretch between anchors, lined up by kind and words. */
function alignGap(before: BlockKey[], after: BlockKey[], a0: number, a1: number, b0: number, b1: number): BlockStep[] {
  const removedAll = () => Array.from({ length: a1 - a0 }, (_, k) => ({ kind: "removed" as const, a: a0 + k }))
  const addedAll = () => Array.from({ length: b1 - b0 }, (_, k) => ({ kind: "added" as const, b: b0 + k }))
  if (a0 >= a1) return addedAll()
  if (b0 >= b1) return removedAll()
  // A block that moved out of the kept order is in one stretch on each side:
  // it reads as removed in one and added in the other.
  const ops = myers(before.slice(a0, a1).map(keyOf), after.slice(b0, b1).map(keyOf), MAX_BLOCK_EDITS)
  const raw: BlockStep[] = ops
    ? ops.map((op) => (op.kind === "same" ? { kind: "same", a: a0 + op.a, b: b0 + op.b } : op.kind === "del" ? { kind: "removed", a: a0 + op.a } : { kind: "added", b: b0 + op.b }))
    : [...removedAll(), ...addedAll()]
  return pairChanged(raw, before, after)
}

/** Two blocks with ids of their own are two blocks, however alike: only a block without one is matched by its words or its place. */
const unknown = (x: BlockKey, y: BlockKey) => !x.id || !y.id

/**
 * In each run of removed and added blocks, a removed block and an added one
 * of the same kind with much the same words become one changed block, in order.
 */
function pairChanged(steps: BlockStep[], before: BlockKey[], after: BlockKey[]): BlockStep[] {
  const out: BlockStep[] = []
  let k = 0
  while (k < steps.length) {
    if (steps[k].kind === "same") {
      out.push(steps[k++])
      continue
    }
    const run: BlockStep[] = []
    while (k < steps.length && steps[k].kind !== "same") run.push(steps[k++])
    const removed = run.filter((s): s is { kind: "removed"; a: number } => s.kind === "removed")
    const added = run.filter((s): s is { kind: "added"; b: number } => s.kind === "added")
    const matched = new Map<number, number>()
    let r = 0
    for (const ad of added) {
      for (let x = r; x < removed.length; x++) {
        const old = before[removed[x].a]
        const neu = after[ad.b]
        if (unknown(old, neu) && old.kind === neu.kind && likeness(old.text, neu.text) > 0.5) {
          matched.set(ad.b, removed[x].a)
          r = x + 1
          break
        }
      }
    }
    // Blocks without ids replaced in place, as many removed as added and of the
    // same kinds, are the same blocks edited ("Q3 plan" to "Q4 plan" shares
    // only half its words); the word diff still shows one rewritten whole.
    if (!matched.size && removed.length === added.length && removed.every((r, i) => unknown(before[r.a], after[added[i].b]) && before[r.a].kind === after[added[i].b].kind)) {
      removed.forEach((r, i) => matched.set(added[i].b, r.a))
    }
    const pairedA = new Set(matched.values())
    // The old before the new: each new block comes after the removed blocks
    // that stood before it, up to the old block of the next pair (which stays
    // with its pair).
    const pairAfter = new Array<number>(added.length).fill(Infinity)
    for (let x = added.length - 1, next = Infinity; x >= 0; x--) {
      pairAfter[x] = next
      const a = matched.get(added[x].b)
      if (a !== undefined) next = a
    }
    let ri = 0
    added.forEach((ad, x) => {
      const a = matched.get(ad.b)
      const upTo = a ?? pairAfter[x]
      while (ri < removed.length && removed[ri].a < upTo) {
        if (!pairedA.has(removed[ri].a)) out.push(removed[ri])
        ri++
      }
      if (a === undefined) {
        out.push(ad)
        return
      }
      if (ri < removed.length && removed[ri].a === a) ri++
      out.push({ kind: "changed", a, b: ad.b })
    })
    for (; ri < removed.length; ri++) if (!pairedA.has(removed[ri].a)) out.push(removed[ri])
  }
  return out
}

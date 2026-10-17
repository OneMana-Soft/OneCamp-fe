import { describe, expect, it } from "vitest"
import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { getSchema } from "@tiptap/core"
import StarterKit from "@tiptap/starter-kit"
import { Transform } from "@tiptap/pm/transform"
import {
  applyPlaced,
  childrenOf,
  diffBlocks,
  diffRuns,
  LIMITS,
  locate,
  nodeKey,
  nodesKey,
  validHunks,
} from "./core"

/**
 * core.js is the collaboration service's live/ops/proposalCore.js byte for
 * byte: a suggestion accepted here and one accepted from a list on the server
 * must leave the same doc. Change both copies, then this pin and the service's
 * (live/ops/proposalCore.test.js), to the same value.
 */
const CORE_SHA256 = "cf97ede94c524299ac16d6e46813fef05a21a943fa06e5d5b3202c0e39f47f77"

const schema = getSchema([StarterKit])
const t = (text: string, marks?: { type: string }[]) => (marks ? { type: "text", text, marks } : { type: "text", text })
const p = (...texts: (string | ReturnType<typeof t>)[]) => ({
  type: "paragraph",
  content: texts.map((x) => (typeof x === "string" ? t(x) : x)),
})
const blocks = (...b: object[]) => b.map((x) => schema.nodeFromJSON(x))

function applyAll(base: ReturnType<typeof blocks>, proposed: ReturnType<typeof blocks>, ids?: string[]) {
  const hunks = diffBlocks(base, proposed)
  const doc = schema.nodeFromJSON({ type: "doc", content: base.map((b) => b.toJSON()) })
  const r = locate(doc, { from: 0, to: doc.content.size }, base.map((b) => b.toJSON()), hunks, ids ?? null, null)
  const tr = new Transform(doc)
  applyPlaced(tr, r.placed)
  return { hunks, doc: tr.doc, ...r }
}

describe("the proposals core", () => {
  it("is the collaboration service's copy, byte for byte", () => {
    const sha = createHash("sha256").update(readFileSync(join(__dirname, "core.js"))).digest("hex")
    expect(sha, "core.js changed: copy it to live/ops/proposalCore.js in the backend, and update both pins").toBe(CORE_SHA256)
  })

  it("cuts a rewritten sentence into word changes and applies any of them", () => {
    const base = blocks(p("The quick brown fox jumps over the dog."))
    const proposed = blocks(p("The slow brown fox leaps over the lazy dog."))
    const all = applyAll(base, proposed)
    expect(all.hunks.map((h) => [h.level, h.op])).toEqual([
      ["inline", "replace"],
      ["inline", "replace"],
      ["inline", "insert"],
    ])
    expect(validHunks(base, all.hunks)).toBe(true)
    expect(nodesKey(childrenOf(all.doc))).toBe(nodesKey(proposed))
    const some = applyAll(base, proposed, ["h1", "h3"])
    expect(some.doc.textContent).toBe("The slow brown fox jumps over the lazy dog.")
  })

  it("swaps, inserts and removes blocks, marks included", () => {
    const base = blocks({ type: "heading", attrs: { level: 2 }, content: [t("Plan")] }, p("Ship Thursday."), p("Old note."))
    const proposed = blocks(
      { type: "heading", attrs: { level: 3 }, content: [t("Plan")] },
      p("Ship ", t("Friday", [{ type: "bold" }]), "."),
      p("Celebrate."),
    )
    expect(nodesKey(childrenOf(applyAll(base, proposed).doc))).toBe(nodesKey(proposed))
  })

  it("refuses hunks that do not match their base", () => {
    const base = blocks(p("Ship Thursday."))
    const hunks = diffBlocks(base, blocks(p("Ship Friday.")))
    expect(validHunks(base, hunks.map((h) => ({ ...h, before: [t("Monday")] })))).toBe(false)
  })

  // The service's own case (live/ops/proposalCore.test.js): the largest
  // suggestion an agent may send against a long section was 274M cells, 11 to
  // 15 s in which the collaboration service answered no editor. Counted, not
  // timed.
  it("diffs an agent's largest suggestion against a long section within one budget", () => {
    const base = Array.from({ length: 70 }, () => schema.nodeFromJSON(words(7000, "a")))
    const proposed = Array.from({ length: 70 }, () => schema.nodeFromJSON(words(140, "b")))
    const { result: hunks, work } = workOf(() => diffBlocks(base, proposed))
    expect(work).toBeLessThanOrEqual(diffWork * 1.01)
    appliesWhole(base, proposed, hunks)
  })

  it("diffs two hundred paragraphs rewritten whole within one budget", () => {
    const base = Array.from({ length: 200 }, () => schema.nodeFromJSON(words(1000, "a")))
    const proposed = Array.from({ length: 200 }, () => schema.nodeFromJSON(words(1000, "b")))
    const { result: hunks, work } = workOf(() => diffBlocks(base, proposed))
    expect(work).toBeLessThanOrEqual(diffWork * 1.01)
    appliesWhole(base, proposed, hunks)
  })

  // Past LIMITS.hunks a diff is one hunk for the whole target, so the pairs
  // after are not compared.
  it("stops comparing once it has more hunks than it keeps", () => {
    const n = (i: number) => String(i).padStart(3, "0")
    const para = (x: string, y: string) => {
      const w = Array.from({ length: 100 }, (_, i) => `w${i}`)
      w[25] = x
      w[75] = y
      return p(w.join(" "))
    }
    const base = Array.from({ length: 400 }, (_, i) => schema.nodeFromJSON(para(`old${n(i)}`, `was${n(i)}`)))
    const proposed = Array.from({ length: 400 }, (_, i) => schema.nodeFromJSON(para(`new${n(i)}`, `now${n(i)}`)))
    const blockTable = workOf(() => diffRuns(base.map(nodeKey), proposed.map(nodeKey))).work
    const onePair =
      workOf(() => diffBlocks([base[0]], [proposed[0]])).work - workOf(() => diffRuns([nodeKey(base[0])], [nodeKey(proposed[0])])).work
    expect(diffBlocks([base[0]], [proposed[0]])).toHaveLength(2)
    const { result: hunks, work } = workOf(() => diffBlocks(base, proposed))
    expect(work).toBeLessThanOrEqual(blockTable + (Math.floor(LIMITS.hunks / 2) + 1) * onePair)
    expect(hunks.map((h) => h.level)).toEqual(["block"])
    appliesWhole(base, proposed, hunks)
  })
})

/**
 * One diffBlocks call's budget, and a character's cutting in its cells. Read as
 * optional, so the tests fail by their counts on a core from before the budget.
 */
const budgeted = LIMITS as { diffWork?: number; cellsPerCharacter?: number }
const diffWork = budgeted.diffWork ?? 2 * LIMITS.diffCells
const cellsPerCharacter = budgeted.cellsPerCharacter ?? 16

/** A paragraph of n one-letter words: the most words a paragraph its length holds. */
const words = (n: number, w: string) => p(Array(n).fill(w).join(" "))

/**
 * workOf runs f and counts its diff work in the steps diffBlocks' budget
 * counts: every diffRuns table's cells, and every character cut into words
 * (wordsOf's pattern) at LIMITS.cellsPerCharacter. A count, not a clock.
 */
function workOf<T>(f: () => T): { result: T; work: number } {
  const Real = globalThis.Uint32Array
  const match = String.prototype.match
  let cells = 0
  let chars = 0
  globalThis.Uint32Array = class extends Real {
    constructor(...args: unknown[]) {
      super(...(args as [number]))
      if (typeof args[0] === "number") cells += args[0]
    }
  } as Uint32ArrayConstructor
  String.prototype.match = function (this: string, re: unknown) {
    if (re instanceof RegExp && re.source.startsWith("[\\p{L}")) chars += this.length
    return match.call(this, re as RegExp)
  } as typeof String.prototype.match
  try {
    const result = f()
    return { result, work: cells + chars * cellsPerCharacter }
  } finally {
    globalThis.Uint32Array = Real
    String.prototype.match = match
  }
}

/** Every hunk fits its base, and applying them all gives the proposal. */
function appliesWhole(base: ReturnType<typeof blocks>, proposed: ReturnType<typeof blocks>, hunks: ReturnType<typeof diffBlocks>) {
  expect(validHunks(base, hunks)).toBe(true)
  const doc = schema.nodeFromJSON({ type: "doc", content: base.map((b) => b.toJSON()) })
  const r = locate(doc, { from: 0, to: doc.content.size }, base.map((b) => b.toJSON()), hunks, null, null)
  expect(r.conflicts).toEqual([])
  const tr = new Transform(doc)
  applyPlaced(tr, r.placed)
  expect(nodesKey(childrenOf(tr.doc))).toBe(nodesKey(proposed))
}

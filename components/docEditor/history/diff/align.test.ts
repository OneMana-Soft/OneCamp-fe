import { describe, expect, it } from "vitest"
import { alignBlocks, type BlockKey } from "./align"
import { myers } from "./myers"
import { wordsOf } from "@/lib/proposals/core"
import { diffWords, likeness } from "./words"

const p = (text: string, id: string | null = null): BlockKey => ({ id, kind: "p", text })

describe("lining up two versions' blocks", () => {
  it("matches blocks by id wherever their words went", () => {
    const steps = alignBlocks([p("Plan", "a"), p("Ship Thursday", "b"), p("Done", "c")], [p("Plan", "a"), p("Ship Friday", "b"), p("Done", "c")])
    expect(steps).toEqual([
      { kind: "same", a: 0, b: 0 },
      { kind: "changed", a: 1, b: 1 },
      { kind: "same", a: 2, b: 2 },
    ])
  })

  it("puts a removed block back where it stood, and an added one where it is", () => {
    const steps = alignBlocks([p("One", "a"), p("Two", "b"), p("Three", "c")], [p("One", "a"), p("New", "n"), p("Three", "c")])
    expect(steps).toEqual([
      { kind: "same", a: 0, b: 0 },
      { kind: "removed", a: 1 },
      { kind: "added", b: 1 },
      { kind: "same", a: 2, b: 2 },
    ])
  })

  it("reads a block that moved as removed where it was and added where it is, keeping the rest in place", () => {
    const before = [p("A", "a"), p("B", "b"), p("C", "c"), p("D", "d")]
    const after = [p("B", "b"), p("C", "c"), p("D", "d"), p("A", "a")]
    const steps = alignBlocks(before, after)
    expect(steps.filter((s) => s.kind === "same").map((s) => (s as { b: number }).b)).toEqual([0, 1, 2])
    expect(steps[0]).toEqual({ kind: "removed", a: 0 })
    expect(steps[steps.length - 1]).toEqual({ kind: "added", b: 3 })
  })

  it("lines up a body saved before blocks had ids by words, pairing an edit as one changed block", () => {
    const before = [p("Intro"), p("We ship the launch on Thursday morning"), p("Outro")]
    const after = [p("Intro"), p("We ship the launch on Friday morning"), p("Brand new"), p("Outro")]
    expect(alignBlocks(before, after)).toEqual([
      { kind: "same", a: 0, b: 0 },
      { kind: "changed", a: 1, b: 1 },
      { kind: "added", b: 2 },
      { kind: "same", a: 2, b: 3 },
    ])
  })

  it("never pairs blocks of different kinds by their words", () => {
    const steps = alignBlocks([{ id: null, kind: "h2", text: "Ship it today" }], [{ id: null, kind: "p", text: "Ship it today now" }])
    expect(steps.map((s) => s.kind).sort()).toEqual(["added", "removed"])
  })

  it("covers every block of both versions exactly once", () => {
    const before = Array.from({ length: 40 }, (_, i) => p(`b${i % 7}`, i % 3 ? `id${i}` : null))
    const after = [...before.slice(5, 30).reverse(), p("x"), ...before.slice(0, 5), p("y", "id9")]
    const steps = alignBlocks(before, after)
    const as = steps.flatMap((s) => ("a" in s ? [s.a] : [])).sort((x, y) => x - y)
    const bs = steps.flatMap((s) => ("b" in s ? [s.b] : [])).sort((x, y) => x - y)
    expect(as).toEqual(before.map((_, i) => i))
    expect(bs).toEqual(after.map((_, j) => j))
  })
})

describe("myers", () => {
  const lcs = (a: string[], b: string[]) => {
    const t = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0))
    for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) t[i][j] = a[i - 1] === b[j - 1] ? t[i - 1][j - 1] + 1 : Math.max(t[i - 1][j], t[i][j - 1])
    return t[a.length][b.length]
  }
  it("finds a shortest edit for random sequences, which replays to the new one", () => {
    let seed = 7
    const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648
    for (let run = 0; run < 200; run++) {
      const a = Array.from({ length: Math.floor(rnd() * 30) }, () => "abcde"[Math.floor(rnd() * 5)])
      const b = Array.from({ length: Math.floor(rnd() * 30) }, () => "abcde"[Math.floor(rnd() * 5)])
      const ops = myers(a, b)!
      expect(ops.filter((o) => o.kind === "same").length).toBe(lcs(a, b))
      const replay = ops.filter((o) => o.kind !== "del").map((o) => (o.kind === "same" ? a[o.a] : b[o.b]))
      expect(replay).toEqual(b)
      for (const o of ops) if (o.kind === "same") expect(a[o.a]).toBe(b[o.b])
    }
  })

  it("gives up past its limit", () => {
    const a = Array.from({ length: 50 }, (_, i) => `a${i}`)
    const b = Array.from({ length: 50 }, (_, i) => `b${i}`)
    expect(myers(a, b, 10)).toBeNull()
  })
})

describe("what changed in a block's words", () => {
  it("says the words added as stretches of the new text, and the words removed where they stood", () => {
    const after = "Ship on Friday morning"
    const d = diffWords("Ship on Thursday morning", after)!
    expect(d.changes).toEqual([
      { kind: "del", at: 8, text: "Thursday" },
      { kind: "ins", from: 8, to: 14 },
    ])
    expect(after.slice(8, 14)).toBe("Friday")
    expect([d.wordsAdded, d.wordsRemoved]).toEqual([1, 1])
  })

  it("reads words in any script, and keeps every character", () => {
    expect(wordsOf("Größe 12 — naïve").join("")).toBe("Größe 12 — naïve")
    expect(wordsOf("Größe 12")).toEqual(["Größe", " ", "12"])
  })

  // PROGRAM §4 #19 (batch 16 audit, B8): the history marks an edit as a
  // suggestion's review does, by A9's words and A9's diff.
  it("marks an edit as a suggestion's review does", () => {
    const said = (before: string, after: string) =>
      diffWords(before, after)!.changes.map((c) => (c.kind === "del" ? `-${c.text}` : `+${after.slice(c.from, c.to)}`))
    // The review's own case (lib/proposals/core.test.ts): three changes.
    expect(said("The quick brown fox jumps over the dog.", "The slow brown fox leaps over the lazy dog.")).toEqual(["-quick", "+slow", "-jumps", "+leaps", "+lazy"])
    // An apostrophe is inside a word, as the review reads it.
    expect(said("We don't ship today", "We won't ship today")).toEqual(["-don't", "+won't"])
  })

  it("calls a block rewritten, not edited, when most of its words changed", () => {
    expect(diffWords("The quick brown fox", "Entirely different words here")).toBeNull()
  })

  it("marks words typed into an empty line as added", () => {
    expect(diffWords("", "Fresh words")!.changes).toEqual([{ kind: "ins", from: 0, to: 11 }])
  })

  it("tells alike texts from unlike ones", () => {
    expect(likeness("ship the launch on thursday", "ship the launch on friday")).toBeGreaterThan(0.5)
    expect(likeness("one two", "three four")).toBe(0)
  })
})

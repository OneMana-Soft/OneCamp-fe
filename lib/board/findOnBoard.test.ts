import { describe, expect, it } from "vitest"
import { findOnBoard, matchedLinesOf, replaceOnBoard, searchMatchesOf, unreplaceOnBoard, wordsOf, type FindElement } from "@/lib/board/findOnBoard"

const ANY = { caseSensitive: false, wholeWord: false }
const at = (o: Partial<FindElement> & Pick<FindElement, "id" | "type">): FindElement => ({ x: 0, y: 0, width: 100, height: 40, ...o })
const words = (id: string, text: string, o: Partial<FindElement> = {}): FindElement =>
  at({ id, type: "text", text, originalText: text.replace(/\n/g, " "), fontSize: 20, lineHeight: 1.25, textAlign: "left", ...o })

// A frame with a note and a shape in it, words on their own outside it, and an arrow's label.
const board: FindElement[] = [
  words("free", "Budget review", { x: 0, y: 900 }),
  at({ id: "f1", type: "frame", name: "Launch budget", x: 0, y: 0, width: 800, height: 600 }),
  at({ id: "n1", type: "rectangle", frameId: "f1", x: 20, y: 300, customData: { kind: "note" }, boundElements: [{ id: "n1t", type: "text" }] }),
  words("n1t", "Set the\nbudget", { containerId: "n1", frameId: "f1", x: 30, y: 310, originalText: "Set the budget" }),
  at({ id: "s1", type: "ellipse", frameId: "f1", x: 20, y: 40, boundElements: [{ id: "s1t", type: "text" }] }),
  words("s1t", "BUDGET owner", { containerId: "s1", frameId: "f1", x: 30, y: 50 }),
  at({ id: "a1", type: "arrow", x: 0, y: 700, boundElements: [{ id: "a1t", type: "text" }] }),
  words("a1t", "budgets", { containerId: "a1", x: 10, y: 690 }),
  words("gone", "budget", { isDeleted: true }),
]

describe("finding words on a board", () => {
  it("finds a frame's name and every element's words, the frame first, then what's in it top down, then the rest", () => {
    const found = findOnBoard(board, "budget", { caseSensitive: false, wholeWord: false })
    expect(found.map((m) => [m.id, m.target, m.kind, m.index])).toEqual([
      ["f1", "f1", "frame", 7],
      ["s1t", "s1", "shape", 0],
      ["n1t", "n1", "note", 8],
      ["a1t", "a1", "arrow", 0],
      ["free", "free", "text", 0],
    ])
    expect(found[2].frameId).toBe("f1")
    expect(found[2].preview).toEqual({ before: "Set the ", hit: "budget", after: "" })
  })

  it("matches case and whole words when asked, and never deleted elements", () => {
    expect(findOnBoard(board, "budget", { caseSensitive: true, wholeWord: false }).map((m) => m.id)).toEqual(["f1", "n1t", "a1t"])
    expect(findOnBoard(board, "budget", { caseSensitive: false, wholeWord: true }).map((m) => m.id)).toEqual(["f1", "s1t", "n1t", "free"])
    expect(findOnBoard(board, "", { caseSensitive: false, wholeWord: false })).toEqual([])
  })

  it("lists words outside every frame after the frames' groups, even words placed above a frame", () => {
    const above = [words("top", "budget notes", { x: 0, y: -200 }), ...board]
    expect(findOnBoard(above, "budget", ANY).map((m) => m.id)).toEqual(["f1", "s1t", "n1t", "top", "a1t", "free"])
  })
})

describe("where a match's light falls on its words", () => {
  // Every character 10 wide: lines are 25 high (20 x 1.25).
  const measure = (text: string) => text.length * 10

  it("is a box a line, across the lines the words wrap onto, padded to the typed text's indices", () => {
    const el = words("w", "Set the\nbudget now", { originalText: "Set the budget now", width: 100 })
    // "the budget" runs from index 4 over the wrap: "the" on line 0, "budget" on line 1.
    expect(matchedLinesOf(el, 4, 10, measure)).toEqual([
      { offsetX: 40, offsetY: 0, width: 40, height: 25 },
      { offsetX: 0, offsetY: 25, width: 60, height: 25 },
    ])
  })

  it("moves with the words' alignment", () => {
    const centred = words("c", "budget", { textAlign: "center", width: 100 })
    expect(matchedLinesOf(centred, 0, 6, measure)).toEqual([{ offsetX: 20, offsetY: 0, width: 60, height: 25 }])
    const right = words("r", "budget", { textAlign: "right", width: 100 })
    expect(matchedLinesOf(right, 0, 6, measure)[0].offsetX).toBe(40)
  })

  it("lights words only (never a frame's name), the current one focused", () => {
    const found = findOnBoard(board, "budget", { caseSensitive: false, wholeWord: false })
    const lit = searchMatchesOf(board, found, 1, measure)
    expect(lit.map((m) => [m.id, m.focus])).toEqual([
      ["s1t", true],
      ["n1t", false],
      ["a1t", false],
      ["free", false],
    ])
  })
})

describe("replacing words on a board", () => {
  it("gives each changed element its new words, literally (no $& patterns), frames by name", () => {
    const found = findOnBoard(board, "budget", { caseSensitive: false, wholeWord: false })
    const next = replaceOnBoard(board, found, "$& plan")
    expect(Object.fromEntries(next)).toEqual({
      f1: "Launch $& plan",
      s1t: "$& plan owner",
      n1t: "Set the $& plan",
      a1t: "$& plans",
      free: "$& plan review",
    })
  })

  it("replaces only the matches it is given (Replace: the current one)", () => {
    const found = findOnBoard(board, "budget", { caseSensitive: false, wholeWord: false })
    expect(Object.fromEntries(replaceOnBoard(board, [found[2]], "cost"))).toEqual({ n1t: "Set the cost" })
  })

  it("replaces every match in one element, from the last, so words of another length land where each was found", () => {
    const twice = [words("t", "budget, then budget again")]
    const found = findOnBoard(twice, "budget", ANY)
    expect(found).toHaveLength(2)
    expect(Object.fromEntries(replaceOnBoard(twice, found, "the plan"))).toEqual({ t: "the plan, then the plan again" })
    expect(Object.fromEntries(replaceOnBoard(twice, found, "x"))).toEqual({ t: "x, then x again" })
  })

  it("leaves alone a match whose words have changed since it was found", () => {
    const found = findOnBoard(board, "budget", ANY)
    const since = board.map((e) => (e.id === "n1t" ? { ...e, text: "Set the cost", originalText: "Set the cost" } : e))
    const next = replaceOnBoard(since, found, "plan")
    expect(next.has("n1t")).toBe(false)
    expect(next.get("s1t")).toBe("plan owner")
  })

  it("undoes a Replace by its words from before, never over words changed since nor on a deleted element", () => {
    const wrote = replaceOnBoard(board, findOnBoard(board, "budget", ANY), "plan")
    const before = new Map(board.filter((e) => wrote.has(e.id)).map((e) => [e.id, wordsOf(e)]))
    const laid = (e: FindElement, w: string): FindElement => (e.type === "frame" ? { ...e, name: w } : { ...e, text: w, originalText: w })
    const now = board.map((e) => (wrote.has(e.id) ? laid(e, wrote.get(e.id)!) : e))
    const later = now.map((e) => (e.id === "n1t" ? laid(e, "Set the cost") : e.id === "free" ? { ...e, isDeleted: true } : e))
    expect(Object.fromEntries(unreplaceOnBoard(later, wrote, before))).toEqual({ f1: "Launch budget", s1t: "BUDGET owner", a1t: "budgets" })
    expect(unreplaceOnBoard(board, wrote, before).size).toBe(0)
  })
})

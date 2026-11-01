import { describe, expect, it } from "vitest"
import { SLIDE_ID } from "./slideId"
import { deckOf, slidePlace, stepSlide, type SceneFrame } from "./slides"

const frame = (id: string, x: number, y: number, name: string | null = null, more: Partial<SceneFrame> = {}): SceneFrame => ({ id, type: "frame", x, y, width: 400, height: 300, name, ...more })

describe("a board's frames as the slides of a call's stage", () => {
  // Two rows of frames: the deck reads them as the Frames panel lists them.
  const intro = frame("f-intro", 0, 0, "Intro")
  const numbers = frame("f-q4", 500, 0, "  Q4 numbers ")
  const plan = frame("f-plan", 0, 400)
  const scene = [plan, frame("note-1", 10, 10, null, { type: "rectangle" }), numbers, intro]

  it("takes the frames in the panel's reading order, top row first, by their names", () => {
    expect(deckOf(scene, null)).toEqual([
      { id: "f-intro", name: "Intro" },
      { id: "f-q4", name: "Q4 numbers" },
      { id: "f-plan", name: "" },
    ])
  })

  it("follows the order the board keeps, then any frame not in it yet", () => {
    expect(deckOf(scene, ["f-plan", "gone", "f-intro"]).map((s) => s.id)).toEqual(["f-plan", "f-intro", "f-q4"])
  })

  it("leaves out deleted frames, and frames the server wouldn't take as a slide", () => {
    const odd = [frame("f-intro", 0, 0, "Intro", { isDeleted: true }), frame("has space", 0, 0), frame("x".repeat(65), 0, 0), frame("y".repeat(64), 900, 0)]
    expect(deckOf(odd, null).map((s) => s.id)).toEqual(["y".repeat(64)])
    expect(SLIDE_ID.test("has space")).toBe(false)
    expect(SLIDE_ID.test("x".repeat(65))).toBe(false)
    expect(SLIDE_ID.test("AbC_0-9")).toBe(true)
  })

  it("steps to the next and the previous slide, and nowhere past either end", () => {
    const deck = deckOf(scene, null)
    expect(stepSlide(deck, "f-intro", 1)).toBe("f-q4")
    expect(stepSlide(deck, "f-q4", -1)).toBe("f-intro")
    expect(stepSlide(deck, "f-plan", 1)).toBeNull()
    expect(stepSlide(deck, "f-intro", -1)).toBeNull()
  })

  it("starts from the whole board, or a slide no longer on it: Next is the first slide, Previous goes nowhere", () => {
    const deck = deckOf(scene, null)
    expect(stepSlide(deck, "", 1)).toBe("f-intro")
    expect(stepSlide(deck, "", -1)).toBeNull()
    expect(stepSlide(deck, "f-deleted", 1)).toBe("f-intro")
    expect(stepSlide(deck, "f-deleted", -1)).toBeNull()
    expect(stepSlide([], "", 1)).toBeNull()
  })

  it("says where a slide sits, from 1, and nothing for the whole board or a slide that's gone", () => {
    const deck = deckOf(scene, null)
    expect(slidePlace(deck, "f-q4")).toEqual({ at: 2, of: 3, name: "Q4 numbers" })
    expect(slidePlace(deck, "f-plan")).toEqual({ at: 3, of: 3, name: "" })
    expect(slidePlace(deck, "")).toBeNull()
    expect(slidePlace(deck, "f-deleted")).toBeNull()
  })
})

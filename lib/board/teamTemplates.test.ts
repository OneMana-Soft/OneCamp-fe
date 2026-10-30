import { describe, expect, it } from "vitest"
import {
  BOARD_TEMPLATE_MAX_BYTES,
  TEAM_CATEGORY,
  boardTemplatePayload,
  listedBoard,
  listedShapes,
  teamBoardItems,
  teamTemplateRef,
  templateElementsOf,
} from "./teamTemplates"

// A workspace's own board templates (miro-19 3): listed with the server's
// drawing of each, offered in the picker under "Your team's", and read in
// full when one is used.

const listedPayload = JSON.stringify({
  title: "Sprint retro",
  count: 6,
  preview: [
    { type: "frame", x: -20, y: -20, w: 640, h: 300 },
    { type: "rectangle", x: 0, y: 0, w: 180, h: 180, fill: "#E1F5F6", note: true },
    { type: "text", x: 0, y: -80, w: 220, h: 35 },
    { type: "arrow", x: 200, y: 90, w: 120, h: -40 },
    { type: "ellipse", x: 340, y: 0, w: 120, h: 80 },
  ],
})

describe("a team's board template, as a list carries it", () => {
  it("reads its title, how much is on it and its drawing, and nothing from a payload it can't read", () => {
    expect(listedBoard({ name: "Retro", payload: listedPayload })).toMatchObject({ title: "Sprint retro", count: 6 })
    expect(listedBoard({ name: "Retro", payload: listedPayload }).preview).toHaveLength(5)
    expect(listedBoard({ name: "Retro", payload: "not json" })).toEqual({ title: "Retro", count: 0, preview: [] })
    expect(listedBoard({ name: "Retro", payload: JSON.stringify({ preview: [{ type: "rectangle", x: "a" }] }) }).preview).toEqual([])
  })

  it("draws from its top left: frames, notes in their colours, shapes, words and arrows", () => {
    const s = listedShapes(listedBoard({ name: "", payload: listedPayload }).preview)
    // Bounds: x from -20 to 620 (the frame), y from -80 (the heading) to 280 (the frame).
    expect([s.width, s.height]).toEqual([640, 360])
    expect(s.frames).toEqual([{ x: 0, y: 60, w: 640, h: 300 }])
    expect(s.notes).toEqual([{ x: 20, y: 80, w: 180, h: 180, colour: "teal" }])
    expect(s.labels).toEqual([{ x: 20, y: 0, w: 220, h: 35 }])
    expect(s.lines).toEqual([{ x1: 220, y1: 170, x2: 340, y2: 130 }])
    expect(s.boxes).toEqual([{ x: 360, y: 80, w: 120, h: 80, round: true }])
  })

  it("is offered under Your team's, by its id, found by who saved it", () => {
    const [item] = teamBoardItems([{ id: "t-1", name: "Sprint retro", description: null, payload: listedPayload, author_name: "Ann Lee" }])
    expect(item).toMatchObject({ id: "team:t-1", templateId: "t-1", name: "Sprint retro", category: TEAM_CATEGORY, count: 6 })
    expect(item.description).toBe("Saved by Ann Lee")
    expect(item.keywords).toContain("Ann Lee")
    expect(teamTemplateRef(item.id)).toBe("t-1")
    expect(teamTemplateRef("retro")).toBeNull()
    expect(teamTemplateRef("team:")).toBeNull()
  })

  it("offers nothing it can't read: a list that isn't one, or rows without an id and a name, or of another kind", () => {
    // An answer from an older server, or any body that isn't the list, crashed every board's picker.
    expect(teamBoardItems({})).toEqual([])
    expect(teamBoardItems(undefined)).toEqual([])
    expect(teamBoardItems("[]")).toEqual([])
    const rows = [
      null,
      { id: "t-2" },
      { name: "Nameless" },
      { id: "t-3", name: "A doc's template", kind: "doc", payload: "{}" },
      { id: "t-1", name: "Sprint retro", kind: "board", payload: listedPayload },
      { id: "t-4", name: "Older row", payload: 7 },
    ]
    expect(teamBoardItems(rows).map((t) => t.templateId)).toEqual(["t-1", "t-4"])
    expect(teamBoardItems(rows)[1]).toMatchObject({ name: "Older row", count: 0, description: "Saved by your team" })
  })
})

describe("a team's board template, read in full", () => {
  it("is its elements, each with an id and a type", () => {
    const payload = JSON.stringify({ title: "Retro", elements: [{ id: "n1", type: "rectangle", x: 0, y: 0, width: 10, height: 10 }, { type: "text" }, "x", null] })
    expect(templateElementsOf({ payload }).map((e) => e.id)).toEqual(["n1"])
    expect(templateElementsOf({ payload: "{" })).toEqual([])
  })

  it("is saved as a title and elements, and says how large it is against what a template holds", () => {
    const elements = [{ id: "n1", type: "rectangle", x: 0, y: 0, width: 10, height: 10, text: "naïve" }]
    const { payload, bytes } = boardTemplatePayload(" Retro ", elements)
    expect(payload).toEqual({ title: "Retro", elements })
    expect(bytes).toBe(new TextEncoder().encode(JSON.stringify(payload)).length)
    expect(BOARD_TEMPLATE_MAX_BYTES).toBe(1 << 20)
  })
})

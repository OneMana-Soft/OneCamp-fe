import { describe, expect, it } from "vitest"
import {
  ALL_NOTE_COLOURS,
  CAMP_NOTE_COLOURS,
  NOTE_COLOURS,
  NOTE_FONT_FLOOR,
  NOTE_FONT_SIZES,
  NOTE_SIZES,
  fitFontSize,
  isStickyNote,
  nextNoteSize,
  noteColourFromMiro,
  noteColourOf,
  noteColourOfFill,
  noteSizeOf,
  noteSkeleton,
  type MiroStickyColour,
} from "./notes"
import { CLUSTER_GAP, boardTags, clusterGroups, clusterLayout, gridColumns, hasAnyTag, nextNoteSpot, normaliseTags, noteGrid, noteTags, notesFromText, tagKey, tagKeys, tidyNotes, withoutTag } from "./sticky"
import { tagTone } from "@/lib/tags"
import { hueFor } from "@/lib/campHue"
import { FRAME_PAD } from "./frames"
import { CAMP_HUES } from "@/lib/campHue"
import { STICKY_COLOURS } from "./templates"

// WCAG's contrast between two colours, for a note's words on its paper.
function luminance(hex: string) {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]
}
const contrast = (a: string, b: string) => {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p)
  return (x + 0.05) / (y + 0.05)
}

const MIRO: MiroStickyColour[] = ["gray", "light_yellow", "yellow", "orange", "light_green", "green", "dark_green", "cyan", "light_pink", "pink", "violet", "red", "light_blue", "blue", "dark_blue", "black"]

describe("note colours", () => {
  it("keep each of Miro's sixteen sticky colours as a colour of its own", () => {
    const kept = ALL_NOTE_COLOURS.map((id) => NOTE_COLOURS[id].miro)
    expect([...kept].sort()).toEqual([...MIRO].sort())
    for (const m of MIRO) expect(NOTE_COLOURS[noteColourFromMiro(m)].miro).toBe(m)
    expect(noteColourFromMiro("magenta")).toBe("yellow")
    expect(new Set(ALL_NOTE_COLOURS.map((id) => NOTE_COLOURS[id].fill.toLowerCase())).size).toBe(16)
  })

  it("offer the camp six first, as the templates have always drawn them", () => {
    expect(ALL_NOTE_COLOURS.slice(0, 6)).toEqual(CAMP_NOTE_COLOURS)
    for (const id of Object.keys(STICKY_COLOURS) as (keyof typeof STICKY_COLOURS)[]) {
      expect(NOTE_COLOURS[id].fill).toBe(STICKY_COLOURS[id].fill)
      expect(NOTE_COLOURS[id].ink).toBe(STICKY_COLOURS[id].ink)
    }
  })

  it("put every note's words on its paper at 4.5:1 or more", () => {
    for (const id of ALL_NOTE_COLOURS) {
      const c = NOTE_COLOURS[id]
      expect(contrast(c.ink, c.fill), id).toBeGreaterThanOrEqual(4.5)
    }
  })

  it("read a note's colour from its record, else from its fill", () => {
    expect(noteColourOfFill("#fff6d6")).toBe("yellow")
    expect(noteColourOfFill("#123456")).toBeNull()
    expect(noteColourOf({ backgroundColor: "#FFF6D6", customData: { colour: "navy" } })).toBe("navy")
    expect(noteColourOf({ backgroundColor: "#E7EFFC" })).toBe("blue")
  })
})

describe("a note", () => {
  it("is a square of its size, in its colour, marked as a note, in the board's font", () => {
    const n = noteSkeleton({ id: "n1", x: 10, y: 20, text: "Ship it", colour: "teal", size: "l", style: "clean", tags: normaliseTags(["#Design", "design", " risk "]) })
    expect(n).toMatchObject({ type: "rectangle", id: "n1", x: 10, y: 20, width: NOTE_SIZES.l, height: NOTE_SIZES.l, roughness: 0, fillStyle: "solid" })
    expect(n.backgroundColor).toBe(NOTE_COLOURS.teal.fill)
    expect(n.label).toMatchObject({ text: "Ship it", strokeColor: NOTE_COLOURS.teal.ink, fontFamily: 6, fontSize: 24 })
    expect(n.customData).toEqual({ kind: "note", colour: "teal", tags: ["Design", "risk"] })
    expect(noteSkeleton({ id: "n2", x: 0, y: 0, style: "sketch" }).label.fontFamily).toBe(5)
  })

  it("is known by its mark, or by a note colour with words in it", () => {
    expect(isStickyNote({ id: "a", type: "rectangle", customData: { kind: "note" } })).toBe(true)
    expect(isStickyNote({ id: "b", type: "rectangle", backgroundColor: "#FFF6D6", boundElements: [{ id: "t", type: "text" }] })).toBe(true)
    expect(isStickyNote({ id: "c", type: "rectangle", backgroundColor: "#FFF6D6" })).toBe(false)
    expect(isStickyNote({ id: "d", type: "rectangle", backgroundColor: "#a5d8ff", boundElements: [{ id: "t", type: "text" }] })).toBe(false)
    expect(isStickyNote({ id: "e", type: "ellipse", customData: { kind: "note" } })).toBe(false)
    expect(isStickyNote({ id: "f", type: "rectangle", customData: { kind: "note" }, isDeleted: true })).toBe(false)
  })

  it("takes the nearest size from its width", () => {
    expect(noteSizeOf(140)).toBe("s")
    expect(noteSizeOf(185)).toBe("m")
    expect(noteSizeOf(300)).toBe("l")
  })
})

describe("tags", () => {
  it("are trimmed, without #, once each whatever the case, and at most eight", () => {
    expect(normaliseTags(["#risk", "Risk", "  design  ", "", 7, "a  b"])).toEqual(["risk", "design", "a b"])
    expect(normaliseTags(Array.from({ length: 12 }, (_, i) => `t${i}`))).toHaveLength(8)
    expect(normaliseTags(["x".repeat(40)])[0]).toHaveLength(32)
  })

  it("are counted across a board's notes, most used first", () => {
    const note = (id: string, tags: string[]) => ({ id, type: "rectangle", customData: { kind: "note", tags } })
    expect(boardTags([note("a", ["risk", "ux"]), note("b", ["Risk"]), note("c", ["api"]), { id: "d", type: "ellipse", customData: { tags: ["x"] } }])).toEqual([
      { tag: "risk", count: 2 },
      { tag: "api", count: 1 },
      { tag: "ux", count: 1 },
    ])
    expect(noteTags({ customData: { tags: "nope" } })).toEqual([])
  })
})

describe("placing notes", () => {
  const box = (x: number, y: number, s = 180) => ({ x, y, width: s, height: s })

  it("puts the next note beside the last, past anything already there", () => {
    expect(nextNoteSpot(box(0, 0), [])).toEqual({ x: 204, y: 0 })
    expect(nextNoteSpot(box(0, 0), [box(204, 0)])).toEqual({ x: 408, y: 0 })
    expect(nextNoteSpot(box(0, 0), [box(0, 204)], "below")).toEqual({ x: 0, y: 408 })
  })

  it("makes one note a line from pasted text, dropping list marks and blank lines", () => {
    expect(notesFromText("- Ship it\n\n* Load test\n• Freeze copy\n1. Book the retro\n2) Docs\n[ ] Call Acme\n[x] Done  thing\n   ")).toEqual([
      "Ship it",
      "Load test",
      "Freeze copy",
      "Book the retro",
      "Docs",
      "Call Acme",
      "Done thing",
    ])
    expect(notesFromText(Array.from({ length: 150 }, (_, i) => `n${i}`).join("\n"))).toHaveLength(100)
  })

  it("lays a bulk of notes in a grid a little wider than tall, centred where asked", () => {
    expect([1, 2, 4, 6, 9, 12].map(gridColumns)).toEqual([1, 2, 3, 3, 4, 5])
    const g = noteGrid(4, 0, 0, 100, 20)
    expect(g).toEqual([
      { x: -170, y: -110 },
      { x: -50, y: -110 },
      { x: 70, y: -110 },
      { x: -170, y: 10 },
    ])
  })

  it("tidies a loose cluster into an even grid in reading order, keeping a row a row", () => {
    const messy = [
      { id: "c", ...box(430, 10) },
      { id: "a", ...box(0, 0) },
      { id: "b", ...box(190, -20) },
      { id: "d", ...box(-15, 230) },
      { id: "e", ...box(260, 250) },
    ]
    const t = tidyNotes(messy)
    expect(t.get("a")).toEqual({ x: -15, y: -20 })
    expect(t.get("b")).toEqual({ x: 189, y: -20 })
    expect(t.get("c")).toEqual({ x: 393, y: -20 })
    expect(t.get("d")).toEqual({ x: -15, y: 184 })
    expect(t.get("e")).toEqual({ x: 189, y: 184 })
    const row = tidyNotes([{ id: "x", ...box(0, 0) }, { id: "y", ...box(500, 30) }])
    expect(row.get("y")).toEqual({ x: 204, y: 0 })
    expect(tidyNotes([])).toEqual(new Map())
  })
})

describe("a tag's colour (miro-07 5)", () => {
  it("is the hue picked for it, else its name's, as a task's tag of that name, whatever the case or spacing", () => {
    expect(hueFor("Risk", "moss")).toBe("moss")
    expect(CAMP_HUES).toContain(hueFor("Risk"))
    expect(hueFor(" risk ")).toBe(hueFor("RISK"))
    expect(tagTone("Risk")).toContain(`hue-${hueFor("risk")}`)
    // A picked colour the palette doesn't have folds onto it; nonsense falls back to the name's.
    expect(hueFor("risk", "purple")).toBe("dusk")
    expect(hueFor("risk", "not a colour")).toBe(hueFor("risk"))
  })
})

describe("clusters (miro-07 5)", () => {
  const note = (id: string, o: { tags?: string[]; colour?: string; x?: number; y?: number; size?: number } = {}) => ({
    id,
    type: "rectangle",
    x: o.x ?? 0,
    y: o.y ?? 0,
    width: o.size ?? 180,
    height: o.size ?? 180,
    backgroundColor: NOTE_COLOURS[(o.colour ?? "yellow") as keyof typeof NOTE_COLOURS]?.fill ?? o.colour,
    boundElements: [{ id: `${id}-t`, type: "text" }],
    customData: { kind: "note", colour: o.colour ?? "yellow", tags: o.tags ?? [] },
  })

  it("by tag: each note once, with its first tag in the board's order, named as the board writes it; untagged last", () => {
    const notes = [note("a", { tags: ["ux", "Risk"] }), note("b", { tags: ["risk"] }), note("c"), note("d", { tags: ["api"] })]
    const groups = clusterGroups(notes, "tag", ["Risk", "api", "ux"])
    expect(groups).toEqual([
      { key: "risk", name: "Risk", ids: ["a", "b"] },
      { key: "api", name: "api", ids: ["d"] },
      { key: "", name: "No tag", ids: ["c"] },
    ])
  })

  it("by tag, without the board's order: a note's own first tag, groups by name", () => {
    expect(clusterGroups([note("a", { tags: ["Zeta", "alpha"] }), note("b", { tags: ["alpha"] })], "tag").map((g) => [g.name, g.ids])).toEqual([
      ["alpha", ["b"]],
      ["Zeta", ["a"]],
    ])
  })

  it("by colour: the palette's order and names, a colour it doesn't have last", () => {
    const notes = [note("a", { colour: "blue" }), note("b", { colour: "yellow" }), note("c", { colour: "#123456" }), note("d", { colour: "blue" })]
    expect(clusterGroups(notes, "colour").map((g) => [g.name, g.ids])).toEqual([
      [NOTE_COLOURS.yellow.label, ["b"]],
      [NOTE_COLOURS.blue.label, ["a", "d"]],
      ["Other colours", ["c"]],
    ])
  })

  it("lays each group in its own frame, side by side from the notes' corner, about as wide as tall", () => {
    const boxes = new Map([
      ["a", { x: 500, y: 40, width: 180, height: 180 }],
      ["b", { x: 0, y: 0, width: 180, height: 180 }],
      ["c", { x: 900, y: 0, width: 180, height: 180 }],
      ["d", { x: 0, y: 900, width: 240, height: 240 }],
    ])
    const groups = [
      { key: "risk", name: "Risk", ids: ["a", "b", "c"] },
      { key: "", name: "No tag", ids: ["d"] },
    ]
    const { frames, places } = clusterLayout(groups, boxes, { x: 100, y: 50 })
    expect(frames.map((f) => f.name)).toEqual(["Risk", "No tag"])
    // Three notes: three columns and one row (gridColumns), a frame's pad round them.
    expect(gridColumns(3)).toBe(3)
    expect(frames[0]).toMatchObject({ x: 100, y: 50, width: FRAME_PAD * 2 + 180 * 3 + 24 * 2, height: FRAME_PAD * 2 + 180 })
    expect(frames[1]).toMatchObject({ x: 100 + frames[0].width + CLUSTER_GAP, y: 50, width: FRAME_PAD * 2 + 240, height: FRAME_PAD * 2 + 240 })
    // Reading order inside a frame: b (left), a, then c.
    expect(places.get("b")).toEqual({ x: 100 + FRAME_PAD, y: 50 + FRAME_PAD, frame: 0 })
    expect(places.get("a")).toEqual({ x: 100 + FRAME_PAD + 204, y: 50 + FRAME_PAD, frame: 0 })
    expect(places.get("c")).toEqual({ x: 100 + FRAME_PAD + 408, y: 50 + FRAME_PAD, frame: 0 })
    expect(places.get("d")).toEqual({ x: frames[1].x + FRAME_PAD, y: 50 + FRAME_PAD, frame: 1 })
    // Nothing overlaps: every note sits inside its own frame.
    for (const [id, p] of places) {
      const f = frames[p.frame]
      const b = boxes.get(id)!
      expect(p.x >= f.x && p.y >= f.y && p.x + b.width <= f.x + f.width && p.y + b.height <= f.y + f.height, id).toBe(true)
    }
  })

  it("skips a group whose notes have gone, and keeps the frames' order", () => {
    const { frames, places } = clusterLayout([{ key: "x", name: "Gone", ids: ["zz"] }, { key: "y", name: "Here", ids: ["a"] }], new Map([["a", { x: 0, y: 0, width: 180, height: 180 }]]), { x: 0, y: 0 })
    expect(frames.map((f) => f.name)).toEqual(["Here"])
    expect(places.get("a")?.frame).toBe(0)
  })
})

describe("a tag's key", () => {
  it("matches a tag whatever its case, on a note, in a filter and in a list", () => {
    expect(tagKey("Risk")).toBe(tagKey("risk"))
    expect(hasAnyTag(["Risk", "ux"], tagKeys(["RISK"]))).toBe(true)
    expect(hasAnyTag(["ux"], tagKeys(["risk"]))).toBe(false)
    expect(hasAnyTag(["ux"], tagKeys([]))).toBe(false)
    expect(withoutTag(["Risk", "ux"], "risk")).toEqual(["ux"])
  })
})

// miro-07c: a note keeps its size while its words shrink to fit it, down to a floor that still reads well.
describe("words that fit their note", () => {
  // A fake measure: the words fit at `upTo` px and smaller. `asked` records each size it was asked about.
  const fitsUpTo = (upTo: number) => {
    const asked: number[] = []
    return { asked, fits: (size: number) => (asked.push(size), size <= upTo) }
  }

  it("keeps the note's own size when the words fit it, asking once", () => {
    const m = fitsUpTo(99)
    expect(fitFontSize({ max: NOTE_FONT_SIZES.m, floor: NOTE_FONT_FLOOR, fits: m.fits })).toBe(18)
    expect(m.asked).toEqual([18])
  })

  it("shrinks to the largest whole size that fits, asking about a few sizes only", () => {
    for (const upTo of [17, 16, 15, 14, 13, 12]) {
      const m = fitsUpTo(upTo)
      expect(fitFontSize({ max: 18, floor: 12, fits: m.fits }), `fits up to ${upTo}`).toBe(upTo)
      expect(m.asked.length, `asked ${m.asked.join(", ")}`).toBeLessThanOrEqual(5)
      expect(Math.max(...m.asked)).toBeLessThanOrEqual(18)
      expect(Math.min(...m.asked)).toBeGreaterThanOrEqual(12)
    }
    expect(fitFontSize({ max: 24, floor: 12, fits: fitsUpTo(19).fits })).toBe(19)
  })

  it("holds the floor when the words don't fit even there (the note then grows, as it always has)", () => {
    expect(fitFontSize({ max: 18, floor: 12, fits: fitsUpTo(9).fits })).toBe(12)
    expect(fitFontSize({ max: 16, floor: 12, fits: () => false })).toBe(12)
  })

  it("has a floor that reads well (the app's smallest words, text-xs) and lies under every note size's own", () => {
    expect(NOTE_FONT_FLOOR).toBe(12)
    for (const size of Object.values(NOTE_FONT_SIZES)) expect(NOTE_FONT_FLOOR).toBeLessThan(size)
  })

  it("never goes above the note's own size, whatever the measure says", () => {
    expect(fitFontSize({ max: 16, floor: 12, fits: () => true })).toBe(16)
  })
})

describe("the size key", () => {
  it("goes to the next size, small to medium to large and round again; a mixed selection goes to medium", () => {
    expect(nextNoteSize("s")).toBe("m")
    expect(nextNoteSize("m")).toBe("l")
    expect(nextNoteSize("l")).toBe("s")
    expect(nextNoteSize(null)).toBe("m")
    for (const s of Object.keys(NOTE_SIZES) as (keyof typeof NOTE_SIZES)[]) expect(NOTE_SIZES[nextNoteSize(s)]).toBeGreaterThan(0)
  })
})

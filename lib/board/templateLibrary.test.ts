import { describe, expect, it } from "vitest"
import { ALL_BOARD_TEMPLATES, boardTemplate } from "./templateLibrary"
import { BOARD_TEMPLATES, TEMPLATE_CATEGORIES, skeletonBounds } from "./templates"
import { NOTE_COLOURS } from "./notes"

// The template library (miro-19): every layout tested as the five are.
describe("the template library", () => {
  it("holds about forty, every one in a kind the picker files, ids unique", () => {
    expect(ALL_BOARD_TEMPLATES.length).toBeGreaterThanOrEqual(40)
    const ids = ALL_BOARD_TEMPLATES.map((t) => t.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const t of ALL_BOARD_TEMPLATES) {
      expect(TEMPLATE_CATEGORIES, t.id).toContain(t.category)
      expect(t.name.length, t.id).toBeGreaterThan(1)
      expect(t.description.length, t.id).toBeGreaterThan(10)
    }
    for (const c of TEMPLATE_CATEGORIES) expect(ALL_BOARD_TEMPLATES.filter((t) => t.category === c).length, c).toBeGreaterThanOrEqual(3)
    expect(ALL_BOARD_TEMPLATES.slice(0, 5)).toEqual(BOARD_TEMPLATES)
    expect(boardTemplate("lean-canvas")?.name).toBe("Lean canvas")
    expect(boardTemplate("nope")).toBeUndefined()
  })

  it("lays every template out with unique ids, and frames that hold what they name", () => {
    for (const t of ALL_BOARD_TEMPLATES) {
      const sk = t.build("p")
      const ids = sk.map((s) => s.id)
      expect(new Set(ids).size, t.id).toBe(ids.length)
      for (const s of sk) {
        if (s.type === "frame") {
          expect(s.children.length, `${t.id} frame ${s.name} is empty`).toBeGreaterThan(0)
          for (const c of s.children) expect(ids, `${t.id} frame ${s.name}`).toContain(c)
        }
        if (s.type === "arrow") {
          for (const end of [s.start?.id, s.end?.id]) if (end) expect(ids, `${t.id} arrow ${s.id}`).toContain(end)
        }
      }
      const b = skeletonBounds(sk)
      expect(Number.isFinite(b.width) && b.width > 0 && b.height > 0, t.id).toBe(true)
    }
  })

  it("never puts one note on another", () => {
    for (const t of ALL_BOARD_TEMPLATES) {
      const r = t.build("p").filter((s) => s.type === "rectangle") as { x: number; y: number; width: number; height: number }[]
      for (let i = 0; i < r.length; i++)
        for (let j = i + 1; j < r.length; j++) {
          const o = r[i].x < r[j].x + r[j].width && r[j].x < r[i].x + r[i].width && r[i].y < r[j].y + r[j].height && r[j].y < r[i].y + r[i].height
          expect(o, `${t.id} notes ${i} and ${j}`).toBe(false)
        }
    }
  })

  it("wraps every note's words to fit it, in the note's own ink, and marks it a note", () => {
    for (const t of ALL_BOARD_TEMPLATES)
      for (const s of t.build("p")) {
        if (s.type !== "rectangle") continue
        for (const l of s.label.text.split("\n")) expect(l.length, `${t.id}: ${l}`).toBeLessThanOrEqual(Math.floor((s.width - 20) / 11))
        expect(s.customData.kind, t.id).toBe("note")
        expect(s.label.strokeColor, t.id).toBe(NOTE_COLOURS[s.customData.colour].ink)
      }
  })

  it("never shares ids between two inserts of a template", () => {
    for (const t of ALL_BOARD_TEMPLATES) {
      const a = new Set(t.build("one").map((s) => s.id))
      expect(t.build("two").filter((s) => a.has(s.id)), t.id).toEqual([])
    }
  })
})

import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { BOARD_TEMPLATES, STICKY_COLOURS, centreAt, skeletonBounds, wrapLabel } from "./templates"
import { selectedNotes } from "./notes"

describe("board templates", () => {
  it("each builds unique ids, and every frame child exists", () => {
    for (const t of BOARD_TEMPLATES) {
      const sk = t.build("p")
      const ids = sk.map((s) => s.id)
      expect(new Set(ids).size, t.id).toBe(ids.length)
      for (const s of sk)
        if (s.type === "frame") {
          // An empty frame has no size; Excalidraw draws it as a stray dot.
          expect(s.children.length, `${t.id} frame ${s.name} is empty`).toBeGreaterThan(0)
          for (const c of s.children) expect(ids, `${t.id} frame ${s.name}`).toContain(c)
        }
    }
  })
  it("two inserts of one template never share ids", () => {
    const a = BOARD_TEMPLATES[0].build("one").map((s) => s.id)
    const b = BOARD_TEMPLATES[0].build("two").map((s) => s.id)
    expect(a.filter((id) => b.includes(id))).toEqual([])
  })
  it("no notes overlap inside a template", () => {
    for (const t of BOARD_TEMPLATES) {
      const r = t.build("p").filter((s) => s.type === "rectangle") as { x: number; y: number; width: number; height: number }[]
      for (let i = 0; i < r.length; i++)
        for (let j = i + 1; j < r.length; j++) {
          const o = r[i].x < r[j].x + r[j].width && r[j].x < r[i].x + r[i].width && r[i].y < r[j].y + r[j].height && r[j].y < r[i].y + r[i].height
          expect(o, `${t.id} notes ${i} and ${j}`).toBe(false)
        }
    }
  })
  it("wraps a note's label to its width, keeping long words whole", () => {
    expect(wrapLabel("What slowed us down?", 14)).toBe("What slowed us\ndown?")
    expect(wrapLabel("Supercalifragilistic word", 10)).toBe("Supercalifragilistic\nword")
    expect(wrapLabel("", 14)).toBe("")
    for (const t of BOARD_TEMPLATES)
      for (const s of t.build("p"))
        if (s.type === "rectangle") for (const l of s.label.text.split("\n")) expect(l.length, `${t.id}: ${l}`).toBeLessThanOrEqual(Math.floor((s.width - 20) / 11))
  })
  it("centres a template on the point asked for", () => {
    const sk = centreAt(BOARD_TEMPLATES[3].build("p"), 1000, -500)
    const b = skeletonBounds(sk)
    expect(b.x + b.width / 2).toBeCloseTo(1000)
    expect(b.y + b.height / 2).toBeCloseTo(-500)
  })
})

describe("selected notes", () => {
  const scene = [
    { id: "r1", type: "rectangle", boundElements: [{ id: "t1", type: "text" }] },
    { id: "t1", type: "text", text: "  Ship the\n release notes ", containerId: "r1" },
    { id: "r2", type: "rectangle", boundElements: [{ id: "t2", type: "text" }], customData: { taskUuid: "task-9" } },
    { id: "t2", type: "text", text: "Rollback drill", containerId: "r2" },
    { id: "r3", type: "rectangle", boundElements: [{ id: "t3", type: "text" }] },
    { id: "t3", type: "text", text: "   ", containerId: "r3" },
    { id: "t4", type: "text", text: "Loose text" },
    { id: "r5", type: "rectangle" },
  ]
  it("reads a note once whether its shape or its text is selected", () => {
    expect(selectedNotes(scene, { r1: true, t1: true })).toEqual([{ noteId: "r1", text: "Ship the release notes", taskUuid: undefined }])
    expect(selectedNotes(scene, { t1: true })[0].noteId).toBe("r1")
  })
  it("keeps the task a note already became, and skips empty notes and bare shapes", () => {
    const n = selectedNotes(scene, { r2: true, r3: true, r5: true, t4: true })
    expect(n.map((x) => [x.noteId, x.taskUuid])).toEqual([["r2", "task-9"], ["t4", undefined]])
  })
  it("ignores deleted elements", () => {
    expect(selectedNotes([{ ...scene[0], isDeleted: true }, scene[1]], { r1: true })).toEqual([])
  })
})

describe("a template's notes", () => {
  const css = readFileSync(join(__dirname, "../../app/globals.css"), "utf8")
  // The light theme's value of a camp token, as the stylesheet defines it.
  const token = (name: string) => css.match(new RegExp(`--${name}:\\s*(#[0-9A-Fa-f]{6})`))?.[1]?.toUpperCase()
  const HUE: Record<string, string> = { yellow: "sun", green: "moss", red: "berry", blue: "sky", purple: "dusk" }

  it("are the camp palette's tint, with the hue's ink for words and a hairline of its strong cut", () => {
    for (const [colour, hue] of Object.entries(HUE)) {
      const c = STICKY_COLOURS[colour as keyof typeof STICKY_COLOURS]
      expect(c.fill.toUpperCase()).toBe(token(`camp-${hue}-tint`))
      expect(c.ink.toUpperCase()).toBe(token(`camp-${hue}-ink`))
      expect(c.edge.toUpperCase()).toBe(token(`camp-${hue}`))
    }
  })

  it("draw their words in the note's ink, on a clean edge", () => {
    const retro = BOARD_TEMPLATES.find((t) => t.id === "retro")!.build("t")
    const note = retro.find((s) => s.type === "rectangle")
    expect(note && note.type === "rectangle" && note.label.strokeColor).toBe(STICKY_COLOURS.green.ink)
    expect(note && note.type === "rectangle" && note.roughness).toBe(0)
  })
})

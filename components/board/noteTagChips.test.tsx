import { afterEach, describe, expect, it } from "vitest"
import { act, cleanup, render } from "@testing-library/react"
import { boardScene, convertForTest, type TestElement } from "@/lib/testing/boardScene"
import { noteSkeleton, type NoteSize } from "@/lib/board/notes"
import { hueFor } from "@/lib/campHue"
import { HUE_CLASS } from "@/components/ui/graphics/hues"
import { NoteTagChips, TAG_CHIPS_MIN_ZOOM } from "./noteTagChips"
import type { TagHues } from "./tagHues"

// Tags on the notes (miro-07 5): chips at a tagged note's foot, in each
// tag's colour, for the notes in view, while the board is near enough.

const note = (id: string, x: number, y: number, tags: string[], size?: NoteSize): TestElement[] => {
  const els = convertForTest([noteSkeleton({ id, x, y, text: `Note ${id}`, size }) as never])
  els[0].customData = { kind: "note", colour: "yellow", tags }
  return els
}
const tagHues: TagHues = { hueOf: (tag) => hueFor(tag, tag === "risk" ? "berry" : null), setHue: () => {} }
const shownOn = (id: string) => [...document.querySelectorAll(`[data-note-tags-of="${id}"] [data-tag]`)].map((c) => c.textContent)
const countOn = (id: string) => document.querySelector(`[data-note-tags-of="${id}"] [data-tag-rest]`)

afterEach(cleanup)

describe("tags on the notes", () => {
  it("shows a tagged note's tags at its foot, each in its tag's colour: those that fit whole, and a count", () => {
    const s = boardScene([...note("a", 100, 100, ["risk", "ux", "api", "q3"]), ...note("b", 400, 100, [])])
    render(<NoteTagChips api={s.api} tagHues={tagHues} />)
    const chips = document.querySelector('[data-note-tags-of="a"]')!
    // A 180px note has room for two of these whole and the count of the rest (this page's font is estimated).
    expect(shownOn("a")).toEqual(["risk", "ux"])
    expect(countOn("a")?.textContent).toBe("+2")
    // The count names the rest in the app's label to a mouse resting on it; a finger passes through to the note.
    expect(countOn("a")?.getAttribute("data-tip")).toBe("api, q3")
    expect(countOn("a")?.className).toContain("pointer-fine:pointer-events-auto")
    expect(chips.querySelector('[data-tag="risk"]')?.hasAttribute("data-tip")).toBe(false)
    const risk = chips.querySelector('[data-tag="risk"]')!
    expect(risk.getAttribute("data-hue")).toBe("berry")
    // Drawn as every tag is: a chip whose colour is its dot.
    expect(risk.querySelector("[data-chip] [data-chip-dot]")?.className).toContain(HUE_CLASS.berry)
    expect(chips.querySelector('[data-tag="ux"] [data-chip-dot]')?.className).toContain(HUE_CLASS[hueFor("ux")])
    // The note's own box on screen, at zoom 1 with no scroll.
    expect((chips as HTMLElement).style.left).toBe("100px")
    expect((chips as HTMLElement).style.width).toBe("180px")
    // A note without tags shows none; the overlay takes no pointer (only what it names does, above), sits under every
    // panel and the cursors (z-2), and a screen reader reads tags from the bar.
    expect(document.querySelector('[data-note-tags-of="b"]')).toBeNull()
    expect(document.querySelector("[data-note-tags]")?.className).toContain("pointer-events-none")
    expect(document.querySelector("[data-note-tags]")?.className).toContain("z-[2]")
    expect(document.querySelector("[data-note-tags]")?.getAttribute("aria-hidden")).toBe("true")
  })

  it("fits more whole chips on a bigger note and fewer on a farther view, never more than three, and cuts a long first tag short", () => {
    const tags = ["risk", "ux", "api", "q3", "web"]
    const near = boardScene([...note("big", 100, 100, tags, "l"), ...note("long", 400, 100, ["Supplier contract before launch", "risk"])])
    const view = render(<NoteTagChips api={near.api} tagHues={tagHues} />)
    expect(shownOn("big")).toEqual(["risk", "ux", "api"])
    expect(countOn("big")?.textContent).toBe("+2")
    // Too long to fit whole: shown all the same (its chip cuts it short), the rest counted, and named whole in the label.
    expect(shownOn("long")).toEqual(["Supplier contract before launch"])
    expect(document.querySelector('[data-note-tags-of="long"] [data-tag]')?.getAttribute("data-tip")).toBe("Supplier contract before launch")
    expect(countOn("long")?.getAttribute("data-tip")).toBe("risk")
    expect(countOn("long")?.textContent).toBe("+1")
    view.unmount()
    // At three-quarter size the big note is 180px across on screen: two whole and the count, as a 180px note at 100%.
    const far = boardScene(note("big", 100, 100, tags, "l"), { zoom: { value: 0.75 } })
    render(<NoteTagChips api={far.api} tagHues={tagHues} />)
    expect(shownOn("big")).toEqual(["risk", "ux"])
    expect(countOn("big")?.textContent).toBe("+3")
  })

  it("leaves out a note outside the view, and every chip while the board is far away", () => {
    const s = boardScene([...note("a", 100, 100, ["risk"]), ...note("far", 5000, 100, ["ux"])])
    const view = render(<NoteTagChips api={s.api} tagHues={tagHues} />)
    expect(document.querySelector('[data-note-tags-of="a"]')).not.toBeNull()
    expect(document.querySelector('[data-note-tags-of="far"]')).toBeNull()
    view.unmount()
    const out = boardScene(note("a", 100, 100, ["risk"]), { zoom: { value: TAG_CHIPS_MIN_ZOOM - 0.1 } })
    render(<NoteTagChips api={out.api} tagHues={tagHues} />)
    expect(document.querySelector("[data-note-tags]")).toBeNull()
  })

  it("turns with a turned note, so its chips stay at its foot", () => {
    const s = boardScene(note("a", 100, 100, ["risk"]))
    s.elements()[0].angle = 0.5
    render(<NoteTagChips api={s.api} tagHues={tagHues} />)
    expect((document.querySelector('[data-note-tags-of="a"]') as HTMLElement).style.transform).toBe("rotate(0.5rad)")
  })

  it("draws nothing, and follows no camera, on a board without tags", () => {
    const s = boardScene(note("a", 100, 100, []))
    render(<NoteTagChips api={s.api} tagHues={tagHues} />)
    expect(document.querySelector("[data-note-tags]")).toBeNull()
  })

  it("fades a note's chips when a filter by tag leaves the note out, and only then", () => {
    const s = boardScene([...note("a", 100, 100, ["risk"]), ...note("b", 400, 100, ["UX"])])
    const view = render(<NoteTagChips api={s.api} tagHues={tagHues} filter={["ux"]} />)
    expect(document.querySelector('[data-note-tags-of="a"]')!.getAttribute("data-faded")).toBe("true")
    expect(document.querySelector('[data-note-tags-of="b"]')!.getAttribute("data-faded")).toBeNull()
    view.rerender(<NoteTagChips api={s.api} tagHues={tagHues} filter={[]} />)
    expect(document.querySelector("[data-faded]")).toBeNull()
  })
})

// Excalidraw moves a note IN PLACE, frame by frame, and keeps its array until the move ends (boardScene's move).
// The chips are the note's face, not chrome: they ride with it on every frame of a drag, and on a nudge (miro-06, DB-43).
describe("tags on a note that moves", () => {
  const partsOf = (s: ReturnType<typeof boardScene>, id: string) => s.elements().filter((e) => e.id === id || e.containerId === id).map((e) => e.id)
  const boxOf = (id: string) => document.querySelector<HTMLElement>(`[data-note-tags-of="${id}"]`)!

  it("ride with their note on every frame of a drag, and after a nudge", () => {
    const s = boardScene([...note("a", 100, 100, ["risk"]), ...note("b", 400, 100, ["ux"])])
    render(<NoteTagChips api={s.api} tagHues={tagHues} />)
    const DRAG = { selectedElementsAreBeingDragged: true }
    for (let i = 1; i <= 3; i++) {
      s.move(partsOf(s, "a"), 40, 10, DRAG)
      expect([boxOf("a").style.left, boxOf("a").style.top]).toEqual([`${100 + 40 * i}px`, `${100 + 10 * i}px`])
    }
    s.drop()
    expect([boxOf("a").style.left, boxOf("a").style.top]).toEqual(["220px", "130px"])
    s.move(partsOf(s, "a"), 0, 5)
    expect(boxOf("a").style.top).toBe("135px")
    // The note left alone stays where it is.
    expect([boxOf("b").style.left, boxOf("b").style.top]).toEqual(["400px", "100px"])
  })

  it("follow a resize and a turn while they happen", () => {
    const s = boardScene(note("a", 100, 100, ["risk"]))
    render(<NoteTagChips api={s.api} tagHues={tagHues} />)
    const a = s.byId("a")!
    a.width = 240
    a.version += 1
    s.move([], 0, 0, { isResizing: true })
    expect(boxOf("a").style.width).toBe("240px")
    a.angle = 0.5
    a.version += 1
    s.move([], 0, 0, { isResizing: false, isRotating: true })
    expect(boxOf("a").style.transform).toBe("rotate(0.5rad)")
  })

  // miro-06's paired A/B: on a board of 4,000 notes, every one tagged, each frame of a drag walked all 2,400 tagged
  // notes to draw the chips of the ten in view. A frame's work is the notes in view and those the drag carries.
  it("read only the notes in view and those the drag carries on each frame of it, however many tagged notes the board has", () => {
    const far = Array.from({ length: 400 }, (_, i) => note(`far${i}`, 3000 + (i % 20) * 200, 2000 + Math.floor(i / 20) * 200, ["ux"])).flat()
    const s = boardScene([...note("a", 100, 100, ["risk"]), ...note("b", 400, 100, ["ux"]), ...far])
    // Every read of a far note's place, counted.
    let reads = 0
    for (const n of s.elements()) {
      if (!n.id.startsWith("far") || n.containerId) continue
      let x = n.x
      Object.defineProperty(n, "x", {
        get() {
          reads += 1
          return x
        },
        set(v: number) {
          x = v
        },
      })
    }
    render(<NoteTagChips api={s.api} tagHues={tagHues} />)
    // The board's listeners have heard its array once, as Excalidraw's have before anyone drags.
    act(() => s.pan())
    expect(document.querySelectorAll("[data-note-tags-of]")).toHaveLength(2)
    reads = 0
    const DRAG = { selectedElementsAreBeingDragged: true }
    for (let i = 1; i <= 5; i++) s.move(partsOf(s, "a"), 40, 10, DRAG)
    expect(boxOf("a").style.left).toBe("300px")
    expect(reads).toBe(0)
  })

  it("ride into view with a drag that carries their note there: a selected note, or a note in a selected frame", () => {
    const frame: TestElement = { id: "f", type: "frame", x: 4900, y: 50, width: 400, height: 700, version: 1, frameId: null }
    const framed = note("c", 5000, 400, ["q3"])
    framed[0].frameId = "f"
    const s = boardScene([frame, ...note("a", 5000, 100, ["risk"]), ...framed, ...note("b", 5600, 100, ["ux"])])
    render(<NoteTagChips api={s.api} tagHues={tagHues} selected={["f", "a"]} />)
    act(() => s.pan())
    expect(document.querySelector("[data-note-tags-of]")).toBeNull()
    // Excalidraw's drag of the frame and the note moves the frame's elements with them, in place.
    s.move(["f", ...partsOf(s, "a"), ...partsOf(s, "c")], -4800, 0, { selectedElementsAreBeingDragged: true })
    expect([boxOf("a").style.left, boxOf("a").style.top]).toEqual(["200px", "100px"])
    expect([boxOf("c").style.left, boxOf("c").style.top]).toEqual(["200px", "400px"])
    s.drop()
    expect(boxOf("c").style.left).toBe("200px")
    // A note the drag leaves behind stays out of view.
    expect(document.querySelector('[data-note-tags-of="b"]')).toBeNull()
  })
})

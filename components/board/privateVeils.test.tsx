import { afterEach, describe, expect, it } from "vitest"
import { act, cleanup, render } from "@testing-library/react"
import { boardScene, convertForTest, type TestElement } from "@/lib/testing/boardScene"
import { NOTE_COLOURS, noteSkeleton, type NoteColourId } from "@/lib/board/notes"
import { BOARD_DARK_FILTER, noteBox, noteFace } from "./noteTagChips"
import { PrivateVeils } from "./privateVeils"

// Private mode's veil (miro-25) on a teammate's held note: the note face down. It covers the whole note, its edge
// too, in the note's own colours and corner, so nothing of the note's words or edge shows round it, and on a dark
// board it takes the canvas's own filter, as the note under it does.

const held = (id: string, colour: NoteColourId = "yellow"): TestElement[] => {
  const els = convertForTest([noteSkeleton({ id, x: 100, y: 100, text: "", colour }) as never])
  els[0].customData = { ...(els[0].customData as object), privateBy: "sam", privateName: "Sam" }
  return els
}
const rgb = (hex: string) => `rgb(${[1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(", ")})`
const veilOf = (id: string) => document.querySelector<HTMLElement>(`[data-private-of="${id}"]`)!
const none = () => false
const px = (v: string) => Number.parseFloat(v)
const at = (zoom: number) => ({ scrollX: 0, scrollY: 0, zoom, width: 1000, height: 800, offsetLeft: 0, offsetTop: 0 })
const turn = (s: ReturnType<typeof boardScene>, theme: string) =>
  act(() => (s.api as unknown as { updateScene(scene: { appState: Record<string, unknown> }): void }).updateScene({ appState: { theme } }))

afterEach(cleanup)

describe("a teammate's held note is the note face down", () => {
  it.each(["yellow", "blue"] as const)("covers the whole %s note, its edge too, in its own fill, edge and corner", (colour) => {
    const s = boardScene(held("a", colour), { zoom: { value: 1.5 } })
    render(<PrivateVeils api={s.api as never} me="ann" running holds={none} />)
    const veil = veilOf("a")
    const note = s.elements()[0] as never
    const box = noteBox(at(1.5), note)
    // Grown past the note's stroke (1 px at this zoom, half of it outside the box) on every side.
    expect(px(veil.style.left)).toBeLessThanOrEqual(box.left - 0.75)
    expect(px(veil.style.top)).toBeLessThanOrEqual(box.top - 0.75)
    expect(px(veil.style.left) + px(veil.style.width)).toBeGreaterThanOrEqual(box.left + box.width + 0.75)
    expect(px(veil.style.top) + px(veil.style.height)).toBeGreaterThanOrEqual(box.top + box.height + 0.75)
    // The note's own face: its fill, its edge, its rounded corner (a 180 note at 1.5x: 32 x 1.5, plus the growth).
    const c = NOTE_COLOURS[colour]
    expect(veil.style.backgroundColor).toBe(rgb(c.fill))
    expect(veil.style.borderColor).toBe(rgb(c.edge))
    expect(px(veil.style.borderRadius)).toBeCloseTo(noteFace(at(1.5), note).radius, 5)
    expect(px(veil.style.borderRadius)).toBeGreaterThan(48)
    // Its words in the note's own ink, and whose it is.
    expect(veil.style.color).toBe(rgb(c.ink))
    expect(veil.getAttribute("aria-label")).toBe("Private · Sam")
    expect(veil.style.filter).toBe("")
  })

  it("takes the canvas's dark filter on a dark board, and leaves it when the board turns light", () => {
    const s = boardScene(held("a"), { theme: "dark" })
    render(<PrivateVeils api={s.api as never} me="ann" running holds={none} />)
    expect(veilOf("a").style.filter).toBe(BOARD_DARK_FILTER)
    turn(s, "light")
    expect(veilOf("a").style.filter).toBe("")
    turn(s, "dark")
    expect(veilOf("a").style.filter).toBe(BOARD_DARK_FILTER)
  })

  // V-488: the author's other tab or device takes the shared copy too, without the words; it says they're theirs
  // and waiting where they were written, not a blank locked note.
  it("veils the author's own note in their other tab or device as theirs, and says when it shows after", () => {
    const s = boardScene(held("a"))
    const view = render(<PrivateVeils api={s.api as never} me="sam" running holds={none} />)
    expect(veilOf("a").getAttribute("aria-label")).toBe("Private · you, in another tab or device")
    expect(veilOf("a").textContent).toBe("Private · you, in another tab or device")
    view.rerender(<PrivateVeils api={s.api as never} me="sam" running={false} holds={none} />)
    expect(veilOf("a").getAttribute("aria-label")).toBe("Shows when your other tab or device opens the board")
  })

  it("draws no veil on a note whose words this tab keeps: its author's own tab", () => {
    const s = boardScene(held("a"))
    render(<PrivateVeils api={s.api as never} me="sam" running holds={(id) => id === "a"} />)
    expect(document.querySelector("[data-private-of]")).toBeNull()
  })
})

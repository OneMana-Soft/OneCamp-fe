import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { boardScene, convertForTest, type TestElement } from "@/lib/testing/boardScene"
import { noteSkeleton } from "@/lib/board/notes"
import { hueFor } from "@/lib/campHue"
import { TagFilterPill, TagVeil } from "./tagFilter"
import TagFilterPanel from "./tagFilterPanel"
import type { TagHues } from "./tagHues"

let mobile = false
vi.mock("@/context/MediaQueryContext", () => ({ useMedia: () => ({ isMobile: mobile, isDesktop: !mobile }) }))

// Filter by tag (miro-07 5): the panel that picks the tags, the pill that says a
// filter is on once the panel is closed, and the veil over the notes left out.

const note = (id: string, x: number, tags: string[]): TestElement[] => {
  const els = convertForTest([noteSkeleton({ id, x, y: 100, text: `Note ${id}` }) as never])
  els[0].customData = { kind: "note", colour: "yellow", tags }
  return els
}
const tagHues: TagHues = { hueOf: (tag) => hueFor(tag, null), setHue: () => {} }
const board = () => boardScene([...note("a", 0, ["Risk"]), ...note("b", 300, ["risk", "ux"]), ...note("c", 600, [])])

function panel(s: ReturnType<typeof boardScene>, tags: string[], o: { editable?: boolean } = {}) {
  const onTags = vi.fn()
  const onClose = vi.fn()
  render(<TagFilterPanel api={s.api} tags={tags} onTags={onTags} tagHues={tagHues} editable={o.editable ?? true} onClose={onClose} />)
  return { onTags, onClose }
}

afterEach(() => {
  cleanup()
  mobile = false
})

describe("filter by tag", () => {
  it("lists the board's tags, one for each whatever its case, with how many notes have it, and a press picks one", () => {
    const { onTags } = panel(board(), [])
    const list = screen.getByRole("list", { name: "Filter by these tags" })
    const risk = list.querySelector("button")!
    expect(risk.textContent).toBe("Risk2")
    expect(risk.getAttribute("title")).toBe("2 notes")
    expect(screen.getByRole("button", { name: "ux" }).getAttribute("title")).toBe("1 note")
    fireEvent.click(screen.getByRole("button", { name: "Risk" }))
    expect(onTags).toHaveBeenLastCalledWith(["Risk"])
    // Nothing picked, nothing to say or select yet.
    expect(screen.queryByRole("status")).toBeNull()
  })

  it("with tags picked, says how many notes stay, takes a tag off, clears, and selects the notes kept", () => {
    const s = board()
    const { onTags } = panel(s, ["ux", "Risk"])
    expect(screen.getByRole("status").textContent).toBe("2 notes")
    expect(screen.getByRole("button", { name: "Risk" }).getAttribute("aria-pressed")).toBe("true")
    fireEvent.click(screen.getByRole("button", { name: "Risk" }))
    expect(onTags).toHaveBeenLastCalledWith(["ux"])
    fireEvent.click(screen.getByRole("button", { name: "Clear" }))
    expect(onTags).toHaveBeenLastCalledWith([])
    fireEvent.click(screen.getByRole("button", { name: "Select these" }))
    expect(s.writes.at(-1)?.appState?.selectedElementIds).toEqual({ a: true, b: true })
  })

  it("lets a viewer filter, but not select: their board has no selection", () => {
    panel(board(), ["ux"], { editable: false })
    expect(screen.getByRole("status").textContent).toBe("1 note")
    expect(screen.queryByRole("button", { name: "Select these" })).toBeNull()
  })

  it("lists every tag on a board with many, so the 41st can be filtered by too (the panel's body scrolls)", () => {
    const many = Array.from({ length: 45 }, (_, i) => `t${i + 1}`)
    const s = boardScene(many.flatMap((t, i) => note(`n${i}`, i * 300, [t])))
    const { onTags } = panel(s, [])
    const list = screen.getByRole("list", { name: "Filter by these tags" })
    expect(within(list).getAllByRole("listitem")).toHaveLength(45)
    fireEvent.click(within(list).getByRole("button", { name: /^t41/ }))
    expect(onTags).toHaveBeenLastCalledWith(["t41"])
  })

  it("says where tags come from on a board with none", () => {
    panel(boardScene([...note("c", 0, [])]), [])
    expect(screen.getByText("No tags on this board yet. Tag notes from the notes bar.")).toBeTruthy()
    expect(screen.queryByRole("list")).toBeNull()
  })

  it("says a filter is on once its panel is closed: the tags and how many notes, to open it again, and Clear", () => {
    const onOpen = vi.fn()
    const onClear = vi.fn()
    render(<TagFilterPill api={board().api} tags={["ux"]} onOpen={onOpen} onClear={onClear} />)
    fireEvent.click(screen.getByRole("button", { name: "Filtered by ux: 1 note. Change the filter" }))
    expect(onOpen).toHaveBeenCalled()
    fireEvent.click(screen.getByRole("button", { name: "Clear the filter" }))
    expect(onClear).toHaveBeenCalled()
  })

  it("keeps two kept notes clear where they overlap: each hole is its own shape in the veil's mask, so they join", () => {
    // Two notes tagged ux, the second over the first's right half. Filled even-odd, the overlap was painted again.
    const s = boardScene([...note("a", 0, ["ux"]), ...note("b", 100, ["ux"]), ...note("c", 600, [])])
    const { container } = render(<TagVeil api={s.api} tags={["ux"]} />)
    const veil = container.querySelector("svg[data-tag-veil]")!
    expect(veil.querySelector("[fill-rule='evenodd']")).toBeNull()
    const mask = veil.querySelector("mask")!
    expect(mask.id).not.toBe("")
    // White shows the veil, black keeps a hole clear: the canvas white, then a black shape for each kept note.
    expect(mask.querySelector('rect[fill="white"]')).not.toBeNull()
    const holes = mask.querySelectorAll('path[fill="black"]')
    expect(holes).toHaveLength(2)
    for (const h of holes) expect(h.getAttribute("d")!.match(/Z/g)).toHaveLength(1)
    expect(veil.querySelector(`rect[mask="url(#${mask.id})"]`)).not.toBeNull()
  })

  it("veils the board with a hole for each note kept, and draws nothing with no filter", () => {
    const s = board()
    const { container, rerender } = render(<TagVeil api={s.api} tags={["ux"]} />)
    const veil = container.querySelector("svg[data-tag-veil]")!
    expect(veil.getAttribute("data-tag-veil")).toBe("1")
    expect(veil.getAttribute("aria-hidden")).toBe("true")
    // The canvas, veiled through a mask with one hole for the kept note.
    const mask = veil.querySelector("mask")!
    expect(mask.querySelectorAll('path[fill="black"]')).toHaveLength(1)
    expect(veil.querySelector(`rect[mask="url(#${mask.id})"]`)).not.toBeNull()
    rerender(<TagVeil api={s.api} tags={[]} />)
    expect(container.querySelector("svg")).toBeNull()
  })
})

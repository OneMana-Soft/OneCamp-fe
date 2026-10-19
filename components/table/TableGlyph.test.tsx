import { afterEach, describe, expect, it } from "vitest"
import { cleanup, render } from "@testing-library/react"
import { hueFor } from "@/lib/campHue"
import { TableGlyph } from "./TableGlyph"

afterEach(cleanup)

describe("a table's icon", () => {
  // A list of tables read as two sets, grey emoji tiles beside hue tiles
  // (the rivals review, 16 Oct 2026): every tile is the table's hue.
  it("is the emoji its owner chose, on the table's own hue tile", () => {
    const { container } = render(<TableGlyph icon="💰" id="t1" />)
    expect(container.textContent).toBe("💰")
    const tile = container.querySelector("[data-table-glyph]") as HTMLElement
    expect(tile.getAttribute("data-table-glyph")).toBe("emoji")
    expect(tile.getAttribute("data-hue")).toBe(hueFor("t1"))
    expect(tile.className).toContain("bg-hue-tint")
    expect(tile.className).not.toContain("bg-sunken")
  })
  it("is otherwise a tint tile in the table's own hue, the same on every screen", () => {
    const id = "8d78abe2-ad66-493c-9fe0-85a27b66a8bc"
    const { container } = render(<TableGlyph id={id} />)
    const tile = container.querySelector("[data-table-glyph]") as HTMLElement
    expect(tile.getAttribute("data-hue")).toBe(hueFor(id))
    expect(tile.className).toContain("bg-hue-tint")
  })
  it("comes at 20, 32 and 36 px", () => {
    for (const [size, cls] of [["sm", "size-5"], ["md", "size-8"], ["lg", "size-9"]] as const) {
      const { container, unmount } = render(<TableGlyph id="t" size={size} />)
      expect((container.querySelector("[data-table-glyph]") as HTMLElement).className).toContain(cls)
      unmount()
    }
  })
})

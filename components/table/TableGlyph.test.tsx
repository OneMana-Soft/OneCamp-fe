import { afterEach, describe, expect, it } from "vitest"
import { cleanup, render } from "@testing-library/react"
import { hueFor } from "@/lib/campHue"
import { TableGlyph } from "./TableGlyph"

afterEach(cleanup)

describe("a table's icon", () => {
  it("is the emoji its owner chose", () => {
    const { container } = render(<TableGlyph icon="💰" id="t1" />)
    expect(container.textContent).toBe("💰")
  })
  it("is otherwise a tile in the table's own hue, the same on every screen", () => {
    const { container } = render(<TableGlyph id="8d78abe2-ad66-493c-9fe0-85a27b66a8bc" />)
    expect(container.querySelector("[data-hue]")?.getAttribute("data-hue")).toBe(hueFor("8d78abe2-ad66-493c-9fe0-85a27b66a8bc"))
  })
})

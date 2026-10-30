import { afterEach, describe, expect, it } from "vitest"
import { cleanup, render } from "@testing-library/react"

import { createRef } from "react"
import { DropLine, placeDropLine } from "@/components/ui/drop-line"

/** The one drop line (INTERACTION_SPEC §5.1): the board's card gaps and the list's rows draw the same element. */

afterEach(cleanup)

describe("the drop line", () => {
  it("sits in its box by its class: a board's gap between two cards", () => {
    const { container } = render(
      <div className="relative">
        <DropLine className="-top-[5px]" />
      </div>,
    )
    const line = container.querySelector<HTMLElement>("[data-drop-line]")!
    expect(line.getAttribute("aria-hidden")).toBe("true")
    expect(line.className).toMatch(/\bpointer-events-none\b/)
    expect(line.className).toMatch(/\babsolute\b/)
    expect(line.className).toContain("-top-[5px]")
  })

  it("lies over the page at a point, for a list whose rows it can't sit in", () => {
    const { container } = render(<DropLine at={{ top: 120, left: 30, width: 400 }} />)
    expect(container.querySelector("[data-drop-line]")).toBeNull()
    const line = document.body.querySelector<HTMLElement>("[data-drop-line]")!
    expect(line.style.position).toBe("fixed")
    // Centred on the gap: the line is 2px tall.
    expect(line.style.top).toBe("119px")
    expect(line.style.left).toBe("30px")
    expect(line.style.width).toBe("400px")
  })

  it("floats hidden until a drag places it, moved without a render", () => {
    const ref = createRef<HTMLSpanElement>()
    render(<DropLine ref={ref} floating />)
    const line = document.body.querySelector<HTMLElement>("[data-drop-line]")!
    expect(line).toBe(ref.current)
    expect(line.style.position).toBe("fixed")
    expect(line.style.display).toBe("none")
    placeDropLine(line, { top: 80, left: 18, width: 500 })
    expect(line.style.display).toBe("")
    expect([line.style.top, line.style.left, line.style.width]).toEqual(["79px", "18px", "500px"])
    placeDropLine(line, null)
    expect(line.style.display).toBe("none")
  })

  it("draws nothing without a place", () => {
    render(<DropLine at={null} />)
    expect(document.body.querySelector("[data-drop-line]")).toBeNull()
  })
})

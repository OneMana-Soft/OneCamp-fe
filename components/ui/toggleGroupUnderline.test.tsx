import { afterEach, describe, expect, it } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"

afterEach(cleanup)

describe("ToggleGroup underline variant", () => {
  it("draws a hairline row and an underlined, unboxed item", () => {
    const { container } = render(
      <ToggleGroup type="single" variant="underline" defaultValue="list" aria-label="View">
        <ToggleGroupItem value="list">List</ToggleGroupItem>
        <ToggleGroupItem value="board">Board</ToggleGroupItem>
      </ToggleGroup>,
    )
    const root = container.firstElementChild as HTMLElement
    expect(root.className).toContain("border-b")
    expect(root.className).toContain("justify-start")
    const on = screen.getByRole("radio", { name: "List" })
    expect(on.getAttribute("data-state")).toBe("on")
    expect(on.className).toContain("border-b-2")
    expect(on.className).toContain("data-[state=on]:border-foreground")
    // The size's fixed height and padding are replaced, not stacked.
    expect(on.className).not.toMatch(/(^|\s)h-9(\s|$)/)
    expect(on.className).toContain("h-auto")
  })

  it("leaves the default variant as it was", () => {
    render(
      <ToggleGroup type="multiple" aria-label="Format">
        <ToggleGroupItem value="b">Bold</ToggleGroupItem>
      </ToggleGroup>,
    )
    const item = screen.getByRole("button", { name: "Bold" })
    expect(item.className).toContain("h-9")
    expect(item.className).not.toContain("border-b-2")
  })
})

import { describe, expect, it } from "vitest"
import { render } from "@testing-library/react"
import { SkeletonCards } from "./skeletonCards"

/**
 * The point of SkeletonCards is that it occupies the same box as the content it
 * stands in for. That only holds if the caller's grid classes are applied
 * verbatim, so that is what these assert — not the visual details of the
 * placeholder, which are free to change.
 */
describe("SkeletonCards", () => {
  it("applies the caller's grid classes verbatim, so the box matches the real content", () => {
    const { container } = render(
      <SkeletonCards gridClassName="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" />,
    )
    const grid = container.firstElementChild as HTMLElement
    expect(grid.className).toBe("grid gap-3 sm:grid-cols-2 lg:grid-cols-3")
  })

  it("draws the requested number of cards", () => {
    const { container } = render(<SkeletonCards cards={6} />)
    expect(container.firstElementChild?.children).toHaveLength(6)
  })

  it("is hidden from screen readers, which hear the caller's status label instead", () => {
    const { container } = render(<SkeletonCards />)
    expect(container.firstElementChild?.getAttribute("aria-hidden")).toBe("true")
  })

  it("adds a meta line only when asked, for cards that carry a badge", () => {
    const withMeta = render(<SkeletonCards cards={1} meta />)
    const without = render(<SkeletonCards cards={1} />)
    const count = (r: ReturnType<typeof render>) =>
      r.container.querySelectorAll("div > div > div").length
    expect(count(withMeta)).toBeGreaterThan(count(without))
  })
})

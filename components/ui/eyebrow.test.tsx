import { beforeEach, describe, expect, it } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"
import { Eyebrow } from "./eyebrow"

/**
 * The point of the component is that 53 hand-written labels stop disagreeing, so
 * the tests are about what it refuses to vary, not about how it looks.
 */
describe("Eyebrow", () => {
  // vitest runs without globals here, so auto-cleanup is never registered.
  beforeEach(cleanup)

  it("renders identically wherever it is used", () => {
    const a = render(<Eyebrow>Sources</Eyebrow>).container.innerHTML
    cleanup()
    const b = render(<Eyebrow>Sources</Eyebrow>).container.innerHTML
    expect(a).toBe(b)
  })

  it("applies exactly one font weight", () => {
    const { container } = render(<Eyebrow>Automation</Eyebrow>)
    const cls = container.firstElementChild?.className || ""
    // 500 since the app scale of 10 Oct 2026: capitals at 600 outshouted the
    // content they label.
    expect(cls).toContain("font-medium")
    // Weight was the axis that drifted worst — semibold, medium and bold across
    // the 53 hand-written sites. There is deliberately no `weight` prop, so the
    // only thing to assert is that exactly one weight lands here.
    const weights = cls.match(/font-(thin|light|normal|medium|semibold|bold|extrabold)/g) || []
    expect(weights).toHaveLength(1)
  })

  it("uses named type tokens at both densities, never an arbitrary pixel size", () => {
    const normal = render(<Eyebrow>A</Eyebrow>).container.firstElementChild?.className || ""
    cleanup()
    const dense = render(<Eyebrow size="sm">A</Eyebrow>).container.firstElementChild?.className || ""
    // Both 12px: the floor for anything that carries content.
    expect(normal).toContain("text-2xs")
    expect(dense).toContain("text-2xs")
    for (const cls of [normal, dense]) {
      expect(cls).not.toMatch(/text-\[\d+px\]/)
    }
  })

  it("can render as a heading, since a section title often is one", () => {
    render(<Eyebrow as="h3">Members</Eyebrow>)
    expect(screen.getByRole("heading", { name: "Members" })).toBeTruthy()
  })

  it("lets a caller add layout without losing the identity classes", () => {
    const { container } = render(<Eyebrow className="mb-2">A</Eyebrow>)
    const cls = container.firstElementChild?.className || ""
    expect(cls).toContain("mb-2")
    expect(cls).toContain("uppercase")
    expect(cls).toContain("tracking-wide")
  })

  it("forwards attributes, so it can carry an id a field is labelled by", () => {
    const { container } = render(<Eyebrow id="team-label">Team</Eyebrow>)
    expect(container.firstElementChild?.getAttribute("id")).toBe("team-label")
  })
})

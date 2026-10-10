import { describe, expect, it } from "vitest"
import { render } from "@testing-library/react"
import { ContinuedGutter } from "./continuedGutter"

describe("ContinuedGutter", () => {
  it("shows a short time on hover and keeps the author and full time for a screen reader", () => {
    const { container } = render(<ContinuedGutter createdAt="2026-10-10T15:04:00" authorName="Maya Chen" />)
    const time = container.querySelector("time")!
    expect(time.textContent).toBe("3:04")
    expect(time.className).toContain("opacity-0")
    expect(time.className).toContain("group-hover:opacity-100")
    expect(time.getAttribute("title")).toMatch(/October 10, 2026/)
    expect(container.querySelector(".sr-only")?.textContent).toMatch(/^Maya Chen, Saturday, October 10, 2026/)
  })
})

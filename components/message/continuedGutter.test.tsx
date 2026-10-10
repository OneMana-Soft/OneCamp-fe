import { describe, expect, it } from "vitest"
import { render } from "@testing-library/react"
import { ContinuedGutter } from "./continuedGutter"

describe("ContinuedGutter", () => {
  it("shows a short time on hover and keeps the author and full time for a screen reader", () => {
    const { container } = render(<ContinuedGutter createdAt="2026-10-10T15:04:00" authorName="Maya Chen" />)
    const time = container.querySelector("time")!
    // With its AM or PM: "3:04" alone could be either.
    expect(time.textContent).toBe("3:04 PM")
    expect(time.className).toContain("opacity-0")
    expect(time.className).toContain("group-hover:opacity-100")
    // One line, ending at the column's edge, so the overflow runs left.
    expect(time.className).toContain("whitespace-nowrap")
    expect(time.parentElement!.className).toContain("justify-end")
    expect(time.getAttribute("title")).toBe("Saturday 10 October 2026, 3:04 PM")
    expect(container.querySelector(".sr-only")?.textContent).toBe("Maya Chen, Saturday 10 October 2026, 3:04 PM")
  })
})

import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { HomeRow } from "@/components/home/HomeRow"

afterEach(cleanup)

/**
 * Home's lists share one row: one line, one height. Recent had a second line
 * for its time and channels one for their description, so rows ran 32 to 52px.
 */
describe("HomeRow", () => {
  it("is a link with its time on the same line when it goes somewhere", () => {
    render(<HomeRow href="/app/doc/d1" label="Q4 launch plan" meta="2h ago" />)
    const link = screen.getByRole("link")
    expect(link.getAttribute("href")).toBe("/app/doc/d1")
    expect(link.className).toContain("h-9")
    expect(link.textContent).toBe("Q4 launch plan2h ago")
  })

  it("is a button when it does something, and says when it is on", () => {
    const onClick = vi.fn()
    render(<HomeRow label="AI assistant" onClick={onClick} active />)
    const button = screen.getByRole("button", { name: "AI assistant" })
    expect(button.getAttribute("aria-pressed")).toBe("true")
    fireEvent.click(button)
    expect(onClick).toHaveBeenCalled()
  })

  it("is 44px tall where it is touched", () => {
    render(<HomeRow touch href="/app/channel/c1" label="engineering" />)
    expect(screen.getByRole("link").className).toContain("h-11")
  })
})

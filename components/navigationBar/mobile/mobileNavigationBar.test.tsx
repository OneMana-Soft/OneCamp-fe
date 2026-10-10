import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"

// The phone shell: top bar, notices, the page, bottom bar. On a first visit the
// shared-demo note (about 100px at 390 wide) sat INSIDE the page's scroller, so
// every full-height page under it (a channel, a DM, a task) was pushed down by
// the note's height: the task's last fields were cut off and its comment box
// started below the screen.

vi.mock("next/navigation", () => ({ usePathname: () => "/app/task/t1" }))
vi.mock("@/hooks/useHydrateUserSidebar", () => ({ useHydrateUserSidebar: () => {} }))
vi.mock("@/components/navigationBar/mobile/mobileTopNavigationBar", () => ({
  MobileTopNavigationBar: () => <div data-testid="top" />,
}))
vi.mock("@/components/navigationBar/mobile/mobileBottomNavigationBar", () => ({
  MobileBottomNavigationBar: () => <nav aria-label="Primary" />,
}))

import { MobileNavigationBar } from "./mobileNavigationBar"

afterEach(() => cleanup())

describe("the phone shell", () => {
  it("puts notices above the page's scroller, so a full-height page fits under them", () => {
    render(
      <MobileNavigationBar banners={<div role="status">This demo is shared.</div>}>
        <div data-testid="page" className="h-full" />
      </MobileNavigationBar>,
    )
    const scroller = screen.getByTestId("page").parentElement as HTMLElement
    const note = screen.getByRole("status")
    expect(scroller.contains(note), "the notice scrolls with the page and pushes it down").toBe(false)
    // The notice comes first, then the scroller takes what is left.
    expect(note.compareDocumentPosition(scroller) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    // A flex child only shrinks below its content with min-h-0; without it the
    // page's h-full column would still overflow the screen.
    expect(scroller.className).toContain("flex-1")
    expect(scroller.className).toContain("min-h-0")
    expect(scroller.className).toContain("overflow-y-auto")
  })

  it("draws no notice row when there is nothing to say", () => {
    const { container } = render(
      <MobileNavigationBar>
        <div data-testid="page" />
      </MobileNavigationBar>,
    )
    expect(container.querySelector("[data-app-banners]")).toBeNull()
  })
})

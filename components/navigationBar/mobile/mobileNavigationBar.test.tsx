import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"

// The phone shell: top bar, notices, the page, bottom bar. On a first visit the
// shared-demo note (about 100px at 390 wide) sat INSIDE the page's scroller, so
// every full-height page under it (a channel, a DM, a task) was pushed down by
// the note's height: the task's last fields were cut off and its comment box
// started below the screen.

let pathname = "/app/task/t1"
vi.mock("next/navigation", () => ({ usePathname: () => pathname, useRouter: () => ({ back: () => {}, replace: () => {} }) }))
vi.mock("@/hooks/useHydrateUserSidebar", () => ({ useHydrateUserSidebar: () => {} }))
vi.mock("@/components/navigationBar/mobile/mobileTopNavigationBar", () => ({
  MobileTopNavigationBar: ({ glow, large }: { glow?: boolean; large?: boolean }) => <div data-testid="top" data-glow={glow || undefined} data-large={large || undefined} />,
}))
vi.mock("@/components/navigationBar/mobile/mobileBottomNavigationBar", () => ({
  MobileBottomNavigationBar: () => <nav aria-label="Primary" />,
}))

import { MobileNavigationBar } from "./mobileNavigationBar"

afterEach(() => {
  cleanup()
  pathname = "/app/task/t1"
})

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

  it("never pans sideways, whatever a page draws", () => {
    // overflow-y-auto alone computes overflow-x to auto as well: a page a few
    // pixels too wide made the whole screen move sideways under the thumb.
    render(
      <MobileNavigationBar>
        <div data-testid="page" />
      </MobileNavigationBar>,
    )
    expect(screen.getByTestId("page").parentElement?.className).toContain("overflow-x-hidden")
  })

  it("draws no notice row when there is nothing to say", () => {
    const { container } = render(
      <MobileNavigationBar>
        <div data-testid="page" />
      </MobileNavigationBar>,
    )
    expect(container.querySelector("[data-app-banners]")).toBeNull()
  })

  // Design v3, mobile C2 and F5.
  it("opens a tab's list on a large title, spoken once by the bar, with the theme's glow", () => {
    pathname = "/app/chat"
    const { container } = render(
      <MobileNavigationBar>
        <div data-testid="page" />
      </MobileNavigationBar>,
    )
    const large = container.querySelector("[data-large-title]") as HTMLElement
    expect(large.textContent).toBe("Direct messages")
    expect(large.getAttribute("aria-hidden")).toBe("true")
    expect(large.className).toContain("text-display")
    expect(screen.getByTestId("top").getAttribute("data-large")).toBe("true")
    expect(screen.getByTestId("top").getAttribute("data-glow")).toBe("true")
    expect(container.querySelector("[data-app-scroller]")?.getAttribute("data-glow")).toBe("true")
  })

  it("gives a pushed page neither a large title nor the glow", () => {
    pathname = "/app/channel/abc"
    const { container } = render(
      <MobileNavigationBar>
        <div data-testid="page" />
      </MobileNavigationBar>,
    )
    expect(container.querySelector("[data-large-title]")).toBeNull()
    expect(container.querySelector("[data-app-scroller]")?.hasAttribute("data-glow")).toBe(false)
    expect(screen.getByTestId("top").hasAttribute("data-glow")).toBe(false)
  })

  it("is the card a large sheet pushes back", () => {
    const { container } = render(
      <MobileNavigationBar>
        <div data-testid="page" />
      </MobileNavigationBar>,
    )
    expect(container.querySelector("[data-app-viewport]")?.hasAttribute("data-vaul-drawer-wrapper")).toBe(true)
  })
})

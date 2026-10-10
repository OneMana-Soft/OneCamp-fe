import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"

// The phone's tab bar. Its tabs were buttons that pushed the route on tap, so
// nothing was fetched until the tap; and on a page that owns the bottom edge
// it slid off screen with its tabs still in the tab order.

let pathname = "/app/home"
vi.mock("next/navigation", () => ({ usePathname: () => pathname }))
const prefetched: string[] = []
vi.mock("next/link", () => ({
  default: ({ href, prefetch, children, ...rest }: { href: string; prefetch?: boolean; children: React.ReactNode }) => {
    if (prefetch) prefetched.push(href)
    return (
      <a href={href} {...rest}>
        {children}
      </a>
    )
  },
}))
vi.mock("react-redux", () => ({
  useSelector: (pick: (s: unknown) => unknown) =>
    pick({ users: { userSidebar: { userChats: [{ dm_unread: 1 }], userChannels: [{ unread_post_count: 3 }], totalUnreadActivityCount: 2 } } }),
}))
vi.mock("@/components/drawers/userProfileDrawer", () => ({ UserProfileDrawer: () => null }))

import { MobileBottomNavigationBar } from "./mobileBottomNavigationBar"

afterEach(() => {
  cleanup()
  prefetched.length = 0
})

describe("the phone's tab bar", () => {
  it("is links, prefetched, with the current place marked", () => {
    pathname = "/app/channel"
    render(<MobileBottomNavigationBar />)
    const channels = screen.getByRole("link", { name: "Channels" })
    expect(channels.getAttribute("href")).toBe("/app/channel")
    expect(channels.getAttribute("aria-current")).toBe("page")
    expect(screen.getByRole("link", { name: "Home" }).getAttribute("aria-current")).toBeNull()
    expect(prefetched).toEqual(expect.arrayContaining(["/app/home", "/app/channel", "/app/chat", "/app/activity"]))
    // More opens a menu, so it stays a button.
    expect(screen.getByRole("button", { name: "Open menu" })).toBeTruthy()
  })

  it("takes its tabs out of reach when a page owns the bottom edge", () => {
    pathname = "/app/channel/abc"
    const { container } = render(<MobileBottomNavigationBar />)
    const nav = container.querySelector("nav") as HTMLElement
    expect(nav.hasAttribute("inert"), "off screen, its tabs still took focus").toBe(true)
    expect(nav.getAttribute("aria-hidden")).toBe("true")
  })

  it("springs the tab you move to, and nothing when a page loads", () => {
    pathname = "/app/home"
    const { rerender, container } = render(<MobileBottomNavigationBar />)
    expect(container.querySelector(".animate-spring"), "a tab bounced on load").toBeNull()
    pathname = "/app/chat"
    rerender(<MobileBottomNavigationBar />)
    const dms = screen.getByRole("link", { name: "Direct messages" })
    expect(dms.querySelector(".animate-spring")).not.toBeNull()
    expect(container.querySelectorAll(".animate-spring")).toHaveLength(1)
  })

  it("labels its tabs at 12px, above the 11px floor kept for counts", () => {
    pathname = "/app/home"
    render(<MobileBottomNavigationBar />)
    const label = screen.getByText("Home")
    expect(label.className.split(/\s+/)).toContain("text-2xs")
    expect(label.className.split(/\s+/)).not.toContain("text-3xs")
  })
})

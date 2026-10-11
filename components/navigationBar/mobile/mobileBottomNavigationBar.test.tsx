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
let dmUnread = 1
vi.mock("react-redux", () => ({
  useSelector: (pick: (s: unknown) => unknown) =>
    pick({ users: { userSidebar: { userChats: [{ dm_unread: dmUnread }], userChannels: [{ unread_post_count: 3 }], totalUnreadActivityCount: 2 } } }),
}))
vi.mock("@/components/drawers/userProfileDrawer", () => ({ UserProfileDrawer: () => null }))

import { MobileBottomNavigationBar, scrollTabToTop } from "./mobileBottomNavigationBar"

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
    expect(prefetched).toEqual(expect.arrayContaining(["/app/home", "/app/channel", "/app/chat", "/app/inbox"]))
    // The current place: its label ink and its glyph in the theme's accent,
    // so a colour theme re-colours it; the rest stay ink-3.
    expect(channels.className.split(/\s+/)).toContain("text-ink")
    expect(channels.querySelector("[data-tab-icon]")?.getAttribute("class")).toMatch(/\btext-brand\b/)
    const home = screen.getByRole("link", { name: "Home" })
    expect(home.className.split(/\s+/)).toContain("text-ink-3")
    expect(home.querySelector("[data-tab-icon]")?.getAttribute("class")).not.toMatch(/\btext-brand\b/)
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

  it("labels its tabs at 11/510, as design v3's tab bar does", () => {
    pathname = "/app/home"
    render(<MobileBottomNavigationBar />)
    const label = screen.getByText("Home")
    expect(label.className.split(/\s+/)).toEqual(expect.arrayContaining(["text-3xs", "font-medium"]))
  })

  it("names its fourth tab Inbox, where notifications live, not Activity", () => {
    pathname = "/app/home"
    render(<MobileBottomNavigationBar />)
    expect(screen.getByRole("link", { name: "Inbox" }).getAttribute("href")).toBe("/app/inbox")
    expect(screen.queryByText("Activity")).toBeNull()
  })

  it("fills the current place's glyph where it has an inside, and strokes it where it hasn't", () => {
    pathname = "/app/inbox"
    render(<MobileBottomNavigationBar />)
    const inbox = screen.getByRole("link", { name: "Inbox" }).querySelector("[data-tab-icon]")
    expect(inbox?.getAttribute("class")).toMatch(/\bfill-brand\b/)
    cleanup()
    pathname = "/app/channel"
    render(<MobileBottomNavigationBar />)
    const hash = screen.getByRole("link", { name: "Channels" }).querySelector("[data-tab-icon]")
    expect(hash?.getAttribute("class")).toMatch(/\btext-brand\b/)
    expect(hash?.getAttribute("class")).not.toMatch(/\bfill-brand\b/)
  })

  it("counts DMs and Inbox, and marks plain channel unread with a dot", () => {
    pathname = "/app/home"
    render(<MobileBottomNavigationBar />)
    expect(screen.getByRole("link", { name: "Direct messages" }).querySelector("[data-tab-badge]")?.textContent).toBe("1")
    expect(screen.getByRole("link", { name: "Inbox" }).querySelector("[data-tab-badge]")?.textContent).toBe("2")
    const channels = screen.getByRole("link", { name: "Channels" })
    expect(channels.querySelector("[data-tab-dot]")).not.toBeNull()
    expect(channels.querySelector("[data-tab-badge]")).toBeNull()
  })

  it("sits on the raised surface with its upward shadow, not the old wash and border", () => {
    pathname = "/app/home"
    const { container } = render(<MobileBottomNavigationBar />)
    const nav = container.querySelector("nav") as HTMLElement
    expect(nav.className).toMatch(/\bphone-tabbar\b/)
    expect(nav.className).not.toMatch(/bg-sidebar|border-t/)
  })

  // Design v3, mobile C1.
  it("takes you back to the top when you tap the tab you are on", () => {
    pathname = "/app/channel"
    const scroller = document.createElement("div")
    scroller.setAttribute("data-app-scroller", "")
    const scrollTo = vi.fn()
    Object.defineProperty(scroller, "scrollTop", { value: 600, configurable: true })
    scroller.scrollTo = scrollTo as unknown as typeof scroller.scrollTo
    document.body.appendChild(scroller)
    render(<MobileBottomNavigationBar />)
    const ev = new MouseEvent("click", { bubbles: true, cancelable: true })
    screen.getByRole("link", { name: "Channels" }).dispatchEvent(ev)
    expect(scrollTo).toHaveBeenCalledWith(expect.objectContaining({ top: 0 }))
    expect(ev.defaultPrevented, "it navigated to where it already was").toBe(true)
    // At the top already: the link does what links do.
    Object.defineProperty(scroller, "scrollTop", { value: 0, configurable: true })
    expect(scrollTabToTop()).toBe(false)
    scroller.remove()
  })

  it("draws each glyph in a 44x28 capsule, with its count on the capsule", () => {
    pathname = "/app/home"
    render(<MobileBottomNavigationBar />)
    const dms = screen.getByRole("link", { name: "Direct messages" })
    const cap = dms.querySelector(".phone-tab-cap") as HTMLElement
    expect(cap.querySelector("[data-tab-icon]")).not.toBeNull()
    expect(cap.querySelector("[data-tab-badge]")?.textContent).toBe("1")
    expect(dms.querySelector(".phone-tab-label")?.textContent).toBe("DMs")
  })

  it("springs a badge in when it appears, never when the page loads", () => {
    pathname = "/app/home"
    dmUnread = 0
    const { rerender } = render(<MobileBottomNavigationBar />)
    expect(screen.getByRole("link", { name: "Direct messages" }).querySelector("[data-tab-badge]")).toBeNull()
    dmUnread = 2
    rerender(<MobileBottomNavigationBar />)
    expect(screen.getByRole("link", { name: "Direct messages" }).querySelector("[data-tab-badge]")?.getAttribute("data-fresh")).toBe("true")
    cleanup()
    render(<MobileBottomNavigationBar />)
    expect(screen.getByRole("link", { name: "Direct messages" }).querySelector("[data-tab-badge]")?.hasAttribute("data-fresh")).toBe(false)
    dmUnread = 1
  })

  it("hides in 240ms and comes back in 300ms on the push curve, not its own timing", () => {
    pathname = "/app/channel/abc"
    const { container } = render(<MobileBottomNavigationBar />)
    const nav = container.querySelector("nav") as HTMLElement
    expect(nav.getAttribute("data-hidden")).toBe("true")
    expect(nav.className).not.toMatch(/duration-200|ease-standard/)
  })
})

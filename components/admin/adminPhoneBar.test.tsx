import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { phoneSettingsTitle } from "@/lib/adminSections"
import { PageFrameHeader } from "@/components/ui/settingsPage"
import { SlidersHorizontal } from "@/lib/icons"

// Admin and settings on a phone (critic, 11 Oct). The page's h1 is for screen
// readers there, so the top bar is the one place a page's name shows. Every
// admin section's bar said "Admin" with the workspace mark in the back slot,
// so a phone never said which section was open and the only way back to the
// list was the browser's gesture; Profile's bar said "Settings". And the
// header kept a 36px empty row above its line where the hidden title sat.

let pathname = "/app/admin"
let tab: string | null = null
const push = vi.fn()
const back = vi.fn()
vi.mock("next/navigation", () => ({
  usePathname: () => pathname,
  useSearchParams: () => new URLSearchParams(tab ? `tab=${tab}` : ""),
  useRouter: () => ({ push, back }),
}))
let depth = 0
vi.mock("@/lib/navigation/back", () => ({ inAppDepth: () => depth }))

import { AdminPhoneLeading, AdminPhoneTitle } from "./AdminPhoneBar"

afterEach(() => {
  cleanup()
  push.mockReset()
  back.mockReset()
})

describe("a phone's top bar on admin and settings", () => {
  it.each([
    ["/app/admin", null, "Admin"],
    ["/app/admin", "invitations", "Invitations"],
    ["/app/admin", "users", "Members"],
    // An old link's alias names the section it lands on.
    ["/app/admin", "slack-import", "Import and export"],
    ["/app/admin/evidence", null, "Evidence pack"],
    ["/app/admin/github/callback", null, "Integrations"],
    ["/app/settings/profile", null, "Profile"],
    ["/app/settings/notifications", null, "Notifications"],
    ["/app/settings", null, "Settings"],
  ])("calls %s?tab=%s %s", (path, t, title) => {
    expect(phoneSettingsTitle(path, t)).toBe(title)
  })

  it("names the open section in the bar", () => {
    pathname = "/app/admin"
    tab = "security"
    render(<AdminPhoneTitle />)
    expect(screen.getByText("Security")).toBeTruthy()
  })

  it("shows the workspace mark on the list and Back in a section", () => {
    pathname = "/app/admin"
    tab = null
    render(<AdminPhoneLeading mark={<span>mark</span>} />)
    expect(screen.getByText("mark")).toBeTruthy()
    cleanup()
    tab = "audit"
    render(<AdminPhoneLeading mark={<span>mark</span>} />)
    expect(screen.queryByText("mark")).toBeNull()
    const button = screen.getByRole("button", { name: "Back" })
    // A thumb's target.
    expect(button.className.split(/\s+/)).toEqual(expect.arrayContaining(["h-11", "w-11"]))
  })

  it("goes back in the app when it can, and to the list when nothing is behind", () => {
    pathname = "/app/admin"
    tab = "audit"
    depth = 0
    render(<AdminPhoneLeading mark={null} />)
    fireEvent.click(screen.getByRole("button", { name: "Back" }))
    expect(push).toHaveBeenCalledWith("/app/admin")
    expect(back).not.toHaveBeenCalled()
    depth = 2
    fireEvent.click(screen.getByRole("button", { name: "Back" }))
    expect(back).toHaveBeenCalledTimes(1)
  })

  it("keeps no empty row above the header's line on a phone, and puts actions after it", () => {
    render(<PageFrameHeader hue="sky" icon={SlidersHorizontal} title="API tokens" description="A token acts as you." actions={<button type="button">New token</button>} />)
    const row = screen.getByRole("heading", { level: 1 }).parentElement as HTMLElement
    const classes = row.className.split(/\s+/)
    // 36px only where the title shows; on a phone the row is as tall as what it holds.
    expect(classes).toContain("sm:min-h-9")
    expect(classes).not.toContain("min-h-9")
    expect(classes).toContain("max-sm:order-2")
    expect(screen.getByText("A token acts as you.").className.split(/\s+/)).toContain("max-sm:order-1")
  })
})

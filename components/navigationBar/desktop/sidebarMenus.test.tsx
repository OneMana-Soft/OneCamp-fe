import { readFileSync } from "node:fs"
import { join } from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"

const push = vi.fn()
const dispatched: { type: string; payload?: unknown }[] = []
const setTheme = vi.fn()
const pause = vi.fn(async () => true)
const start = vi.fn(async () => true)
const end = vi.fn(async () => true)
let focusUntil: Date | null = null
let pausedUntil: Date | null = null

vi.mock("react-redux", () => ({
  useDispatch: () => (a: { type: string }) => dispatched.push(a),
  useSelector: (pick: (s: unknown) => unknown) => pick({ users: { usersStatus: {} } }),
}))
vi.mock("@/context/MediaQueryContext", () => ({ useMedia: () => ({ isMobile: false, isDesktop: true }) }))
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }))
vi.mock("@/hooks/useFetch", () => ({ useFetchOnlyOnce: () => ({ data: { data: { user_uuid: "me", user_name: "Sam Rivera", user_full_name: "Sam Rivera", user_email_id: "visitor@demo.onemana.dev" } } }) }))
vi.mock("@/hooks/useLogout", () => ({ useLogout: () => ({ logout: vi.fn() }) }))
vi.mock("next-themes", () => ({ useTheme: () => ({ theme: "system", setTheme }) }))
vi.mock("@/components/activeTheme/activeTheme", () => ({ useThemeConfig: () => ({ activeTheme: "onecamp", setActiveTheme: vi.fn() }) }))
// freshDates: hand out a new Date on every call, as the hook once did, to
// prove nothing in the foot keys an effect on a Date's identity.
let freshDates = false
const fresh = (d: Date | null) => (d && freshDates ? new Date(d.getTime()) : d)
vi.mock("@/hooks/usePauseNotifications", () => ({ usePauseNotifications: () => ({ pausedUntil: fresh(pausedUntil), focusUntil: fresh(focusUntil), pause, resume: vi.fn() }) }))
vi.mock("@/hooks/useFocusTime", async (orig) => ({
  ...(await orig<typeof import("@/hooks/useFocusTime")>()),
  useFocusTime: () => ({ focusUntil: fresh(focusUntil), focusStart: focusUntil ? new Date(focusUntil.getTime() - 60 * 60_000) : null, start, end, busy: false }),
}))
vi.mock("@/hooks/usePost", () => ({ usePost: () => ({ makeRequest: vi.fn() }) }))
vi.mock("@/hooks/useUserInfoState", () => ({ useUserInfoState: () => ({ status: "online", deviceConnected: 1 }) }))
vi.mock("@/hooks/useUserAvatar", () => ({ useUserAvatar: () => ({ src: undefined }) }))
vi.mock("@/hooks/reactions/useEmojiMartData", () => ({ useEmojiMartData: () => ({ data: undefined }) }))
vi.mock("@/components/notifications/PauseNotificationsDialog", () => ({ PauseNotificationsDialog: () => null, pauseLeftLabel: () => "Paused · 1 h" }))
vi.mock("@/components/shortcuts/ShortcutsDialog", () => ({ openShortcuts: vi.fn() }))
let mayInvite = true
vi.mock("@/hooks/useCapabilities", () => ({ useCapabilities: () => ({ can: (c: string) => c === "invitation.create" && mayInvite }) }))

import { SidebarFoot } from "@/components/navigationBar/desktop/SidebarFoot"
import { SidebarHeader } from "@/components/navigationBar/desktop/SidebarHeader"
import { TooltipProvider } from "@/components/ui/tooltip"

afterEach(() => {
  cleanup()
  push.mockClear()
  dispatched.length = 0
  focusUntil = null
  pausedUntil = null
  freshDates = false
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
})

const open = (name: string) => {
  fireEvent.keyDown(screen.getByRole("button", { name }), { key: "Enter" })
  return screen.getByRole("menu")
}

// S12 and M2: the foot is your face, name and status; the profile menu rises
// from it.
describe("the sidebar's foot", () => {
  it("shows your name, presence and an Active status line", () => {
    render(<TooltipProvider><SidebarFoot /></TooltipProvider>)
    const foot = document.querySelector("[data-sidebar-foot]")!
    expect(foot.textContent).toMatch(/Sam Rivera/)
    expect(foot.textContent).toMatch(/Active/)
    expect(foot.querySelector("[data-presence]")).not.toBeNull()
  })

  it("in focus, wears the ring with its time left, says until when, and End replaces the sliders", () => {
    focusUntil = new Date(Date.now() + 23 * 60_000)
    render(<TooltipProvider><SidebarFoot /></TooltipProvider>)
    // The reader's own clock, as message times are: "9:51 AM", or "09:51".
    const ring = screen.getByRole("img", { name: /^In focus until \d{1,2}:\d\d(\s?[AP]M)?, \d+ % left$/ })
    expect(ring).toBeTruthy()
    expect(document.querySelector("[data-sidebar-foot]")!.textContent).toMatch(/In focus until/)
    fireEvent.click(screen.getByRole("button", { name: /End focus time/ }))
    expect(end).toHaveBeenCalled()
    expect(screen.queryByRole("button", { name: "Open the profile menu" })).toBeNull()
  })

  it("while paused, shows the pause badge and how long is left", () => {
    pausedUntil = new Date(Date.now() + 60 * 60_000)
    render(<TooltipProvider><SidebarFoot /></TooltipProvider>)
    expect(document.querySelector("[data-pause-badge]")).not.toBeNull()
    // Short enough for the column: the time left is the part that survives.
    expect(document.querySelector("[data-sidebar-foot]")!.textContent).toMatch(/Paused · 1 h left/)
  })

  // Opening the profile menu in focus time once ran the foot's clock reset in
  // a loop (a Date in an effect's dependencies is new on every render) until
  // React stopped with error 185 and the whole app showed its crash page.
  it("opens the menu in focus time and while paused without drawing itself in a loop", () => {
    // Every read of the clock moves it on, so a loop never settles; past a
    // budget no honest render needs, the read throws and the test fails at
    // once rather than looping until the worker runs out of memory.
    let t = Date.UTC(2026, 9, 11, 13, 0)
    let reads = 0
    vi.spyOn(Date, "now").mockImplementation(() => {
      if (++reads > 400) throw new Error("the foot keeps drawing itself: its clock was read 400 times")
      return (t += 1)
    })
    freshDates = true
    focusUntil = new Date(t + 38 * 60_000)
    render(<TooltipProvider><SidebarFoot /></TooltipProvider>)
    expect(open("Profile and settings")).toBeTruthy()
    expect(screen.getByRole("menuitem", { name: /End focus time/ })).toBeTruthy()
    cleanup()
    focusUntil = null
    pausedUntil = new Date(t + 60 * 60_000)
    render(<TooltipProvider><SidebarFoot /></TooltipProvider>)
    expect(open("Profile and settings")).toBeTruthy()
  })

  it("opens the profile menu from the row: status, focus, the pause presets, theme and Sign out", () => {
    render(<TooltipProvider><SidebarFoot /></TooltipProvider>)
    const menu = open("Profile and settings")
    expect(menu.textContent).toMatch(/visitor@demo\.onemana\.dev/)
    expect(menu.textContent).toMatch(/Set a status/)
    expect(screen.getByRole("menuitem", { name: /Start focus time/ })).toBeTruthy()
    expect(screen.getByRole("menuitem", { name: /Pause notifications/ })).toBeTruthy()
    expect(screen.getByRole("menuitem", { name: /Sign out/ })).toBeTruthy()
    // Appearance is the hub's control (P2): the mode, then the theme colours.
    fireEvent.click(screen.getByRole("radio", { name: "Dark" }))
    expect(setTheme).toHaveBeenCalledWith("dark")
    expect(screen.getByRole("radio", { name: "System" }).getAttribute("aria-checked")).toBe("true")
    expect(screen.getByRole("radiogroup", { name: "Theme colour" })).toBeTruthy()
  })

  // The hub's account menu contents (P2), mounted in the shell's menu at the
  // integration (11 Oct): the sliding Appearance control with its theme
  // colours, and the pause pill saying how long is left.
  it("holds the hub's Appearance control and, while paused, the pause pill", () => {
    pausedUntil = new Date(Date.now() + 60 * 60_000)
    render(<TooltipProvider><SidebarFoot /></TooltipProvider>)
    const menu = open("Profile and settings")
    const modes = screen.getByRole("radiogroup", { name: "Appearance" })
    expect([...modes.querySelectorAll("[role=radio]")].map((r) => r.textContent)).toEqual(["Light", "Dark", "System"])
    expect(modes.querySelectorAll("[data-appearance-knob]")).toHaveLength(1)
    expect(screen.getByRole("radiogroup", { name: "Theme colour" }).querySelectorAll("[data-theme-swatch]")).toHaveLength(6)
    expect(menu.querySelector("[data-pause-pill]")!.textContent).toBe("1 h left")
  })

  // QA SH-18 (14 Oct 2026): the menu offered 6 accent colours and Settings 11,
  // with no way from one to the other.
  it("goes from the menu's six colours to all of them in Settings", () => {
    render(<TooltipProvider><SidebarFoot /></TooltipProvider>)
    open("Profile and settings")
    fireEvent.click(screen.getByRole("menuitem", { name: "More colours" }))
    expect(push).toHaveBeenCalledWith("/app/settings/profile#profile-appearance")
  })

  // Hub critic: Sign out destroys nothing, so it is ink, not danger; and the
  // pause presets say when each ends.
  it("draws Sign out in ink, and gives each pause preset its end", () => {
    render(<TooltipProvider><SidebarFoot /></TooltipProvider>)
    open("Profile and settings")
    expect(screen.getByRole("menuitem", { name: /Sign out/ }).hasAttribute("data-danger")).toBe(false)
    const src = readFileSync(join(__dirname, "SidebarFoot.tsx"), "utf8")
    expect(src).toMatch(/pausePresets\(new Date\(\)\)\.map\(\(p\) =>[\s\S]{0,260}pauseEndsLine\(p, clockTime\)/)
  })

  it("starts an hour of focus from the menu", async () => {
    render(<TooltipProvider><SidebarFoot /></TooltipProvider>)
    open("Profile and settings")
    await act(async () => {
      fireEvent.click(screen.getByRole("menuitem", { name: /Start focus time/ }))
    })
    expect(start).toHaveBeenCalledWith(60)
  })
})

// S3 and M1: the header's mark, name and ⇅ open the workspace menu; compose
// opens the new-message picker.
describe("the workspace header and menu", () => {
  it("names its buttons for what they do", () => {
    vi.stubEnv("NEXT_PUBLIC_ORG_NAME", "OneCamp Demo")
    render(<TooltipProvider><SidebarHeader isAdmin={false} onCollapse={() => {}} /></TooltipProvider>)
    expect(screen.getByRole("button", { name: "OneCamp Demo workspace menu" })).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "New message" }))
    expect(dispatched[0]).toEqual(expect.objectContaining({ payload: { key: "createChatMessage" } }))
  })

  it("shows Admin and workspace settings to admins only", () => {
    vi.stubEnv("NEXT_PUBLIC_ORG_NAME", "OneCamp Demo")
    render(<TooltipProvider><SidebarHeader isAdmin={false} onCollapse={() => {}} /></TooltipProvider>)
    open("OneCamp Demo workspace menu")
    expect(screen.getByRole("menuitem", { name: /Invite people/ })).toBeTruthy()
    expect(screen.queryByRole("menuitem", { name: /Admin/ })).toBeNull()
    cleanup()
    render(<TooltipProvider><SidebarHeader isAdmin onCollapse={() => {}} /></TooltipProvider>)
    open("OneCamp Demo workspace menu")
    fireEvent.click(screen.getByRole("menuitem", { name: /Admin/ }))
    expect(push).toHaveBeenCalledWith("/app/admin")
  })

  it("returns focus to the header when Esc closes the menu", async () => {
    vi.stubEnv("NEXT_PUBLIC_ORG_NAME", "OneCamp Demo")
    render(<TooltipProvider><SidebarHeader isAdmin={false} onCollapse={() => {}} /></TooltipProvider>)
    screen.getByRole("button", { name: "OneCamp Demo workspace menu" }).focus()
    const menu = open("OneCamp Demo workspace menu")
    fireEvent.keyDown(menu, { key: "Escape" })
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("button", { name: "OneCamp Demo workspace menu" })))
  })

  // Radix put focus back on the trigger however the menu closed, and Chrome
  // drew the 2px ring on the trigger the mouse had just used (the foot wore
  // one after every pick from the profile menu). A key still brings it back.
  it("leaves no ring on its trigger when a pointer picked the item", async () => {
    vi.stubEnv("NEXT_PUBLIC_ORG_NAME", "OneCamp Demo")
    render(<TooltipProvider><SidebarHeader isAdmin={false} onCollapse={() => {}} /></TooltipProvider>)
    const trigger = screen.getByRole("button", { name: "OneCamp Demo workspace menu" })
    trigger.focus()
    open("OneCamp Demo workspace menu")
    const item = screen.getByRole("menuitem", { name: /Invite people/ })
    fireEvent.pointerDown(item)
    fireEvent.click(item)
    await waitFor(() => expect(screen.queryByRole("menu")).toBeNull())
    expect(document.activeElement).not.toBe(trigger)
  })

  // QA SH-02: a member who may not invite was offered it, and refused.
  it("offers Invite people only to someone who may invite", () => {
    vi.stubEnv("NEXT_PUBLIC_ORG_NAME", "OneCamp Demo")
    mayInvite = false
    try {
      render(<TooltipProvider><SidebarHeader isAdmin={false} onCollapse={() => {}} /></TooltipProvider>)
      open("OneCamp Demo workspace menu")
      expect(screen.queryByRole("menuitem", { name: /Invite people/ })).toBeNull()
    } finally {
      mayInvite = true
    }
  })

  // QA SH-22: What's new opened the blog, not the release notes.
  it("takes What's new to the release notes", () => {
    vi.stubEnv("NEXT_PUBLIC_ORG_NAME", "OneCamp Demo")
    vi.stubEnv("NEXT_PUBLIC_PRODUCT_SITE", "https://onemana.dev")
    const opened = vi.spyOn(window, "open").mockImplementation(() => null)
    render(<TooltipProvider><SidebarHeader isAdmin={false} onCollapse={() => {}} /></TooltipProvider>)
    open("OneCamp Demo workspace menu")
    fireEvent.click(screen.getByRole("menuitem", { name: /What's new/ }))
    expect(opened).toHaveBeenCalledWith("https://onemana.dev/changelog", "_blank", "noopener,noreferrer")
    opened.mockRestore()
  })

  it("links out to the product site only where one is configured", () => {
    vi.stubEnv("NEXT_PUBLIC_ORG_NAME", "OneCamp Demo")
    vi.stubEnv("NEXT_PUBLIC_PRODUCT_SITE", "")
    render(<TooltipProvider><SidebarHeader isAdmin={false} onCollapse={() => {}} /></TooltipProvider>)
    open("OneCamp Demo workspace menu")
    expect(screen.queryByRole("menuitem", { name: /Help and docs/ })).toBeNull()
  })

  it("in the rail's peek, offers to keep the sidebar open where collapse sits", () => {
    const pin = vi.fn()
    render(<TooltipProvider><SidebarHeader isAdmin={false} onCollapse={() => {}} onPin={pin} /></TooltipProvider>)
    expect(screen.queryByRole("button", { name: "Collapse sidebar" })).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: "Keep the sidebar open" }))
    expect(pin).toHaveBeenCalled()
  })
})

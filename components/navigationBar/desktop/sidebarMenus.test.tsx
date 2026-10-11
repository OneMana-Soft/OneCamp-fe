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
vi.mock("@/hooks/usePauseNotifications", () => ({ usePauseNotifications: () => ({ pausedUntil, focusUntil, pause, resume: vi.fn() }) }))
vi.mock("@/hooks/useFocusTime", async (orig) => ({
  ...(await orig<typeof import("@/hooks/useFocusTime")>()),
  useFocusTime: () => ({ focusUntil, focusStart: focusUntil ? new Date(focusUntil.getTime() - 60 * 60_000) : null, start, end, busy: false }),
}))
vi.mock("@/hooks/usePost", () => ({ usePost: () => ({ makeRequest: vi.fn() }) }))
vi.mock("@/hooks/useUserInfoState", () => ({ useUserInfoState: () => ({ status: "online", deviceConnected: 1 }) }))
vi.mock("@/hooks/useUserAvatar", () => ({ useUserAvatar: () => ({ src: undefined }) }))
vi.mock("@/hooks/reactions/useEmojiMartData", () => ({ useEmojiMartData: () => ({ data: undefined }) }))
vi.mock("@/components/notifications/PauseNotificationsDialog", () => ({ PauseNotificationsDialog: () => null, pauseLeftLabel: () => "Paused · 1 h" }))
vi.mock("@/components/shortcuts/ShortcutsDialog", () => ({ openShortcuts: vi.fn() }))

import { SidebarFoot } from "@/components/navigationBar/desktop/SidebarFoot"
import { SidebarHeader } from "@/components/navigationBar/desktop/SidebarHeader"
import { TooltipProvider } from "@/components/ui/tooltip"

afterEach(() => {
  cleanup()
  push.mockClear()
  dispatched.length = 0
  focusUntil = null
  pausedUntil = null
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
    const ring = screen.getByRole("img", { name: /^In focus until \d\d:\d\d, \d+ % left$/ })
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
    expect(document.querySelector("[data-sidebar-foot]")!.textContent).toMatch(/Notifications paused · 1 h/)
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

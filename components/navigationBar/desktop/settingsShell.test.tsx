import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { readFileSync } from "node:fs"
import { join } from "node:path"

// Design v3, admin §1.1: on any admin or settings page the settings nav takes
// the sidebar's place. Back to app (and Esc) return to the last place outside
// it; non-admins see only "You"; rows carry no tiles; the current row is the
// raised chip; Search settings finds sections and the cards inside them.

const nav = vi.hoisted(() => ({ pathname: "/app/admin", params: new URLSearchParams("tab=settings"), push: vi.fn() }))
vi.mock("next/navigation", () => ({
  usePathname: () => nav.pathname,
  useSearchParams: () => nav.params,
  useRouter: () => ({ push: nav.push, replace: vi.fn() }),
}))
vi.mock("next/link", () => ({
  default: ({ href, children, prefetch: _p, scroll: _s, ...rest }: { href: string; children: React.ReactNode; prefetch?: boolean; scroll?: boolean }) => (
    <a href={href} {...rest}>{children}</a>
  ),
}))
const caps = vi.hoisted(() => ({ granted: true }))
vi.mock("@/hooks/useCapabilities", () => ({ useCapabilities: () => ({ can: () => caps.granted, isLoading: false }) }))
vi.mock("@/hooks/useClientConfig", () => ({ FEATURE_AI: "ai", FEATURE_CALLS: "calls", useFeatureState: () => "available" }))
vi.mock("@/components/admin/adminPreload", () => ({ preloadAdminSection: vi.fn() }))

const { SettingsNav, SettingsRailItems, rememberAppRoute } = await import("./SettingsNav")
const { TooltipProvider } = await import("@/components/ui/tooltip")
const { MediaQueryProvider } = await import("@/context/MediaQueryContext")
const { inSettingsShell, searchSettings, SETTINGS_PLACES } = await import("@/lib/adminSections")

beforeEach(() => {
  nav.pathname = "/app/admin"
  nav.params = new URLSearchParams("tab=settings")
  nav.push.mockClear()
  caps.granted = true
  sessionStorage.clear()
})
afterEach(cleanup)

describe("the settings shell", () => {
  it("covers every admin and settings route, and nothing else", () => {
    for (const p of ["/app/admin", "/app/admin/evidence", "/app/settings", "/app/settings/notifications", "/app/settings/profile"]) expect(inSettingsShell(p)).toBe(true)
    for (const p of ["/app", "/app/channel/x", "/app/administrators", "/app/settingsx"]) expect(inSettingsShell(p)).toBe(false)
  })

  it("swaps the sidebar's contents for the settings nav on those routes", () => {
    const src = readFileSync(join(process.cwd(), "components/navigationBar/desktop/desktopNavigationBar.tsx"), "utf8")
    expect(src).toMatch(/const settingsShell = inSettingsShell\(pathname\)/)
    expect(src).toMatch(/settingsShell \? \([\s\S]{0,120}<SettingsNav isAdmin=\{isAdmin\} \/>/)
  })

  it("groups every place for an admin, with the current one marked", () => {
    render(<SettingsNav isAdmin />)
    const main = screen.getByRole("navigation", { name: "Settings" })
    for (const g of ["You", "Workspace", "Automation", "Connections", "Records", "System"]) {
      expect(within(main).getByRole("group", { name: g })).toBeTruthy()
    }
    const current = within(main).getByRole("link", { name: "General" })
    expect(current.getAttribute("aria-current")).toBe("page")
    expect(within(main).getByRole("link", { name: "Members" }).getAttribute("aria-current")).toBeNull()
  })

  // Admin critic #16: under 1024 the sidebar starts as the rail, and in
  // settings the rail held the app's places: no way to another section.
  it("folds into the rail as the sections themselves, with Back to app first", () => {
    nav.pathname = "/app/settings/notifications"
    nav.params = new URLSearchParams()
    render(<MediaQueryProvider><TooltipProvider><SettingsRailItems isAdmin={false} /></TooltipProvider></MediaQueryProvider>)
    const links = screen.getAllByRole("link")
    expect(links[0].getAttribute("aria-label")).toBe("Back to app")
    expect(screen.getByRole("link", { name: "Notifications" }).getAttribute("aria-current")).toBe("page")
    expect(screen.queryByRole("link", { name: "Members" })).toBeNull()
    const src = readFileSync(join(process.cwd(), "components/navigationBar/desktop/desktopNavigationBar.tsx"), "utf8")
    expect(src).toMatch(/<SidebarRail\s+body=\{settingsShell \? \([\s\S]{0,120}<SettingsRailItems isAdmin=\{isAdmin\} \/>/)
  })

  // QA SH-21 (14 Oct 2026): Workflows opened by its address without the
  // right to it showed its locked card, and the nav marked nothing current.
  it("keeps the page you opened in the nav, current and locked, when it isn't yours to use", () => {
    caps.granted = false
    nav.pathname = "/app/settings/workflows"
    nav.params = new URLSearchParams()
    render(<SettingsNav isAdmin={false} />)
    const main = screen.getByRole("navigation", { name: "Settings" })
    const row = within(main).getByRole("link", { name: /^Workflows\s*, locked$/ })
    expect(row.getAttribute("aria-current")).toBe("page")
    // Search never offers it, and anywhere else it stays out.
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "workflows" } })
    expect(screen.queryByRole("link", { name: /Workflows/ })).toBeNull()
    cleanup()
    nav.pathname = "/app/settings/notifications"
    render(<SettingsNav isAdmin={false} />)
    expect(within(screen.getByRole("navigation", { name: "Settings" })).queryByRole("link", { name: /Workflows/ })).toBeNull()
  })

  it("shows a member only You", () => {
    nav.pathname = "/app/settings/notifications"
    nav.params = new URLSearchParams()
    render(<SettingsNav isAdmin={false} />)
    const main = screen.getByRole("navigation", { name: "Settings" })
    expect(within(main).getAllByRole("group")).toHaveLength(1)
    expect(within(main).getByRole("group", { name: "You" })).toBeTruthy()
    expect(within(main).queryByRole("link", { name: "Members" })).toBeNull()
    expect(within(main).getByRole("link", { name: "Notifications" }).getAttribute("aria-current")).toBe("page")
  })

  it("draws no tiles in the nav: the selected row is one sliding chip", () => {
    const { container } = render(<SettingsNav isAdmin />)
    expect(container.querySelector("[class*='hue-']")).toBeNull()
    expect(container.querySelectorAll(".snav-chip")).toHaveLength(1)
    const css = readFileSync(join(process.cwd(), "app/styles/admin/core.css"), "utf8")
    const chip = css.slice(css.indexOf(".snav-chip {"), css.indexOf("}", css.indexOf(".snav-chip {")))
    expect(chip).toMatch(/transition:\s*transform 220ms var\(--ease-spring\)/)
    expect(chip).toMatch(/box-shadow:\s*var\(--e-sel\)/)
  })

  it("goes back to the last place outside settings, by its link and by Esc", () => {
    rememberAppRoute("/app/channel/abc")
    render(<SettingsNav isAdmin />)
    expect(screen.getByRole("link", { name: "Back to app" }).getAttribute("href")).toBe("/app/channel/abc")
    fireEvent.keyDown(window, { key: "Escape" })
    expect(nav.push).toHaveBeenCalledWith("/app/channel/abc")
  })

  // Page modes (one press, one thing: lib/keys/escape). Going back uses the
  // press, so a toast showing doesn't close on it as well.
  it("goes back on Esc as one press", () => {
    rememberAppRoute("/app/channel/abc")
    render(<SettingsNav isAdmin />)
    const esc = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true })
    window.dispatchEvent(esc)
    expect(nav.push).toHaveBeenCalledWith("/app/channel/abc")
    expect(esc.defaultPrevented, "the press was used").toBe(true)
  })

  it("leaves Esc to a field that has focus", () => {
    render(<SettingsNav isAdmin />)
    const box = screen.getByRole("searchbox", { name: "Search settings" })
    fireEvent.keyDown(box, { key: "Escape" })
    expect(nav.push).not.toHaveBeenCalled()
  })

  it("searches section names and the cards inside, and Enter opens the first hit", () => {
    render(<SettingsNav isAdmin />)
    const box = screen.getByRole("searchbox", { name: "Search settings" })
    fireEvent.change(box, { target: { value: "quiet" } })
    const results = screen.getByRole("navigation", { name: "Settings search results" })
    expect(within(results).getByText("Quiet hours")).toBeTruthy()
    fireEvent.keyDown(box, { key: "Enter" })
    expect(nav.push).toHaveBeenCalledWith("/app/settings/notifications#notifications-quiet")
  })

  it("lands on a field itself: its row", async () => {
    render(<SettingsNav isAdmin />)
    const box = screen.getByRole("searchbox", { name: "Search settings" })
    fireEvent.change(box, { target: { value: "dnd" } })
    const results = screen.getByRole("navigation", { name: "Settings search results" })
    // The field index comes with the first letter typed.
    const hit = await within(results).findByText("Hold notifications during quiet hours")
    fireEvent.click(hit.closest("button")!)
    expect(nav.push).toHaveBeenCalledWith("/app/settings/notifications#quiet_hours_enabled")
  })

  it("finds a section by a word people use for it", () => {
    const hits = searchSettings("sso", SETTINGS_PLACES)
    expect(hits[0]?.place.key).toBe("integrations")
  })

  it("focuses the search on ⌘ ,", () => {
    render(<SettingsNav isAdmin />)
    fireEvent.keyDown(window, { key: ",", metaKey: true })
    expect(document.activeElement).toBe(screen.getByRole("searchbox", { name: "Search settings" }))
  })
})

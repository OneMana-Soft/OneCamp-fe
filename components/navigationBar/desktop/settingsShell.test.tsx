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
vi.mock("@/hooks/useCapabilities", () => ({ useCapabilities: () => ({ can: () => true, isLoading: false }) }))
vi.mock("@/hooks/useClientConfig", () => ({ FEATURE_AI: "ai", FEATURE_CALLS: "calls", useFeatureState: () => "available" }))
vi.mock("@/components/admin/adminPreload", () => ({ preloadAdminSection: vi.fn() }))

const { SettingsNav, rememberAppRoute } = await import("./SettingsNav")
const { inSettingsShell, searchSettings, SETTINGS_PLACES } = await import("@/lib/adminSections")

beforeEach(() => {
  nav.pathname = "/app/admin"
  nav.params = new URLSearchParams("tab=settings")
  nav.push.mockClear()
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
    for (const g of ["You", "Workspace", "AI and automation", "Connections", "Records", "System"]) {
      expect(within(main).getByRole("group", { name: g })).toBeTruthy()
    }
    const current = within(main).getByRole("link", { name: "General" })
    expect(current.getAttribute("aria-current")).toBe("page")
    expect(within(main).getByRole("link", { name: "Members" }).getAttribute("aria-current")).toBeNull()
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

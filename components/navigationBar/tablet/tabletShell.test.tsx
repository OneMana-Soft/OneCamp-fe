import * as React from "react"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"

let pathname = "/app/home"
vi.mock("next/navigation", () => ({ usePathname: () => pathname, useRouter: () => ({ push: vi.fn() }) }))
vi.mock("next/link", () => ({
  default: React.forwardRef(function MockLink({ href, children, prefetch: _p, scroll: _s, ...rest }: Record<string, any>, ref: React.Ref<HTMLAnchorElement>) {
    return (
      <a ref={ref} href={String(href)} {...rest}>
        {children}
      </a>
    )
  }),
}))
// The menus around the mark and the face are tested with the header and the foot.
vi.mock("@/components/navigationBar/desktop/SidebarHeader", () => ({
  WorkspaceMark: () => <span data-mark="" />,
  WorkspaceMenu: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))
vi.mock("@/components/navigationBar/desktop/SidebarFoot", () => ({
  ProfileMenu: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SelfAvatar: () => <span data-self-avatar="" />,
}))
vi.mock("@/lib/ui/palette", () => ({ openPalette: vi.fn() }))

import { RAIL_PLACES, TabletRail, railMoreLinks, railPlaceOf } from "./TabletRail"
import { TabletListPanel } from "./TabletListPanel"
import { TooltipProvider } from "@/components/ui/tooltip"
import { Bookmark, Calendar, Home, Table as TableIcon } from "@/lib/icons"
import type { DesktopNavType } from "@/types/nav"

const root = join(__dirname, "..", "..", "..")
const CSS = readFileSync(join(root, "app/globals.css"), "utf8")

const PRIMARY: DesktopNavType[] = [
  { title: "Home", label: "", icon: Home, variant: "ghost", path: "/app/home" },
  { title: "Later", label: "", icon: Bookmark, variant: "ghost", path: "/app/later" },
]
const MORE: DesktopNavType[] = [
  { title: "Calendar", label: "", icon: Calendar, variant: "ghost", path: "/app/calendar" },
  { title: "Tables", label: "", icon: TableIcon, variant: "ghost", path: "/app/tables" },
]

function rail(props: Partial<React.ComponentProps<typeof TabletRail>> = {}) {
  return render(
    <TooltipProvider>
      <TabletRail primary={PRIMARY} more={MORE} counts={{ channel: 3, dm: 2, inbox: 5 }} isAdmin={false} {...props} />
    </TooltipProvider>,
  )
}

afterEach(() => {
  cleanup()
  pathname = "/app/home"
})

// Design v3, mobile T2: a tablet rendered the desktop shell, a 56px rail of
// 36x32 icons at 768 and the sidebar's 30px rows at 1024, all under the 44px
// floor. Its rail is the six daily places, labelled, with search and your face.
describe("the tablet's rail", () => {
  it("holds the six daily places in order, then More, Search and your face", () => {
    rail()
    const labels = [...document.querySelectorAll(".tablet-label")].map((l) => l.textContent)
    expect(labels).toEqual(["Home", "Channels", "DMs", "Inbox", "Tasks", "Calendar", "More", "Search"])
    expect(screen.getByRole("button", { name: "Profile and settings" })).toBeTruthy()
    expect(screen.getByRole("button", { name: "Workspace menu" })).toBeTruthy()
    expect(RAIL_PLACES.map((p) => p.title)).toEqual(["Home", "Channels", "DMs", "Inbox", "Tasks", "Calendar"])
  })

  it("marks the current place, and counts what is about you as a badge, the rest as a dot", () => {
    pathname = "/app/inbox"
    rail()
    expect(screen.getByRole("link", { name: /^Inbox/ }).getAttribute("aria-current")).toBe("page")
    expect(screen.getByRole("link", { name: /^Home/ }).hasAttribute("aria-current")).toBe(false)
    expect(screen.getByRole("link", { name: "Inbox, 5 new" }).querySelector(".tablet-badge")?.textContent).toBe("5")
    expect(screen.getByRole("link", { name: "DMs, 2 unread" }).querySelector(".tablet-badge")?.textContent).toBe("2")
    const channels = screen.getByRole("link", { name: "Channels, unread" })
    expect(channels.querySelector(".tablet-dot")).toBeTruthy()
    expect(channels.querySelector(".tablet-badge")).toBeNull()
  })

  it("in a channel, makes Channels the way to the list rather than away from the channel", () => {
    pathname = "/app/channel/c1"
    const onList = vi.fn()
    rail({ onList, listOpen: true })
    const cell = screen.getByRole("button", { name: /Hide the channel list/ })
    expect(cell.getAttribute("aria-expanded")).toBe("true")
    expect(cell.getAttribute("aria-current")).toBe("page")
    fireEvent.click(cell)
    expect(onList).toHaveBeenCalled()
  })

  it("keeps everything else behind More: Later and Projects first, never Calendar twice", () => {
    expect(railMoreLinks(PRIMARY, MORE, "/app/home").map((l) => l.title)).toEqual(["Later", "Projects", "Tables"])
    expect(railMoreLinks(PRIMARY, MORE, "/app/project").find((l) => l.title === "Projects")?.variant).toBe("sidebarActive")
    expect(railPlaceOf("/app/channel/c1?x=1")?.title).toBe("Channels")
    expect(railPlaceOf("/app/project/p1")).toBeNull()
  })

  it("draws every cell at least 44x44, and the current one as the desktop's raised chip", () => {
    const cell = /\.tablet-cell \{[^}]*width: (\d+)px;[^}]*min-height: (\d+)px;/.exec(CSS)!
    expect(Number(cell[1])).toBeGreaterThanOrEqual(44)
    expect(Number(cell[2])).toBeGreaterThanOrEqual(44)
    expect(CSS).toMatch(/\.tablet-cell\[aria-current="page"\] \.tablet-cap \{ background: var\(--raised\); box-shadow: var\(--e-sel\); \}/)
    expect(CSS).toMatch(/\.tablet-rail-mark,\s*\.tablet-rail-self \{\s*width: 44px;\s*height: 44px;/)
  })
})

// Design v3, mobile T3: the rail lists places, not channels; a channel open
// on a tablet had no list of the others beside it.
describe("the tablet's channel list", () => {
  it("as an overlay closes on Esc and on its scrim", () => {
    const onClose = vi.fn()
    render(<TabletListPanel mode="overlay" onClose={onClose}><p>rows</p></TabletListPanel>)
    expect(screen.getByRole("dialog", { name: "Channels" })).toBeTruthy()
    fireEvent.keyDown(window, { key: "Escape" })
    expect(onClose).toHaveBeenCalledTimes(1)
    fireEvent.click(document.querySelector(".shell-scrim")!)
    expect(onClose).toHaveBeenCalledTimes(2)
  })

  it("docked, is a sheet of its own that can be hidden, with no scrim", () => {
    const onClose = vi.fn()
    render(<TabletListPanel mode="docked" onClose={onClose}><p>rows</p></TabletListPanel>)
    expect(document.querySelector(".shell-scrim")).toBeNull()
    expect(document.querySelector('[data-tablet-list="docked"]')?.className).toMatch(/app-sheet/)
    fireEvent.click(screen.getByRole("button", { name: "Hide the channel list" }))
    expect(onClose).toHaveBeenCalled()
  })

  it("marks the current channel as a list does, since a raised white chip vanishes on the sheet", () => {
    expect(CSS).toMatch(/\.tablet-list \.nav-active \{\s*background: color-mix\(in oklab, var\(--brand-muted\) 75%, transparent\);\s*box-shadow: inset 2px 0 0 var\(--brand\);/)
  })
})

// Design v3, mobile T1 and T4: a finger's sizes under a coarse pointer, the
// right panel as a sheet over the page, and split view a pointer's.
describe("the shell under a finger", () => {
  it("raises the shell's targets under a coarse pointer", () => {
    const coarse = CSS.slice(CSS.indexOf("/* T1. TOUCH DENSITY."))
    const block = coarse.slice(coarse.indexOf("@media (pointer: coarse) {"), coarse.indexOf("\n}\n"))
    expect(block).toMatch(/\.shell-row \{ height: 40px; \}/)
    expect(block).toMatch(/\.shell-icon-btn \{ width: 40px; height: 40px; \}/)
    expect(block).toMatch(/\.shell-menu-item \{ height: 44px; \}/)
    expect(block).toMatch(/\.palette-row \{ height: 48px; \}/)
    expect(block).toMatch(/\[data-theme-swatch\]::after \{ content: ""; position: absolute; inset: -10px; \}/)
  })

  it("keeps split view a pointer's: no split button under a finger, no split panes on a tablet", () => {
    expect(CSS).toMatch(/@media \(hover: none\) \{ \.shell-split-btn \{ display: none; \} \}/)
    const layout = readFileSync(join(root, "app/app/LayoutContent.tsx"), "utf8")
    expect(layout).toMatch(/useSplitView\(!isMobile && !tablet\)/)
  })

  it("opens the right panel over the page on a tablet and under 1100px, on a scrim that closes it", () => {
    const layout = readFileSync(join(root, "app/app/LayoutContent.tsx"), "utf8")
    const overlay = layout.slice(layout.indexOf("const panelOverlay = "), layout.indexOf("if (tablet) {"))
    expect(overlay).toMatch(/className="shell-scrim"[^>]*onClick=\{\(\) => dispatch\(closeRightPanel\(\)\)\}/)
    expect(overlay).toMatch(/shell-panel-over/)
    // The tablet draws it over the page, never as a column.
    const tabletBranch = layout.slice(layout.indexOf("if (tablet) {"), layout.indexOf("// Split view: two views share"))
    expect(tabletBranch).toMatch(/\{panelOverlay\}/)
    expect(tabletBranch).not.toMatch(/ResizablePanel/)
    // A narrow window (chat critic: 1024 and 768): the column only when beside.
    expect(layout).toMatch(/const panelOver = usePanelPlacement\(\) === "over"/)
    expect(layout).toMatch(/\{!panelOver && \(<>\s*<Seam\s+label="Resize the panel"/)
    expect(layout).toMatch(/\{panelOver && panelOverlay\}/)
    expect(CSS).toMatch(/\.shell-panel-over \{[^}]*position: fixed;[^}]*width: min\(452px, calc\(100vw - 72px - 24px\)\);/)
  })
})

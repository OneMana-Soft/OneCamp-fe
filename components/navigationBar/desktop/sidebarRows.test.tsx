import { readFileSync } from "node:fs"
import { join } from "node:path"
import * as React from "react"

import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"

// What next/link was asked to do, readable from the anchor.
vi.mock("next/link", () => ({
  default: React.forwardRef(function MockLink(
    { href, prefetch, children, onPointerEnter, onFocus, onTouchStart, ...rest }: Record<string, any>,
    ref: React.Ref<HTMLAnchorElement>,
  ) {
    const { scroll: _scroll, ...anchor } = rest
    return (
      <a ref={ref} href={String(href)} data-prefetch-prop={String(prefetch)} onPointerEnter={onPointerEnter} onFocus={onFocus} onTouchStart={onTouchStart} {...anchor}>
        {children}
      </a>
    )
  }),
}))
vi.mock("react-redux", async (orig) => ({
  ...(await orig<typeof import("react-redux")>()),
  useDispatch: () => vi.fn(),
  useSelector: (pick: (s: unknown) => unknown) => pick({ users: { usersStatus: {} } }),
}))
vi.mock("@/hooks/useBotKinds", () => ({ useBotKindMap: () => ({ agent1: "agent", bot1: "checkin" }), useBotKind: (u?: string) => ({ agent1: "agent", bot1: "checkin" } as Record<string, string>)[u ?? ""] }))
vi.mock("@/hooks/useUserInfoState", () => ({ useUserInfoState: () => undefined }))
vi.mock("@/hooks/useUserAvatar", () => ({ useUserAvatar: () => ({ src: undefined }) }))

import { PrimaryNav, SidebarSection } from "@/components/navigationBar/desktop/desktopSideNavigationBar"
import { TooltipProvider } from "@/components/ui/tooltip"
import { MediaQueryProvider } from "@/context/MediaQueryContext"
import { Home, Inbox, CircleCheck } from "@/lib/icons"
import { projectHue } from "@/lib/projectHue"
import { hueFor } from "@/lib/campHue"
import { HUE_CLASS } from "@/components/ui/graphics/hues"
import type { DesktopChildrenNavType } from "@/types/nav"

afterEach(cleanup)

const root = join(__dirname, "..", "..", "..")
const CSS = readFileSync(join(root, "app/globals.css"), "utf8")

function wrap(node: React.ReactNode) {
  return render(
    <MediaQueryProvider>
      <TooltipProvider>{node}</TooltipProvider>
    </MediaQueryProvider>,
  )
}
const section = (title: string, rows: DesktopChildrenNavType[], extra: Partial<React.ComponentProps<typeof SidebarSection>> = {}) =>
  wrap(<SidebarSection title={title} open setOpen={() => {}} rows={rows} {...extra} />)
const rowOf = (label: string) => screen.getByText(label).closest("a")!

const PROJECT = "6f1f2b0e-8d47-4c0a-9a55-3c2a1e9b7d10"

// Design v3, shell S6: one row for every place. The current place is the
// raised chip (no bar); a channel's unread is bold with no number, a DM's
// count or a mention of you ("@2") the brand badge; muted is never bold
// (D-S3, D-S4).
describe("a sidebar row's states", () => {
  it("marks the current place as the raised chip, with no bar", () => {
    section("Channels", [{ title: "general", path: "/app/channel/c1", variant: "sidebarActive" }])
    const row = rowOf("general")
    expect(row.className).toMatch(/\bnav-active\b/)
    expect(row.getAttribute("aria-current")).toBe("page")
    expect(CSS).not.toMatch(/\.nav-active::before/)
    const chip = CSS.slice(CSS.indexOf(".nav-active {"), CSS.indexOf("}", CSS.indexOf(".nav-active {")))
    expect(chip).toMatch(/box-shadow:\s*var\(--e-sel\)/)
  })

  it("shows a channel's unread as bold with no number, a mention of you as @n, a DM's as the brand badge", () => {
    section("Channels", [{ title: "design", path: "/app/channel/c2", variant: "ghost", unread_count: 2 }])
    expect(rowOf("design").querySelector(".shell-count")).toBeNull()
    expect(rowOf("design").querySelector(".shell-badge")).toBeNull()
    expect(rowOf("design").getAttribute("data-unread")).toBe("true")
    expect(rowOf("design").textContent).toBe("design, unread")
    cleanup()
    section("Channels", [{ title: "launch", path: "/app/channel/c5", variant: "ghost", unread_count: 6, mentions: 2 }])
    expect(rowOf("launch").querySelector(".shell-badge")?.textContent).toBe("@2")
    expect(rowOf("launch").textContent).toContain(", 2 mentions")
    cleanup()
    section("Direct messages", [{ title: "Jonas Weber", path: "/app/chat/u2", variant: "ghost", unread_count: 1, badge: true, userProfile: { user_uuid: "u2", user_name: "jonas", user_full_name: "Jonas Weber" } as never }])
    expect(rowOf("Jonas Weber").querySelector(".shell-badge")?.textContent).toBe("1")
  })

  it("never draws a muted row bold, and says it is muted, a mention of you still on its badge", () => {
    section("Channels", [{ title: "random", path: "/app/channel/c3", variant: "ghost", unread_count: 4, muted: true }])
    const row = rowOf("random")
    expect(row.getAttribute("data-muted")).toBe("true")
    expect(row.getAttribute("data-unread")).toBeNull()
    expect(row.querySelector(".shell-badge")).toBeNull()
    expect(screen.getByLabelText("Muted")).toBeTruthy()
    cleanup()
    section("Channels", [{ title: "random", path: "/app/channel/c3", variant: "ghost", unread_count: 4, mentions: 1, muted: true }])
    expect(rowOf("random").getAttribute("data-unread")).toBeNull()
    expect(rowOf("random").querySelector(".shell-badge")?.textContent).toBe("@1")
    expect(CSS).toMatch(/\.shell-row\[data-muted="true"\] \{ color: var\(--ink-3\); font-weight: 400; \}/)
  })

  // INTERACTION_SPEC D13: a channel wears its hue, as a 16px tint tile holding
  // its # (a lock for a private one), and its row carries the hue so it tints
  // in it; a starred doc wears its glyph in its hue. Both were grey glyphs.
  it("draws a channel as its tile in its own hue, a private one with a lock, and the row in that hue", () => {
    section("Channels", [
      { title: "engineering", path: "/app/channel/c1", variant: "ghost", kind: "channel", hue_id: "c1" },
      { title: "leads", path: "/app/channel/c4", variant: "ghost", kind: "channel", hue_id: "c4", isPrivate: true },
    ])
    const tile = rowOf("engineering").querySelector<HTMLElement>("[data-channel-tile]")!
    expect(tile.dataset.channelTile).toBe("16")
    expect(tile.dataset.hue).toBe(hueFor("c1"))
    expect(tile.className).toContain(HUE_CLASS[hueFor("c1")])
    expect(rowOf("engineering").getAttribute("data-hue")).toBe(hueFor("c1"))
    expect(rowOf("leads").querySelector("[data-channel-tile] svg")!.getAttribute("class")).toMatch(/lucide-lock/)
    expect(rowOf("leads").getAttribute("data-hue")).toBe(hueFor("c4"))
  })

  it("draws a starred doc as its glyph in its own hue", () => {
    section("Starred", [{ title: "Q4 launch plan", path: "/app/doc/d2", variant: "ghost", kind: "doc", hue_id: "d2" }])
    const glyph = rowOf("Q4 launch plan").querySelector("[data-doc-icon]")!
    expect(glyph.getAttribute("data-hue")).toBe(hueFor("d2"))
    expect(rowOf("Q4 launch plan").getAttribute("data-hue")).toBe(hueFor("d2"))
  })

  // One project tile (12 Oct): the header's glyph tile, 16px, in the project's
  // own hue; the sidebar drew a letter of its own.
  it("draws a project as the one project tile, 16px, its glyph in its own hue, never a raw hex", () => {
    section("Projects", [{ title: "Q4 launch", path: `/app/project/${PROJECT}`, variant: "ghost", project_uuid: PROJECT }])
    const tile = rowOf("Q4 launch").querySelector<HTMLElement>("[data-project-tile]")!
    expect(tile.dataset.projectTile).toBe("16")
    expect(tile.className).toContain(HUE_CLASS[projectHue(PROJECT)])
    expect(tile.querySelector("svg")).not.toBeNull()
    expect(tile.textContent).toBe("")
    expect(tile.style.backgroundImage).toMatch(/var\(--hue-a1\), var\(--hue-a2\)/)
    expect(tile.style.backgroundImage).not.toMatch(/#[0-9a-f]{6}/i)
  })

  it("draws an agent on its square with the Agent tag, and keeps a person's casing", () => {
    section("Direct messages", [
      { title: "Release Captain", path: "/app/chat/agent1", variant: "ghost", userProfile: { user_uuid: "agent1", user_name: "rc", is_bot: true } as never },
      { title: "maya chen", path: "/app/chat/u3", variant: "ghost", userProfile: { user_uuid: "u3", user_name: "maya chen" } as never },
    ])
    expect(rowOf("Release Captain").querySelector("[data-agent-avatar]")).not.toBeNull()
    expect(rowOf("Release Captain").querySelector('[data-principal-tag="ai"]')).not.toBeNull()
    expect(screen.getByText("maya chen").className).not.toMatch(/capitalize/)
  })
})

// S7: sections never render bare, the retired ones are gone, a collapsed one
// shows the badge its rows earn, or a dot (D-S3).
describe("sidebar sections", () => {
  it("shows the invite row instead of an empty header, and nothing for an empty section without one", () => {
    section("Projects", [], { invite: { label: "Start a project", onClick: () => {} } })
    expect(screen.getByText("Start a project")).toBeTruthy()
    cleanup()
    const { container } = section("Starred", [])
    expect(container.querySelector("section")).toBeNull()
  })

  it("shows a collapsed section's unread as a dot, its mentions as @n, its DMs as a badge", () => {
    wrap(<SidebarSection title="Channels" open={false} setOpen={() => {}} rows={[
      { title: "a", path: "/a", variant: "ghost", unread_count: 2 },
      { title: "b", path: "/b", variant: "ghost", unread_count: 3 },
    ]} />)
    expect(document.querySelector(".shell-sect .shell-dot")).toBeTruthy()
    expect(document.querySelector(".shell-sect .shell-count")).toBeNull()
    expect(CSS).toMatch(/\.shell-dot \{[^}]*border-radius: 50%/)
    cleanup()
    wrap(<SidebarSection title="Channels" open={false} setOpen={() => {}} rows={[
      { title: "a", path: "/a", variant: "ghost", unread_count: 2, mentions: 1 },
      { title: "b", path: "/b", variant: "ghost", unread_count: 3, mentions: 2 },
    ]} />)
    expect(document.querySelector(".shell-sect .shell-badge")?.textContent).toBe("@3")
    cleanup()
    wrap(<SidebarSection title="Direct messages" open={false} setOpen={() => {}} rows={[
      { title: "a", path: "/a", variant: "ghost", unread_count: 1, badge: true },
    ]} />)
    expect(document.querySelector(".shell-sect .shell-badge")?.textContent).toBe("1")
  })

  it("folds more than eight projects behind Show more, but never the current one", () => {
    const rows = Array.from({ length: 11 }, (_, i): DesktopChildrenNavType => ({ title: `P${i}`, path: `/app/project/p${i}`, variant: i === 10 ? "sidebarActive" : "ghost", project_uuid: `p${i}` }))
    section("Projects", rows, { cap: 8 })
    // Two are folded: the current one past the cap is already shown.
    expect(screen.getByText("Show 2 more")).toBeTruthy()
    expect(screen.queryByText("P9")).toBeNull()
    expect(screen.getByText("P10")).toBeTruthy()
  })

  // Design review PG1-02 (14 Oct 2026): Starred and an uncapped docs tree
  // pushed Channels and Direct messages off the first screen.
  it("caps Starred at five, as the docs groups are, so chat stays in sight", () => {
    const nav = readFileSync(join(__dirname, "desktopNavigationBar.tsx"), "utf8")
    const starred = nav.match(/<SidebarSection title="Starred"[^>]*\/>/g) ?? []
    expect(starred.length).toBeGreaterThan(0)
    for (const tag of starred) expect(tag).toContain("cap={5}")
  })

  it("lists no Teams, Docs or Boards section, and Starred above Projects", () => {
    const nav = readFileSync(join(__dirname, "desktopNavigationBar.tsx"), "utf8")
    for (const gone of ['title="Teams"', 'title="Docs"', 'title="Boards"', "title: 'teams'", "title: 'Docs'"]) expect(nav).not.toContain(gone)
    expect(nav.indexOf('title="Starred"')).toBeLessThan(nav.indexOf('title="Projects"'))
  })
})

// S5: four rows, then More as a popover holding the rest.
describe("the primary rows", () => {
  const links = [
    { title: "Home", label: "", icon: Home, variant: "sidebarActive" as const, path: "/app/home" },
    { title: "Inbox", label: "3", icon: Inbox, variant: "ghost" as const, path: "/app/inbox" },
    { title: "My tasks", label: "4", icon: CircleCheck, variant: "ghost" as const, path: "/app/myTask" },
  ]
  it("gives Inbox the brand badge and the rest quiet counts", () => {
    wrap(<PrimaryNav links={links} more={[]} />)
    expect(rowOf("Inbox").querySelector(".shell-badge")?.textContent).toBe("3")
    expect(rowOf("My tasks").querySelector(".shell-count")?.textContent).toBe("4")
  })

  // QA F-31: on a page that lives in More, the row said its name in grey on
  // an idle row, which didn't read as where you are.
  it("wears the selected chip on More while one of its pages is open", () => {
    const more = (variant: "ghost" | "sidebarActive") => [{ title: "Recordings", label: "", icon: Home, variant, path: "/app/recordings" }]
    const idle = links.map((l) => ({ ...l, variant: "ghost" as const }))
    const { unmount } = wrap(<PrimaryNav links={idle} more={more("sidebarActive")} />)
    const on = screen.getByRole("button", { name: "More, on Recordings" })
    expect(on.className.split(/\s+/)).toContain("nav-active")
    expect(on.className.split(/\s+/)).not.toContain("nav-idle")
    unmount()
    wrap(<PrimaryNav links={links} more={more("ghost")} />)
    const off = screen.getByRole("button", { name: "More" })
    expect(off.className.split(/\s+/)).toContain("nav-idle")
    expect(off.className.split(/\s+/)).not.toContain("nav-active")
  })

  it("opens More as a popover of places, not an in-place fold", () => {
    wrap(<PrimaryNav links={links} more={[{ title: "Calendar", label: "", icon: Home, variant: "ghost", path: "/app/calendar" }]} />)
    const more = screen.getByRole("button", { name: "More" })
    fireEvent.keyDown(more, { key: "Enter" })
    expect(screen.getByRole("menu")).toBeTruthy()
    expect(screen.getByRole("menuitem", { name: "Calendar" })).toBeTruthy()
  })
})

// Every sidebar link prefetched its route on sight (about 1.75 MB gzip on a
// cold Home). On a desktop a link prefetches on intent; the phone's tab bar
// still prefetches on sight.
describe("sidebar links prefetch on intent", () => {
  it("leaves a route alone until the pointer, the keyboard or a touch reaches its link", () => {
    section("Channels", [{ title: "engineering", path: "/app/channel/c1", variant: "ghost" }])
    const a = rowOf("engineering")
    expect(a.getAttribute("data-prefetch-prop")).toBe("false")
    fireEvent.pointerEnter(a)
    expect(a.getAttribute("data-prefetch-prop")).toBe("true")
  })

  it("never asks next/link to prefetch on sight in the sidebar", () => {
    const side = readFileSync(join(__dirname, "desktopSideNavigationBar.tsx"), "utf8")
    expect(side).not.toMatch(/from "next\/link"/)
    const tabs = readFileSync(join(root, "components/navigationBar/mobile/mobileBottomNavigationBar.tsx"), "utf8")
    expect(tabs).toMatch(/prefetch=\{true\}/)
  })
})

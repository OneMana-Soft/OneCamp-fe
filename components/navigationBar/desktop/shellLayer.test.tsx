import { readFileSync } from "node:fs"
import { join } from "node:path"
import * as React from "react"
import postcss from "postcss"

import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { hueFor } from "@/lib/campHue"

vi.mock("next/link", () => ({
  default: React.forwardRef(function MockLink(
    { href, prefetch, children, ...rest }: Record<string, any>,
    ref: React.Ref<HTMLAnchorElement>,
  ) {
    const { scroll: _scroll, ...anchor } = rest
    return (
      <a ref={ref} href={String(href)} data-prefetch-prop={String(prefetch)} {...anchor}>
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
vi.mock("@/hooks/useBotKinds", () => ({ useBotKindMap: () => ({ agent1: "agent" }), useBotKind: () => undefined }))
vi.mock("@/hooks/useUserInfoState", () => ({ useUserInfoState: () => undefined }))
vi.mock("@/hooks/useUserAvatar", () => ({ useUserAvatar: () => ({ src: undefined }) }))

import { PrimaryNav, SidebarSection } from "@/components/navigationBar/desktop/desktopSideNavigationBar"
import { TooltipProvider } from "@/components/ui/tooltip"
import { MediaQueryProvider } from "@/context/MediaQueryContext"
import { Home, Inbox } from "@/lib/icons"
import { destinationHue } from "@/lib/destinationHue"
import { placeHue } from "@/lib/placeHue"
import type { DesktopChildrenNavType } from "@/types/nav"

/**
 * THE SHELL ON THE INTERACTION LAYER (INTERACTION_SPEC §9.5 step 2, SH-01,
 * SH-05, PG1-02). Every sidebar row is a nav row of the layer, in the hue of
 * the place it opens, where its hover and press were the grey --hover and
 * --press; the section's "+" and toggle are its icon buttons; and a section
 * shows its first few, never hiding the current place or anything unread.
 */

afterEach(cleanup)

const CSS = readFileSync(join(process.cwd(), "app/globals.css"), "utf8")
const wrap = (node: React.ReactNode) => render(<MediaQueryProvider><TooltipProvider>{node}</TooltipProvider></MediaQueryProvider>)
const section = (title: string, rows: DesktopChildrenNavType[], extra: Partial<React.ComponentProps<typeof SidebarSection>> = {}) =>
  wrap(<SidebarSection title={title} open setOpen={() => {}} rows={rows} {...extra} />)
const rowOf = (label: string) => screen.getByText(label).closest("a")!

describe("the sidebar's rows (SH-01)", () => {
  it("are nav rows of the layer, each in the hue of what it opens", () => {
    section("Places", [
      { title: "engineering", path: "/app/channel/c1", variant: "ghost", kind: "channel", hue_id: "c1" },
      { title: "Q4 launch", path: "/app/project/p1", variant: "ghost", project_uuid: "p1" },
      { title: "Maya Chen", path: "/app/chat/u3", variant: "ghost", userProfile: { user_uuid: "u3", user_name: "Maya Chen" } as never },
      { title: "Release Captain", path: "/app/chat/agent1", variant: "ghost", userProfile: { user_uuid: "agent1", user_name: "rc", is_bot: true } as never },
      { title: "Q4 launch plan", path: "/app/doc/d2", variant: "ghost", kind: "doc", hue_id: "d2" },
    ])
    const hues: Record<string, string | undefined> = {
      engineering: placeHue("channel", "c1"),
      "Q4 launch": placeHue("project", "p1"),
      "Maya Chen": placeHue("person", null, { person: "Maya Chen" }),
      "Release Captain": "agent",
      "Q4 launch plan": placeHue("doc", "d2"),
    }
    for (const [label, hue] of Object.entries(hues)) {
      const row = rowOf(label)
      expect(row.getAttribute("data-interactive"), label).toBe("nav")
      expect(row.getAttribute("data-hue"), label).toBe(hue)
    }
  })

  it("puts the primary places on the layer in their own hues, and the current one stays the chip", () => {
    wrap(
      <PrimaryNav
        links={[
          { title: "Home", path: "/app/home", icon: Home, variant: "sidebarActive" },
          { title: "Inbox", path: "/app/inbox", icon: Inbox, variant: "ghost" },
        ]}
        more={[]}
      />,
    )
    const inbox = rowOf("Inbox")
    expect(inbox.getAttribute("data-interactive")).toBe("nav")
    expect(inbox.getAttribute("data-hue")).toBe(destinationHue("/app/inbox"))
    expect(rowOf("Home").className).toContain("nav-active")
    expect(rowOf("Home").getAttribute("aria-current")).toBe("page")
  })

  it("makes the section's + and its toggle icon buttons of the layer (SH-05)", () => {
    section("Projects", [{ title: "Q4 launch", path: "/app/project/p1", variant: "ghost", project_uuid: "p1" }], { onAdd: () => {}, addLabel: "New project", href: "/app/project" })
    expect(screen.getByRole("button", { name: "New project" }).getAttribute("data-interactive")).toBe("icon")
    expect(screen.getByRole("button", { name: "Hide projects" }).getAttribute("data-interactive")).toBe("icon")
  })
})

describe("a starred doc (REVIEW-FE-SHELL db2 F7)", () => {
  it("wears its glyph's colour, as the tree does, not its id's", () => {
    const id = ["d1", "d2", "d3", "d4", "d5"].find((d) => hueFor(d) !== "sun")!
    section("Starred", [{ title: "Plan", path: `/app/doc/${id}`, variant: "ghost", kind: "doc", hue_id: id, doc_icon: "glyph:page:sun" }])
    expect(rowOf("Plan").getAttribute("data-hue")).toBe("sun")
  })
})

describe("a section's cap (PG1-02)", () => {
  const rows = (n: number, extra: (i: number) => Partial<DesktopChildrenNavType> = () => ({})): DesktopChildrenNavType[] =>
    Array.from({ length: n }, (_, i) => ({ title: `channel-${i + 1}`, path: `/app/channel/c${i + 1}`, variant: "ghost", kind: "channel", hue_id: `c${i + 1}`, ...extra(i) }))

  it("shows its first few and the rest behind Show more", () => {
    section("Channels", rows(7), { cap: 5 })
    expect(screen.queryByText("channel-6")).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: "Show 2 more" }))
    expect(screen.getByText("channel-7")).toBeTruthy()
    expect(screen.getByRole("button", { name: "Show fewer" })).toBeTruthy()
  })

  it("never hides the current place or anything unread behind it", () => {
    section("Channels", rows(9, (i) => (i === 6 ? { variant: "sidebarActive" } : i === 8 ? { unread_count: 2 } : i === 7 ? { unread_count: 4, muted: true } : {})), { cap: 5 })
    expect(screen.getByText("channel-7")).toBeTruthy()
    expect(screen.getByText("channel-9")).toBeTruthy()
    // A muted one waits with the rest: muted is never asked for.
    expect(screen.queryByText("channel-8")).toBeNull()
    expect(screen.getByRole("button", { name: "Show 2 more" })).toBeTruthy()
  })

  // A muted channel's mentions of you still wear "@" (lib/nav/sidebarSignal),
  // and a DM's count shows however it is set: a row with a badge asks for you.
  it("never hides a row with a badge: a muted channel that mentions you, a DM's count", () => {
    section("Channels", rows(7, (i) => (i === 5 ? { unread_count: 1, mentions: 1, muted: true } : {})), { cap: 5 })
    expect(screen.getByText("channel-6")).toBeTruthy()
    expect(screen.getByRole("button", { name: "Show 1 more" })).toBeTruthy()
    cleanup()
    section("Direct messages", rows(6, (i) => (i === 5 ? { unread_count: 3, badge: true, muted: true } : {})), { cap: 5 })
    expect(screen.getByText("channel-6")).toBeTruthy()
    expect(screen.queryByRole("button", { name: /^Show \d+ more$/ })).toBeNull()
  })
})

describe("the shell's own CSS leaves states to the layer", () => {
  const rules = (selector: RegExp) => {
    const out: { selector: string; decls: string[] }[] = []
    postcss.parse(CSS).walkRules((r) => {
      if (selector.test(r.selector)) out.push({ selector: r.selector, decls: r.nodes.flatMap((n) => (n.type === "decl" ? [`${n.prop}: ${n.value}`] : [])) })
    })
    return out
  }

  it("draws no grey hover or press fill of its own on a nav row or an icon button", () => {
    const fills = [...rules(/\.nav-idle:hover|\.shell-row:active|\.shell-icon-btn:hover/)].filter((r) => r.decls.some((d) => /^background/.test(d)))
    expect(fills.map((r) => r.selector)).toEqual([])
  })

  it("rings nav rows and icon buttons with the layer's focus, not one of its own", () => {
    const own = rules(/:focus-visible/).filter((r) => /\.shell-row:focus-visible|\.shell-icon-btn:focus-visible/.test(r.selector))
    expect(own.map((r) => r.selector)).toEqual([])
  })
})

import { readFileSync } from "node:fs"
import { join } from "node:path"

import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"

// The phone's top bar is one frame on every tab: the title in the middle of
// the bar, whatever each side holds, and the same 44px "+" wherever a list
// makes another. The title sat 48px left of centre on Home, 6px on Channels,
// on it on DMs and 22px right on Activity, a 70px jump between tabs; Channels,
// Projects and Teams said "New" in the accent where DMs and Docs drew "+".

let pathname = "/app/home"
let isAdmin = false
vi.mock("next/navigation", () => ({ usePathname: () => pathname, useRouter: () => ({ back: vi.fn(), replace: vi.fn(), push: vi.fn() }) }))
vi.mock("react-redux", () => ({ useDispatch: () => vi.fn(), useSelector: () => false }))
vi.mock("@/hooks/useFetch", () => ({
  useFetchOnlyOnce: () => ({ data: { data: { user_uuid: "u1", user_is_admin: isAdmin } } }),
  useFetch: () => ({}),
}))
vi.mock("@/hooks/usePauseNotifications", () => ({ usePauseNotifications: () => ({ pausedUntil: null, focusUntil: null }) }))
vi.mock("@/components/navigationBar/mobile/phoneSelfAvatar", () => ({ PhoneSelfAvatar: () => <span>SR</span> }))
const opened: unknown[] = []
vi.mock("@/lib/ui/palette", () => ({ openPalette: (r?: unknown) => opened.push(r ?? {}) }))

import { MobileTopNavigationBarThird } from "./mobileTopNavigationBarThird"
import { MobileTopNavigationBarFirst } from "./mobileTopNavigationBarFirst"

afterEach(() => {
  cleanup()
  isAdmin = false
})

const here = (p: string) => readFileSync(join(__dirname, p), "utf8")

describe("the phone's top bar frame", () => {
  it("gives its two sides equal columns, so the title sits in the middle of the bar", () => {
    const bar = here("mobileTopNavigationBar.tsx")
    expect(bar).toMatch(/grid-cols-\[1fr_minmax\(0,auto\)_1fr\]/)
    expect(bar).not.toMatch(/grid-cols-\[auto_1fr_auto\]/)
  })

  // A side that could shrink below its buttons gave its room to a long
  // title, which ran over the back button and a doc's Comments at 312px
  // (e2e/docPhoneHeader.spec.ts measures it in a browser).
  it("never lets a side shrink below its buttons; only the title gives way", () => {
    const bar = here("mobileTopNavigationBar.tsx")
    const sides = [...bar.matchAll(/<div data-phone-bar-side="" className='([^']*)'/g)].map((m) => m[1])
    expect(sides).toHaveLength(2)
    for (const cls of sides) expect(cls.split(/\s+/)).not.toContain("min-w-0")
    expect(bar).toMatch(/className='min-w-0 flex items-center justify-center'><MobileTopNavigationBarSecond/)
  })

  it.each([
    ["/app/channel", "New channel"],
    ["/app/chat", "New chat"],
    ["/app/doc", "New doc"],
  ])("makes another from %s with the one 44px +", (path, label) => {
    pathname = path
    render(<MobileTopNavigationBarThird />)
    const make = screen.getByRole("button", { name: label })
    expect(make.className.split(/\s+/)).toEqual(expect.arrayContaining(["h-11", "w-11"]))
    expect(make.textContent).toBe("")
    expect(make.querySelector("svg")).not.toBeNull()
  })

  it("lets an admin make a project or a team the same way, and shows nobody else a stray control", () => {
    for (const [path, label] of [["/app/project", "New project"], ["/app/team", "New team"]]) {
      pathname = path
      isAdmin = true
      render(<MobileTopNavigationBarThird />)
      expect(screen.getByRole("button", { name: label }).className).toMatch(/\bh-11\b/)
      cleanup()
      // A member's list had one project's filter and options, for no project.
      isAdmin = false
      render(<MobileTopNavigationBarThird />)
      expect(screen.queryAllByRole("button")).toHaveLength(0)
      cleanup()
    }
  })

  it("gives Home search and your menu, and no bell (design v3, Ph1)", () => {
    pathname = "/app/home"
    render(<MobileTopNavigationBarThird />)
    expect(screen.getByRole("button", { name: "Your profile" })).toBeTruthy()
    const search = screen.getByRole("button", { name: "Search or ask" })
    expect(search.className.split(/\s+/)).toEqual(expect.arrayContaining(["h-11", "w-11"]))
    fireEvent.click(search)
    expect(opened).toHaveLength(1)
    // Notifications and nudges are the Inbox tab; status is on the avatar.
    expect(screen.queryByText("Nudges")).toBeNull()
    expect(screen.queryByRole("button", { name: "Set your status" })).toBeNull()
    expect(here("mobileTopNavigationBarThird.tsx")).not.toMatch(/NudgeBell|@\/components\/ai\//)
    cleanup()
    for (const path of ["/app/settings/assistants", "/app/search", "/app/tables", "/app/templates", "/app/ai"]) {
      pathname = path
      render(<MobileTopNavigationBarThird />)
      expect(screen.queryByRole("button", { name: "Your profile" }), path).toBeNull()
      expect(screen.queryByRole("button", { name: "Search or ask" }), path).toBeNull()
      cleanup()
    }
  })

  it("starts the Docs and Boards lists with the workspace's mark, as the other top-level places", () => {
    for (const path of ["/app/doc", "/app/board", "/app/tables"]) {
      pathname = path
      render(<MobileTopNavigationBarFirst />)
      expect(screen.getByRole("button", { name: "Open organisation profile" }), path).toBeTruthy()
      cleanup()
    }
    pathname = "/app/doc/d1"
    render(<MobileTopNavigationBarFirst />)
    expect(screen.getByRole("button", { name: "Back" })).toBeTruthy()
  })

  it("sits on the sheet's colour, with a hairline only once the page has scrolled", () => {
    const bar = here("mobileTopNavigationBar.tsx")
    expect(bar).toMatch(/\bbg-sheet\b/)
    expect(bar).not.toMatch(/bg-sidebar|border-b/)
    expect(bar).toMatch(/data-scrolled=\{scrolled \? "true" : "false"\}/)
    // 52px plus the safe area.
    expect(bar).toMatch(/calc\(3\.25rem \+ env\(safe-area-inset-top\)\)/)
    const shell = here("mobileNavigationBar.tsx")
    expect(shell).toMatch(/IntersectionObserver/)
    expect(shell).toMatch(/data-scroll-sentinel/)
    const css = readFileSync(join(__dirname, "../../../app/globals.css"), "utf8")
    expect(css).toMatch(/\.phone-topbar\[data-scrolled="true"\]::after\s*\{\s*opacity: 1;/)
  })

  it("starts a tab's top level with the workspace's gradient mark", () => {
    pathname = "/app/home"
    const { container } = render(<MobileTopNavigationBarFirst />)
    expect(container.querySelector("[data-phone-mark]")).not.toBeNull()
  })

  it("titles the page at 17/22 in the title role", () => {
    expect(here("mobileTopNavigationBarSecond.tsx")).toMatch(/text-title-3 leading-\[22px\]/)
  })

  // C62: one title component for a channel, a DM and a group, centred, with
  // its subtitle; tapping it opens the details. The star moved to the
  // channel's options sheet, and the huddle is a moss circle in a 44px target.
  it("titles every conversation with one component, and no overflow-auto", () => {
    const second = here("mobileTopNavigationBarSecond.tsx")
    for (const kind of ["channel", "dm", "group"]) expect(second).toContain(`<PhoneConversationTitle kind="${kind}"`)
    expect(second).not.toMatch(/MobileTopNavigationBarSecond(Channel|Chat|GroupChat)\b/)
    const title = here("phoneConversationTitle.tsx")
    expect(title).not.toMatch(/overflow-auto/)
    expect(title).toMatch(/text-title-3 leading-\[22px\] font-\[590\]/)
    expect(title).toMatch(/data-conversation-subtitle="" className="[^"]*text-meta[^"]*text-ink-3/)
    expect(title).toMatch(/dispatch\(openChannelDetails\(id\)\)/)
    // 38px drawn, a finger's 44px to tap (QA F-26, app/phone.css F3).
    expect(title).toMatch(/data-conversation-title=""\s+data-touch-target=""/)
  })

  it("leaves a project's ⋯ to the project's header line: one menu, not two side by side", () => {
    expect(here("mobileTopNavigationBarThird.tsx")).not.toMatch(/aria-label='Project options'/)
  })

  it("puts the huddle beside More on a channel and a DM, as a moss circle in a 44px target", () => {
    const third = here("mobileTopNavigationBarThird.tsx")
    expect(third).toContain(`<PhoneHuddleButton kind="channel"`)
    expect(third).toContain(`<PhoneHuddleButton kind="dm"`)
    const title = here("phoneConversationTitle.tsx")
    expect(title).toMatch(/className="grid size-11 place-items-center/)
    expect(title).toMatch(/bg-camp-moss-tint text-camp-moss-ink/)
  })
})

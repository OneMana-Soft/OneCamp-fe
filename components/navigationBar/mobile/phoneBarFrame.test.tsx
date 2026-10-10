import { readFileSync } from "node:fs"
import { join } from "node:path"

import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"

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
vi.mock("@/components/ai/NudgeBell", () => ({ default: () => <button>Nudges</button> }))
vi.mock("@/components/navigationBar/userStatusNav", () => ({ UserStatusNav: () => <button>Set your status</button> }))
vi.mock("@/components/navigationBar/userAvatarNav", () => ({ UserAvatarNav: () => <span>SR</span> }))
vi.mock("@/components/navigationBar/orgAvatarNav", () => ({ OrgAvatarNav: () => <span /> }))

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

  it("keeps the bell, the status and your menu to Home", () => {
    pathname = "/app/home"
    render(<MobileTopNavigationBarThird />)
    expect(screen.getByRole("button", { name: "Open menu" })).toBeTruthy()
    cleanup()
    for (const path of ["/app/settings/assistants", "/app/search", "/app/tables", "/app/templates", "/app/ai"]) {
      pathname = path
      render(<MobileTopNavigationBarThird />)
      expect(screen.queryByRole("button", { name: "Open menu" }), path).toBeNull()
      expect(screen.queryByText("Nudges"), path).toBeNull()
      cleanup()
    }
  })

  it("starts the Docs and Boards lists with the workspace's mark, as the other top-level places", () => {
    for (const path of ["/app/doc", "/app/board", "/app/tables"]) {
      pathname = path
      render(<MobileTopNavigationBarFirst />)
      expect(screen.getByRole("button", { name: "Open organization profile" }), path).toBeTruthy()
      cleanup()
    }
    pathname = "/app/doc/d1"
    render(<MobileTopNavigationBarFirst />)
    expect(screen.getByRole("button", { name: "Back" })).toBeTruthy()
  })

  it("touches a channel's star as 44px while drawing it 28px", () => {
    const channel = here("mobileTopNavigationBarSecondChannel.tsx")
    const star = /aria-label=\{isFavorite[^}]*\}[\s\S]*?className="([^"]+)"/.exec(channel)?.[1] ?? ""
    expect(star).toMatch(/\bh-7 w-7\b/)
    expect(star).toMatch(/after:-inset-2/) // 28 + 8 + 8
  })
})

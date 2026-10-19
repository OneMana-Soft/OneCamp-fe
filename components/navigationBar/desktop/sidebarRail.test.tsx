import * as React from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"

vi.mock("next/link", () => ({
  default: React.forwardRef(function MockLink({ href, children, prefetch: _p, scroll: _s, ...rest }: Record<string, any>, ref: React.Ref<HTMLAnchorElement>) {
    return (
      <a ref={ref} href={String(href)} {...rest}>
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
// The menus around the mark and the face are tested with the header and the
// foot; here they only have to hold their triggers.
vi.mock("@/components/navigationBar/desktop/SidebarHeader", () => ({
  WorkspaceMark: () => <span data-mark="" />,
  WorkspaceMenu: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))
vi.mock("@/components/navigationBar/desktop/SidebarFoot", () => ({
  ProfileMenu: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SelfAvatar: () => <span data-self-avatar="" />,
}))
vi.mock("@/lib/ui/palette", () => ({ openPalette: vi.fn() }))

import { SidebarRail } from "@/components/navigationBar/desktop/SidebarRail"
import { TooltipProvider } from "@/components/ui/tooltip"
import { MediaQueryProvider } from "@/context/MediaQueryContext"
import { Calendar, CircleCheck, FileText, Home, Inbox, Table as TableIcon } from "@/lib/icons"
import type { DesktopNavType } from "@/types/nav"

const PRIMARY: DesktopNavType[] = [
  { title: "Home", label: "", icon: Home, variant: "sidebarActive", path: "/app/home" },
  { title: "Inbox", label: "3", icon: Inbox, variant: "ghost", path: "/app/inbox" },
  { title: "My tasks", label: "", icon: CircleCheck, variant: "ghost", path: "/app/myTask" },
]
const MORE: DesktopNavType[] = [
  { title: "Calendar", label: "", icon: Calendar, variant: "ghost", path: "/app/calendar" },
  { title: "Tables", label: "", icon: TableIcon, variant: "ghost", path: "/app/tables" },
]

function rail() {
  return render(
    <MediaQueryProvider>
      <TooltipProvider>
        <SidebarRail primary={PRIMARY} more={MORE} places={[]} isAdmin={false} onExpand={() => {}} peek={() => <p>the full sidebar</p>} />
      </TooltipProvider>
    </MediaQueryProvider>,
  )
}
const peek = () => screen.queryByRole("dialog", { name: "Sidebar" })
const mouse = { pointerType: "mouse" }

beforeEach(() => vi.useFakeTimers())
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

// As the sidebar orders them (rivals review, 16 Oct 2026): the
// conversations, then the pages that are sections (Docs).
describe("the rail's order", () => {
  it("puts Channels and DMs before Docs", () => {
    render(
      <MediaQueryProvider>
        <TooltipProvider>
          <SidebarRail
            primary={PRIMARY}
            sections={[{ title: "Docs", label: "", icon: FileText, variant: "ghost", path: "/app/doc" }]}
            more={MORE}
            places={[]}
            isAdmin={false}
            onExpand={() => {}}
            peek={() => null}
            conversations={{ channels: { unread: false, spoken: "" }, dms: { unread: false, spoken: "" } }}
          />
        </TooltipProvider>
      </MediaQueryProvider>,
    )
    const names = screen.getAllByRole("link").map((a) => a.getAttribute("href"))
    expect(names.indexOf("/app/channel")).toBeLessThan(names.indexOf("/app/doc"))
    expect(names.indexOf("/app/chat")).toBeLessThan(names.indexOf("/app/doc"))
    expect(names.indexOf("/app/myTask")).toBeLessThan(names.indexOf("/app/channel"))
  })
})

// Design v3, shell S13. The peek was armed by a strip laid over the rail's
// right half, on top of every item: a click on an item's right 40% landed on
// the strip and did nothing, and the peek then covered the rail. Its items
// now take every click, and the peek waits on the rail's own ground.
describe("the rail and its peek", () => {
  it("lays nothing over its items", () => {
    rail()
    const nav = screen.getByRole("navigation", { name: "Main" })
    expect(nav.querySelectorAll("[class*='inset-y-0'], [class*='inset-0']")).toHaveLength(0)
  })

  it("never peeks while the pointer is on an item, and does on the rail's ground after 300ms", () => {
    rail()
    const inbox = screen.getByRole("link", { name: /^Inbox/ })
    fireEvent.pointerMove(inbox, mouse)
    act(() => void vi.advanceTimersByTime(600))
    expect(peek()).toBeNull()
    fireEvent.pointerMove(screen.getByRole("navigation", { name: "Main" }), mouse)
    act(() => void vi.advanceTimersByTime(299))
    expect(peek()).toBeNull()
    act(() => void vi.advanceTimersByTime(2))
    expect(peek()).not.toBeNull()
  })

  it("closes the peek once the pointer has left it, and on Esc", () => {
    rail()
    fireEvent.pointerMove(screen.getByRole("navigation", { name: "Main" }), mouse)
    act(() => void vi.advanceTimersByTime(320))
    fireEvent.pointerLeave(peek()!, mouse)
    act(() => void vi.advanceTimersByTime(400))
    expect(peek()).toBeNull()
    fireEvent.pointerMove(screen.getByRole("navigation", { name: "Main" }), mouse)
    act(() => void vi.advanceTimersByTime(320))
    fireEvent.keyDown(window, { key: "Escape" })
    expect(peek()).toBeNull()
  })

  // Content critic P1. At 600 to 1023 the rail is the default, and its peek
  // opened over the page on every load and stayed until Esc. The cause,
  // measured on the live demo at 768 with the pointer parked at (0,0): as the
  // window-edge strip mounted under the resting pointer, Chrome fired a
  // synthetic pointerover and pointerenter (no move), the strip armed on
  // enter, and with the pointer never moving it never left. The peek arms
  // only on a real move now; mounting, and those synthetic events, do not.
  it("stays closed at 768 when mounted with no pointer input, and through the browser's synthetic enter", () => {
    const width = window.innerWidth
    Object.defineProperty(window, "innerWidth", { value: 768, configurable: true })
    try {
      rail()
      act(() => void vi.advanceTimersByTime(1000))
      expect(peek()).toBeNull()
      // What Chrome sends for a resting pointer when something mounts under it.
      const edge = document.querySelector("[data-peek-edge]")!
      const nav = screen.getByRole("navigation", { name: "Main" })
      for (const el of [edge, nav]) {
        fireEvent.pointerOver(el, mouse)
        fireEvent.pointerEnter(el, mouse)
        fireEvent.mouseOver(el)
      }
      act(() => void vi.advanceTimersByTime(1000))
      expect(peek()).toBeNull()
    } finally {
      Object.defineProperty(window, "innerWidth", { value: width, configurable: true })
    }
  })

  it("opens from the window's edge only for a pointer that moves there, not one resting as the page loads", () => {
    rail()
    const edge = document.querySelector("[data-peek-edge]")!
    fireEvent.pointerEnter(edge, mouse)
    act(() => void vi.advanceTimersByTime(600))
    expect(peek()).toBeNull()
    fireEvent.pointerMove(edge, mouse)
    act(() => void vi.advanceTimersByTime(320))
    expect(peek()).not.toBeNull()
  })

  // Integration review, 12 Oct: opened from the window's edge, the peek slid
  // to its place 8px in, out from under the resting pointer. Chrome then sent
  // the pointer's leave from the peek and its enter on the edge (measured on
  // the integrated build at 768), and the peek closed 340ms after it opened.
  it("stays open for a pointer resting at the window's edge it opened from", () => {
    rail()
    const edge = document.querySelector("[data-peek-edge]")!
    fireEvent.pointerMove(edge, mouse)
    act(() => void vi.advanceTimersByTime(320))
    fireEvent.pointerEnter(peek()!, mouse)
    fireEvent.pointerLeave(peek()!, mouse)
    fireEvent.pointerEnter(edge, mouse)
    act(() => void vi.advanceTimersByTime(1000))
    expect(peek()).not.toBeNull()
    expect(peek()!.getAttribute("data-leaving")).toBeNull()
    // Leaving the edge for the page still closes it.
    fireEvent.pointerLeave(edge, mouse)
    act(() => void vi.advanceTimersByTime(400))
    expect(peek()).toBeNull()
  })

  it("turns a closing peek back when the pointer returns to it, and never leaves it faded out", () => {
    rail()
    fireEvent.pointerMove(screen.getByRole("navigation", { name: "Main" }), mouse)
    act(() => void vi.advanceTimersByTime(320))
    fireEvent.pointerLeave(peek()!, mouse)
    act(() => void vi.advanceTimersByTime(260))
    expect(peek()!.getAttribute("data-leaving")).toBe("true")
    fireEvent.pointerEnter(peek()!, mouse)
    act(() => void vi.advanceTimersByTime(1000))
    expect(peek()).not.toBeNull()
    expect(peek()!.getAttribute("data-leaving")).toBeNull()
  })

  // Admin critic #16: in settings at 768 the rail showed the app's places,
  // and no way to another settings section short of widening the sidebar.
  it("holds what it is given in place of the app's places (the settings sections)", () => {
    render(
      <MediaQueryProvider>
        <TooltipProvider>
          <SidebarRail body={<a href="/app/settings/profile">Your profile</a>} primary={PRIMARY} more={MORE} places={[]} isAdmin={false} onExpand={() => {}} peek={() => null} />
        </TooltipProvider>
      </MediaQueryProvider>,
    )
    expect(screen.getByRole("link", { name: "Your profile" })).toBeTruthy()
    expect(screen.queryByRole("link", { name: /^Inbox/ })).toBeNull()
    expect(screen.queryByRole("button", { name: "More" })).toBeNull()
    expect(screen.getByRole("button", { name: "Expand sidebar" })).toBeTruthy()
  })

  it("holds More, so every page the sidebar reaches is a click away", () => {
    rail()
    const more = screen.getByRole("button", { name: "More" })
    fireEvent.keyDown(more, { key: "Enter" })
    expect(screen.getByRole("menuitem", { name: /Calendar/ })).toBeTruthy()
    expect(screen.getByRole("menuitem", { name: /Tables/ })).toBeTruthy()
  })
})

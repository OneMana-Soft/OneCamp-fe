import { afterEach, beforeAll, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react"

// FLUIDITY-LEAD (calendar-budgets.json, rendersPerNextPeriod): a press of J
// drew about 960 components on the demo, the whole calendar again for each
// week. B1's budget is 100: the new week's own blocks, and what changed with
// the period (its title, the grid), not the toolbar, the panel or the rest.
// Counted as the fluidity harness counts them (scripts/fluidity/lib.mjs):
// every component a commit rendered, as React DevTools walks the tree.

const counts = vi.hoisted(() => {
  const c = { fibers: 0, byName: {} as Record<string, number>, commits: [] as string[][] }
  const COMPONENT = new Set([0, 1, 11, 14, 15])
  const nameOf = (t: any): string =>
    !t ? "?" : typeof t === "string" ? t : t.displayName || t.name || (t.render && (t.render.displayName || t.render.name)) || (t.type && nameOf(t.type)) || "anonymous"
  const walk = (next: any, prev: any) => {
    if (COMPONENT.has(next.tag) && (prev === null || (next.flags & 1) === 1)) {
      c.fibers++
      const n = nameOf(next.type)
      c.byName[n] = (c.byName[n] || 0) + 1
      c.commits[c.commits.length - 1]?.push(n)
    }
    if (prev !== null && next.child === prev.child) return
    for (let child = next.child; child; child = child.sibling) walk(child, prev === null ? null : child.alternate)
  }
  ;(globalThis as any).__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
    renderers: new Map(),
    supportsFiber: true,
    isDisabled: false,
    inject(r: unknown) {
      const id = this.renderers.size + 1
      this.renderers.set(id, r)
      return id
    },
    onScheduleFiberRoot() {},
    onCommitFiberRoot(_id: number, root: any) {
      c.commits.push([])
      try {
        walk(root.current, root.current.alternate)
      } catch {
        /* a shape this walk doesn't know: the commit still counts */
      }
    },
    onCommitFiberUnmount() {},
    onPostCommitFiberRoot() {},
    checkDCE() {},
  }
  return c
})

// A busy month like the demo's: each weekday a standup, two meetings and a
// focus block, an all-day event a week, and tasks due through it. Answers
// keep their identity for the same address, as SWR's do.
const answers = vi.hoisted(() => new Map<string, unknown>())
vi.mock("@/hooks/useFetch", () => ({
  useFetch: (url: string) => {
    if (!answers.has(url)) {
      const now = new Date()
      const at = (d: Date, h: number, m = 0) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), h, m).toISOString()
      const guests = { event_created_by: { user_uuid: "u-ana", user_name: "Ana Ruiz" }, event_participants: [{ user_uuid: "me", user_name: "Sam Rivera" }, { user_uuid: "u-jonas", user_name: "Jonas Weber" }] }
      const data: unknown[] = []
      if (url.includes("/event/getEvents")) {
        for (let i = -42; i < 42; i++) {
          const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i)
          const day = d.getDay()
          if (day === 0 || day === 6) continue
          const k = `${d.getMonth()}-${d.getDate()}`
          data.push(
            { event_uuid: `s${k}`, event_title: "Standup", event_start_time: at(d, 9), event_end_time: at(d, 9, 15) },
            { event_uuid: `m${k}`, event_title: "Design review", event_start_time: at(d, 11), event_end_time: at(d, 12) },
            { event_uuid: `f${k}`, event_title: "Focus", event_start_time: at(d, 13), event_end_time: at(d, 15), event_is_focus: true },
            { event_uuid: `c${k}`, event_title: "Customer call", event_start_time: at(d, 16), event_end_time: at(d, 16, 45), event_reminders: [10], ...guests },
          )
          if (day === 3) data.push({ event_uuid: `a${k}`, event_title: "Offsite", event_start_time: at(d, 0), event_end_time: at(new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1), 0), event_all_day: true })
        }
        answers.set(url, { data: { data }, isLoading: false, mutate: vi.fn() })
      } else answers.set(url, { data: { data: { isConnected: false } }, isLoading: false, mutate: vi.fn() })
    }
    return answers.get(url)
  },
  useFetchOnlyOnce: () => ({ data: { data: { user_uuid: "me" } } }),
}))
const tasks = vi.hoisted(() => {
  const now = new Date()
  const user_tasks = Array.from({ length: 12 }, (_, i) => {
    const due = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 14 + i * 3).toISOString()
    return { task_uuid: `t${i}`, task_name: `Task ${i}`, task_due_date: due, task_status: "todo" }
  })
  return { data: { msg: "", data: { user_tasks } }, isLoading: false, mutate: () => {} }
})
vi.mock("@/hooks/useAssignedTasks", () => ({ useAssignedTasks: () => tasks }))
const post = vi.hoisted(() => ({ makeRequest: () => {}, isSubmitting: false }))
vi.mock("@/hooks/usePost", () => ({ usePost: () => post }))
const toasts = vi.hoisted(() => ({ toast: () => {} }))
vi.mock("@/hooks/use-toast", () => ({ useToast: () => toasts }))
const confirm = vi.hoisted(() => () => {})
vi.mock("@/hooks/useConfirm", () => ({ useConfirm: () => confirm }))
const media = vi.hoisted(() => ({ isMobile: false, isDesktop: true }))
vi.mock("@/context/MediaQueryContext", () => ({ useMedia: () => media }))
const store = vi.hoisted(() => ({ dispatch: () => {}, state: { rightPanel: { rightPanelState: { isOpen: false, data: { eventUUID: "" } } } } }))
vi.mock("react-redux", () => ({ useDispatch: () => store.dispatch, useSelector: (pick: (s: unknown) => unknown) => pick(store.state) }))
// Next's own useRouter, under the contexts Next gives it: a write to the
// address that Next follows is a new layout router context (writeAddress).
vi.mock("next/navigation", async (actual) => ({ ...(await actual<object>()), useSearchParams: () => new URLSearchParams(window.location.search) }))

import { useState, type ReactNode } from "react"
import { AppRouterContext, LayoutRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime"
import { AppRouterProvider } from "@/lib/navigation/appRouter"
import { CalendarApp } from "./calendarApp"
import { pinTestClock } from "@/lib/testing/testClock"
import { putOnScreen, SCREENS } from "@/lib/testing/screens"
import { installPointerEvent } from "@/lib/testing/pointerEvent"

pinTestClock()
// A busy machine (a gate beside other gates) mounts the calendar slower.
vi.setConfig({ testTimeout: 20_000 })

beforeAll(async () => {
  await Promise.all([import("./calendarsPopover"), import("./eventPopover"), import("./monthView"), import("./yearView")])
})
afterEach(cleanup)

const nextRouter = { back() {}, forward() {}, refresh() {}, hmrRefresh() {}, push() {}, replace() {}, prefetch() {}, bfcacheId: "0" }
const cacheNode = { bfcacheId: 1 }
let writeAddress = () => {}
// Under the root's AppRouterProvider, as every page is (ClientProviders).
function InApp({ children }: { children: ReactNode }) {
  const [n, setN] = useState(0)
  writeAddress = () => setN((k) => k + 1)
  return (
    <AppRouterContext.Provider value={nextRouter as never}>
      <LayoutRouterContext.Provider value={{ parentCacheNode: cacheNode, url: `/app/calendar?w=${n}` } as never}>
        <AppRouterProvider>{children}</AppRouterProvider>
      </LayoutRouterContext.Provider>
    </AppRouterContext.Provider>
  )
}
const settle = (ms: number) =>
  act(async () => {
    await new Promise((r) => setTimeout(r, ms))
  })
// Settled: the calendar's items are drawn, however long that takes, then the
// first reveal is over and the lazy surfaces are in.
const drawn = async () => {
  await waitFor(() => expect(document.querySelector("[data-calendar] [data-hue-block], [data-calendar] [data-agenda] li")).toBeTruthy(), { timeout: 10_000 })
  await settled()
}

// How many times a component drew. The build renames a memo's inner function
// that shadows its export (memo(function WeekView) draws as WeekView2), so a
// plain counts.byName.WeekView reads 0 whatever is drawn.
const drew = (name: string) => Object.entries(counts.byName).reduce((n, [k, v]) => n + (k === name || new RegExp(`^${name}\\d+$`).test(k) ? v : 0), 0)

// Settled: the first reveal is over, the lazy surfaces are in, and nothing has
// drawn for 150 ms. Waited for, never slept: a chunk that lands late draws,
// and so is waited for too, instead of landing inside the window counted.
async function settled() {
  await waitFor(() => expect(document.querySelector("[data-reveal]")).toBeNull(), { timeout: 5000 })
  await quiet()
}

// Quiet: nothing has drawn for 150 ms, waited for rather than slept.
async function quiet() {
  let seen = -1
  await waitFor(
    () => {
      const now = counts.fibers
      if (now !== seen) {
        seen = now
        throw new Error(`still drawing (${now})`)
      }
    },
    { timeout: 5000, interval: 150 },
  )
}

const top = () =>
  Object.entries(counts.byName)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([n, k]) => `${n} ${k}`)
    .join(", ")

describe("what a press of J draws", () => {
  it("draws the next week's blocks and what names the period, and nothing else again", async () => {
    window.history.replaceState({}, "", "/app/calendar?view=week")
    render(
      <InApp>
        <CalendarApp />
      </InApp>,
    )
    // Settled: the first reveal is over and the lazy surfaces are in.
    await drawn()
    counts.fibers = 0
    counts.byName = {}
    for (let i = 0; i < 5; i++) {
      act(() => void fireEvent.keyDown(window, { key: "j" }))
      await act(async () => {
        await new Promise((r) => setTimeout(r, 50))
      })
    }
    const perPress = Math.round(counts.fibers / 5)
    expect(perPress, `renders per J: ${perPress} (${top()})`).toBeLessThanOrEqual(100)
  })
})

// C3 (fluid-11): an event opened draws its card, and the week beside it not
// at all: the open event never reaches WeekView, and its inputs keep.
describe("what opening an event draws", () => {
  // A tap on a block is a press until it lifts or moves: the week isn't drawn
  // for it (it drew twice, at the press and at the release: 4.7 ms each on a
  // phone at 4x, C3's trace), and its release opens the card.
  it("from a tap on a block of the week, draws its card and not the week", async () => {
    installPointerEvent()
    window.history.replaceState({}, "", "/app/calendar?view=week")
    render(
      <InApp>
        <CalendarApp />
      </InApp>,
    )
    await drawn()
    const block = [...document.querySelectorAll<HTMLElement>('[data-day-col] [data-hue-block="event"]')].find((b) => b.textContent?.includes("Design review"))!
    counts.fibers = 0
    counts.byName = {}
    // The press and the release are two tasks, each drawn before the next: in
    // one act() a press drawn and a release undoing it are batched away.
    act(() => {
      fireEvent.pointerDown(block, { button: 0, pointerId: 1, clientX: 10, clientY: 10 })
    })
    act(() => {
      fireEvent.pointerUp(block, { button: 0, pointerId: 1, clientX: 10, clientY: 10 })
    })
    await waitFor(() => expect(document.querySelector("[data-event-card]"), "the card").toBeTruthy(), { timeout: 5000 })
    expect(drew("WeekView"), `WeekView drew for a tap: ${counts.fibers} in all (${top()})`).toBe(0)
  })

  it("draws the event's card, and the week not again", async () => {
    window.history.replaceState({}, "", "/app/calendar?view=week")
    render(
      <InApp>
        <CalendarApp />
      </InApp>,
    )
    await drawn()
    counts.fibers = 0
    counts.byName = {}
    // The keyboard's click (detail 0): a movable block opens on it.
    const block = document.querySelector('[data-day-col] [data-hue-block="event"]') as HTMLElement
    act(() => void fireEvent.click(block, { detail: 0 }))
    await waitFor(() => expect(document.querySelector("[data-event-popover]"), "the card").toBeTruthy(), { timeout: 5000 })
    expect(drew("WeekView"), `WeekView drew when an event opened: ${counts.fibers} in all (${top()})`).toBe(0)
    // Its block says it is open, without the week drawing it, until the card closes.
    expect(block.getAttribute("data-selected")).toBe("true")
    act(() => void fireEvent.click(document.querySelector('[data-event-popover] [aria-label="Close"]') as HTMLElement))
    await waitFor(() => expect(block.hasAttribute("data-selected")).toBe(false), { timeout: 5000 })
  })

  // From a day (beside its rail), a phone's agenda (its first view) or a
  // phone's day, the view and the phone's bar keep too.
  it.each([
    ["a day on a computer", "/app/calendar?view=day&date=2026-10-16", false, '[data-day-col] [data-hue-block="event"]', ["WeekView", "HueBlock", "MiniMonth"]],
    ["a phone's agenda", "/app/calendar?date=2026-10-16", true, "[data-agenda] button[data-event-uuid]", ["CalendarAgenda", "PhoneBar", "DayCell"]],
    ["a phone's day", "/app/calendar?view=day&date=2026-10-16", true, '[data-day-col] [data-hue-block="event"]', ["WeekView", "PhoneBar", "DayCell"]],
    // Its bars are elements of the month's own (hueBlock); their icons are components.
    ["the month on a computer", "/app/calendar?view=month&date=2026-10-16", false, '[data-month-grid] [data-hue-block="event"]', ["MonthGrid", "MonthView", "Moon", "StatusGlyph"]],
  ])("from %s, draws its card, and not what it opened from", async (_, address, phone, opens, kept) => {
    const offScreen = phone ? putOnScreen(SCREENS["a phone in portrait"]) : () => {}
    media.isMobile = phone
    try {
      window.history.replaceState({}, "", address)
      render(
        <InApp>
          <CalendarApp />
        </InApp>,
      )
      await drawn()
      const item = [...document.querySelectorAll<HTMLElement>(opens)].find((b) => b.textContent?.includes("Design review"))
      expect(item, "an event to open").toBeTruthy()
      counts.fibers = 0
      counts.byName = {}
      act(() => void fireEvent.click(item!, { detail: 0 }))
      await waitFor(() => expect(document.querySelector("[data-event-card]"), "the card").toBeTruthy(), { timeout: 5000 })
      const again = Object.entries(counts.byName).filter(([n]) => kept.some((k) => n.startsWith(k)))
      expect(again, `drawn again when an event opened: ${counts.fibers} in all (${top()})`).toEqual([])
    } finally {
      media.isMobile = false
      offScreen()
    }
  })
})

// fluid-10: Next 16.3's useRouter() reads the layout router's context, a new
// object on every write to the address Next follows, so the calendar drew
// again for each write (its place a second after a move, on top of the
// shell). Only the root's AppRouterProvider, which reads it, may draw: the
// calendar navigates through useAppRouter (lib/navigation/appRouter).
describe("what a write to the address draws", () => {
  it("draws none of the calendar again", async () => {
    window.history.replaceState({}, "", "/app/calendar?view=week")
    render(
      <InApp>
        <CalendarApp />
      </InApp>,
    )
    await drawn()
    counts.fibers = 0
    counts.byName = {}
    act(() => writeAddress())
    await settle(50)
    const ours = counts.fibers - (counts.byName.InApp ?? 0) - (counts.byName.AppRouterProvider ?? 0)
    expect(ours, `the calendar drew on a write to the address (${top()})`).toBe(0)
  })
})

// C3 (fluid-11): the guests' faces come a pass after the card, so the press
// that opens it paints sooner; their row keeps its height meanwhile.
describe("when an event's guests are drawn", () => {
  it.each([
    ["a computer", false, "/app/calendar?view=week"],
    ["a phone", true, "/app/calendar?view=week&date=2026-10-16"],
  ])("on %s, a pass after its card", async (_, phone, address) => {
    const offScreen = phone ? putOnScreen(SCREENS["a phone in portrait"]) : () => {}
    media.isMobile = phone
    try {
      window.history.replaceState({}, "", address)
      render(
        <InApp>
          <CalendarApp />
        </InApp>,
      )
      await drawn()
      counts.commits = []
      const blocks = document.querySelectorAll('[data-day-col] [data-hue-block="event"]')
      act(() => void fireEvent.click(blocks[blocks.length - 1] as HTMLElement, { detail: 0 }))
      // The card's pass, then the faces' pass after it: each waited for.
      await waitFor(() => expect(document.querySelectorAll("[data-card-guests] [data-face]").length).toBe(3), { timeout: 5000 })
      const card = counts.commits.findIndex((names) => names.includes("EventCard"))
      expect(card, "the card's pass").toBeGreaterThanOrEqual(0)
      expect(counts.commits[card].filter((n) => n === "GuestFace"), "faces in the card's own pass").toEqual([])
      expect(counts.commits.slice(card + 1).some((names) => names.includes("GuestFace")), "the faces, a pass later").toBe(true)
    } finally {
      media.isMobile = false
      offScreen()
    }
  })
})

// C3 (fluid-11): an event's card draws what it shows and nothing closed: its
// More menu, and its reminders' menu (a sheet on a phone), are drawn once
// first pressed.
describe("what an event's card draws when it opens", () => {
  const openLast = async () => {
    const blocks = document.querySelectorAll('[data-day-col] [data-hue-block="event"]')
    act(() => void fireEvent.click(blocks[blocks.length - 1] as HTMLElement, { detail: 0 }))
    await waitFor(() => expect(document.querySelector("[data-event-card]"), "the card").toBeTruthy(), { timeout: 5000 })
  }
  const closedMenus = () => ["DropdownMenu", "Menu", "MenuProvider"].reduce((n, k) => n + (counts.byName[k] ?? 0), 0)

  it("on a computer, no closed menu", async () => {
    window.history.replaceState({}, "", "/app/calendar?view=week")
    render(
      <InApp>
        <CalendarApp />
      </InApp>,
    )
    await drawn()
    counts.fibers = 0
    counts.byName = {}
    await openLast()
    expect(document.querySelector("[data-card-reminders]"), "the reminders' row").toBeTruthy()
    expect(closedMenus(), `closed menus drawn with the card (${top()})`).toBe(0)
    expect(counts.byName.ReminderRow, "the reminders' row, drawn once").toBe(1)
  })

  it("on a phone, no closed menu, and no sheet but its own", async () => {
    const offScreen = putOnScreen(SCREENS["a phone in portrait"])
    media.isMobile = true
    try {
      // The phone shows a day at a time: tomorrow's call, today's being over.
      window.history.replaceState({}, "", "/app/calendar?view=week&date=2026-10-16")
      render(
        <InApp>
          <CalendarApp />
        </InApp>,
      )
      await drawn()
      counts.fibers = 0
      counts.byName = {}
      await openLast()
      expect(document.querySelector("[data-event-sheet]"), "the sheet").toBeTruthy()
      expect(document.querySelector("[data-card-reminders]"), "the reminders' row").toBeTruthy()
      expect(counts.byName.Drawer ?? 0, `sheets drawn with it (${top()})`).toBe(1)
      expect(closedMenus(), `closed menus drawn with the sheet (${top()})`).toBe(0)
      expect(counts.byName.ReminderRow, "the reminders' row, drawn once").toBe(1)
    } finally {
      media.isMobile = false
      offScreen()
    }
  })
})

// fluid-10 (calendar-budgets.json, rendersPerViewSwitch): a switch of view
// draws the new view and what names the period, never the toolbar, the panel
// or the shell again. Its budget is 150 for every view. Month drew 1,273,
// then 248 on B1 3ee909744 in a browser and 202 here: each bar was a
// component (HueBlock) and so was each busy day's "+N more".
describe("what a switch of view draws", () => {
  // fluid-10's budget is 150 a switch. The day draws less (79): its rail's
  // mini month is 42 days, drawn as elements (dayCell()), not 42 components.
  const SWITCHES: Array<[string, string, string, number]> = [
    ["week", "m", "[data-month-grid]", 150],
    ["month", "d", "[data-time-grid-scroll]", 90],
    ["week", "x", "[data-time-grid-scroll]", 150],
    ["week", "a", "[data-agenda]", 150],
    // A year is twelve months of days, drawn as one view (yearView.tsx).
    ["week", "y", "[data-year]", 150],
  ]
  it.each(SWITCHES)("from the %s view, the key %s draws no more than %i", async (from, key, view, most) => {
    window.history.replaceState({}, "", `/app/calendar?view=${from}`)
    render(
      <InApp>
        <CalendarApp />
      </InApp>,
    )
    await drawn()
    counts.fibers = 0
    counts.byName = {}
    act(() => void fireEvent.keyDown(window, { key }))
    await waitFor(() => expect(document.querySelector(view), `the view ${view}`).toBeTruthy(), { timeout: 10_000 })
    await quiet()
    expect(counts.fibers, `renders for ${key} from ${from}: ${counts.fibers} (${top()})`).toBeLessThanOrEqual(most)
  })
})

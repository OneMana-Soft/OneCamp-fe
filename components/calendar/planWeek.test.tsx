import { afterEach, describe, expect, it, vi } from "vitest"
import { useState } from "react"
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { PlanWeek, plannedTasks, planLine, type WeekPlan } from "./planWeek"
import type { DayLayer } from "./weekView"
import type { CalendarEventInterface } from "@/types/calendar"
import { installPointerEvent } from "@/lib/testing/pointerEvent"
import { listenForEscape } from "@/lib/keys/escape"
import { onEscape } from "@/lib/keys/onEscape"
import { pinTestClock } from "@/lib/testing/testClock"
import { usePost } from "@/hooks/usePost"
import { onDragCancel } from "@/lib/ui/dragCancel"
import { EmptyState } from "@/components/ui/empty-state"
import { ErrorState } from "@/components/ui/error-state"
import { SkeletonRows } from "@/components/ui/skeletonRows"

const http = vi.hoisted(() => ({ post: vi.fn() }))
vi.mock("@/lib/axiosInstance", async () => (await import("@/lib/testing/axiosInstance")).axiosInstanceModule({ default: { post: http.post } }))

// gcal-16 and gcal-new-task-blocks: "Plan my week", the Availability Engine's
// plan for your open tasks as a preview. Beside the grid its proposals are
// ghosts on the week, kept or removed and moved before anything is written;
// "Add N blocks" makes the kept ones through the page's one block writer, one
// create each; Discard and Escape write nothing. On a phone it is a list in a
// drawer. The plan says who ordered it: your workspace's own model, or why it
// is by due date.
afterEach(cleanup)
pinTestClock(new Date(2026, 9, 21, 10, 0))
installPointerEvent()

const at = (d: number, h: number, m = 0) => new Date(2026, 9, d, h, m).toISOString()
const PLAN: WeekPlan = {
  from: at(21, 10),
  to: at(26, 0),
  proposals: [
    { task_uuid: "t-plan", task_name: "Plan the launch", project_name: "Launch", start: at(21, 11), end: at(21, 11, 45), reason: "Due Thursday" },
    { task_uuid: "t-copy", task_name: "Write the pricing copy", project_name: "Launch", start: at(22, 9), end: at(22, 10), reason: "Waits on Plan the launch", after: "t-plan" },
    { task_uuid: "t-ship", task_name: "Ship the pricing page", start: at(23, 14), end: at(23, 15), reason: "Due Friday" },
  ],
  left: [{ task_uuid: "t-audit", task_name: "Audit the docs", reason: "it needs 6 hours and the week has 4 free" }],
  by: "model",
  model: "qwen3:4b-instruct",
  local: true,
}
const WED = new Date(2026, 9, 21)
const THU = new Date(2026, 9, 22)
const geo = { at: (m: number) => `${m}px`, tall: (m: number, least: number) => `${Math.max(m, least)}px` }
// What the page hands the chunk from its first load (the chunk imports none of it).
const kit = { escape: onEscape, dragCancel: onDragCancel, ui: { EmptyState, ErrorState, SkeletonRows } }

/** The planner as the page holds it, with two of the week's day columns drawing its layer. */
function setup(over: { plan?: WeekPlan | Error | Promise<never>; phone?: boolean; fails?: string[]; events?: CalendarEventInterface[] } = {}) {
  const ask = vi.fn(async () => {
    if (over.plan instanceof Error) throw over.plan
    return over.plan ?? PLAN
  })
  const on = {
    blockTime: vi.fn(async (uuid: string) => (over.fails?.includes(uuid) ? null : { id: `b-${uuid}` })),
    toast: vi.fn(),
    goTo: vi.fn(),
    onClose: vi.fn(),
    // The column's own press (a create), which a ghost's drag keeps out.
    pressed: vi.fn(),
    // The week's refocus after a redraw (weekView), asked for by a ghost the keys moved.
    keep: vi.fn(),
    // Each new layer the planner hands the week: every one redraws all seven days.
    layered: vi.fn(),
  }
  // The page's requests: makeRequest is one function for its life, as usePost's is (its object is not: below).
  const post = { makeRequest: ask as never }
  function Page() {
    const [layer, setLayer] = useState<DayLayer>()
    const [onLayer] = useState(() => (next: () => DayLayer | undefined) => (on.layered(), setLayer(next)))
    return (
      <>
        <PlanWeek phone={!!over.phone} post={post} events={over.events ?? []} {...on} toast={on.toast as never} onLayer={onLayer} {...kit} />
        {[WED, THU].map((day, di) => (
          <div key={di} data-day-col={di} onPointerDown={on.pressed}>
            {layer?.(day, geo.at, geo.tall, on.keep)}
          </div>
        ))}
      </>
    )
  }
  render(<Page />)
  return { ask, ...on }
}
const ghosts = () => [...document.querySelectorAll<HTMLElement>("[data-plan-ghost]")]
/**
 * With nothing to discard (asked for, empty or failed), the header's x is Close as the footer is, "Close · Esc"
 * (DESIGN-BUILD-128's re-look F3): never "Discard the plan". Gives the footer's Close.
 */
function closesOnly() {
  expect(screen.queryByRole("button", { name: "Discard the plan" })).toBeNull()
  const closes = screen.getAllByRole("button", { name: "Close" })
  expect(closes).toHaveLength(2)
  expect(closes[0].getAttribute("title")).toBe("Close · Esc")
  return closes[1]
}
const add = (n: number) => screen.getByRole("button", { name: `Add ${n} ${n === 1 ? "block" : "blocks"}` })

describe("plan my week", () => {
  it("asks for a plan with the hours the calendar sends and the tasks already blocked, writing nothing", async () => {
    const blocked = { event_uuid: "b1", event_end_time: at(21, 15), event_task: { task_uuid: "t-old" } }
    const past = { event_uuid: "b2", event_end_time: at(20, 15), event_task: { task_uuid: "t-done" } }
    const s = setup({ events: [blocked, past] as unknown as CalendarEventInterface[] })
    await waitFor(() => expect(ghosts()).toHaveLength(2))
    const [req] = s.ask.mock.calls[0] as unknown as [{ apiEndpoint: string; payload: { hours: { days: number[]; start: string; end: string }; skip: string[] }; quiet: boolean }]
    expect(req.apiEndpoint).toBe("/event/planWeek")
    expect(req.payload.hours).toMatchObject({ days: [1, 2, 3, 4, 5], start: "09:00", end: "17:00" })
    expect(req.payload.skip).toEqual(["t-old"])
    expect(req.quiet).toBe(true)
    expect(s.blockTime).not.toHaveBeenCalled()
    expect(s.goTo).toHaveBeenCalledWith(new Date(PLAN.from))
  })

  // The page's own requests (usePost): its object is new whenever one starts or ends
  // (isSubmitting), so an ask keyed on that object asked again each time, and each
  // answer came to an ask already dropped: a phone stayed on "Planning your week", and
  // a later answer put a moved ghost back (8 Nov e2e-3).
  it("asks once through the page's own requests, and a moved ghost stays where it was put", async () => {
    http.post.mockImplementation(() => new Promise((ok) => setTimeout(() => ok({ data: { msg: "ok", data: PLAN } }), 5)))
    function Page() {
      const post = usePost()
      const [layer, setLayer] = useState<DayLayer>()
      return (
        <>
          <PlanWeek phone={false} post={post} events={[]} blockTime={vi.fn()} toast={vi.fn() as never} goTo={vi.fn()} onLayer={setLayer} {...kit} onClose={vi.fn()} />
          <div data-day-col={0}>{layer?.(WED, geo.at, geo.tall, vi.fn())}</div>
        </>
      )
    }
    render(<Page />)
    await waitFor(() => expect(ghosts()).toHaveLength(1))
    fireEvent.keyDown(ghosts()[0], { key: "ArrowDown", altKey: true })
    const moved = ghosts()[0].getAttribute("aria-label")
    await act(() => new Promise((r) => setTimeout(r, 60)))
    expect(ghosts()[0].getAttribute("aria-label")).toBe(moved)
    expect(http.post).toHaveBeenCalledTimes(1)
  })

  it("draws each proposal as a ghost on its day with its task and why, and says what isn't planned", async () => {
    setup()
    await waitFor(() => expect(ghosts()).toHaveLength(2))
    const wed = document.querySelector('[data-day-col="0"] [data-plan-ghost]') as HTMLElement
    expect(wed.textContent).toContain("Plan the launch")
    expect(wed.textContent).toContain("Due Thursday")
    expect(wed.style.top).toBe("660px")
    expect(document.querySelector('[data-day-col="1"] [data-plan-ghost]')?.textContent).toContain("Write the pricing copy")
    // The list beside the grid has all three, Friday's too.
    expect(within(screen.getByRole("list", { name: "Proposed blocks" })).getAllByRole("listitem")).toHaveLength(3)
    expect(screen.getByText(/Not planned: it needs 6 hours/)).toBeTruthy()
    expect(screen.getByText("Ordered by qwen3:4b-instruct on your server")).toBeTruthy()
  })

  it("says the note when the plan is by due date, and that a Google calendar wasn't read", async () => {
    setup({ plan: { ...PLAN, by: "due", model: undefined, note: "Planned by due date: AI is off", unread: true } })
    await waitFor(() => expect(screen.getByText("Planned by due date: AI is off")).toBeTruthy())
    expect(screen.queryByText(/Ordered by/)).toBeNull()
    expect(screen.getByText(/these blocks may clash with it/)).toBeTruthy()
    expect([planLine({ ...PLAN, local: false }), planLine({ ...PLAN, by: "due", note: "Planned by due date" })]).toEqual(["Ordered by qwen3:4b-instruct, your workspace's model", "Planned by due date"])
  })

  it("adds only the kept ones, one create each through the page's writer, then closes", async () => {
    const s = setup()
    await waitFor(() => expect(ghosts()).toHaveLength(2))
    fireEvent.click(within(ghosts()[1]).getByRole("button", { name: "Remove Write the pricing copy" }))
    expect(add(2)).toBeTruthy()
    fireEvent.click(add(2))
    await waitFor(() => expect(s.onClose).toHaveBeenCalled())
    expect(s.blockTime.mock.calls).toEqual([
      ["t-plan", new Date(at(21, 11)), new Date(at(21, 11, 45)), "", true],
      ["t-ship", new Date(at(23, 14)), new Date(at(23, 15)), "", true],
    ])
    expect(s.toast).toHaveBeenCalledTimes(1)
    expect(s.toast).toHaveBeenCalledWith({ title: "Added 2 blocks to your week" })
  })

  it("keeps a failed one in the preview and the rest made", async () => {
    const s = setup({ fails: ["t-copy"] })
    await waitFor(() => expect(ghosts()).toHaveLength(2))
    fireEvent.click(add(3))
    await waitFor(() => expect(s.blockTime).toHaveBeenCalledTimes(3))
    await waitFor(() => expect(add(1)).toBeTruthy())
    expect(s.onClose).not.toHaveBeenCalled()
    expect(ghosts().map((g) => g.textContent)).toEqual([expect.stringContaining("Write the pricing copy")])
    expect(s.toast).toHaveBeenCalledWith({ title: "Added 2 blocks to your week" })
  })

  it("Discard and Escape (through the page's one Escape, as a panel) write nothing", async () => {
    const stop = listenForEscape()
    const s = setup()
    await waitFor(() => expect(ghosts()).toHaveLength(2))
    // With blocks to add, the header's x discards them, as the footer's Discard does.
    expect(screen.getByRole("button", { name: "Discard the plan" }).getAttribute("title")).toBe("Discard · Esc")
    fireEvent.click(screen.getByRole("button", { name: "Discard" }))
    fireEvent.keyDown(document.body, { key: "Escape" })
    expect(s.onClose).toHaveBeenCalledTimes(2)
    expect(s.blockTime).not.toHaveBeenCalled()
    stop()
  })

  // CR-B49 R2: an Escape while the blocks are being made would drop the preview with the rest still to make.
  it("waits on Escape while it adds: the preview stays until the blocks are made", async () => {
    const stop = listenForEscape()
    const s = setup()
    let made = () => {}
    s.blockTime.mockImplementation(() => new Promise((ok) => (made = () => ok({ id: "b" }))))
    await waitFor(() => expect(ghosts()).toHaveLength(2))
    fireEvent.click(add(3))
    await waitFor(() => expect(s.blockTime).toHaveBeenCalledTimes(1))
    fireEvent.keyDown(document.body, { key: "Escape" })
    expect(s.onClose).not.toHaveBeenCalled()
    for (let i = 1; i <= 3; i++) {
      await waitFor(() => expect(s.blockTime).toHaveBeenCalledTimes(i))
      await act(async () => made())
    }
    await waitFor(() => expect(s.onClose).toHaveBeenCalledTimes(1))
    stop()
  })

  it("takes the focus to its heading as it opens beside the grid", async () => {
    setup()
    await waitFor(() => expect(document.activeElement?.id).toBe("calendar-plan-title"))
    await waitFor(() => expect(ghosts()).toHaveLength(2))
    expect(document.activeElement?.id).toBe("calendar-plan-title")
  })

  it("moves a ghost by Alt and the arrows, a snap or a day, and adds it where it was moved", async () => {
    const s = setup()
    await waitFor(() => expect(ghosts()).toHaveLength(2))
    const wed = ghosts()[0]
    wed.focus()
    fireEvent.keyDown(wed, { key: "ArrowDown", altKey: true })
    fireEvent.keyDown(wed, { key: "ArrowRight", altKey: true })
    // Thursday now holds both, and the week is asked to put the focus back on the moved one (CR-B49 R1a).
    expect(document.querySelectorAll('[data-day-col="1"] [data-plan-ghost]')).toHaveLength(2)
    expect(s.keep).toHaveBeenLastCalledWith('[data-plan-ghost="t-plan"]')
    fireEvent.click(add(3))
    await waitFor(() => expect(s.blockTime).toHaveBeenCalledTimes(3))
    expect(s.blockTime.mock.calls[0].slice(0, 3)).toEqual(["t-plan", new Date(at(22, 11, 15)), new Date(at(22, 12))])
  })

  it("moves a ghost by a drag, snapped, without the column's own create", async () => {
    const s = setup()
    await waitFor(() => expect(ghosts()).toHaveLength(2))
    const col = document.querySelector('[data-day-col="0"]') as HTMLElement
    // The column is 24 hours of 56 px.
    col.getBoundingClientRect = () => ({ top: 0, height: 24 * 56, left: 0, right: 100, bottom: 24 * 56, width: 100, x: 0, y: 0, toJSON() {} }) as DOMRect
    const g = ghosts()[0]
    fireEvent.pointerDown(g, { button: 0, pointerId: 1, clientX: 50, clientY: 620 })
    fireEvent.pointerMove(g, { pointerId: 1, clientX: 50, clientY: 620 + 56 })
    fireEvent.pointerUp(g, { pointerId: 1 })
    expect(s.pressed).not.toHaveBeenCalled()
    fireEvent.click(add(3))
    await waitFor(() => expect(s.blockTime).toHaveBeenCalledTimes(3))
    expect(s.blockTime.mock.calls[0].slice(0, 3)).toEqual(["t-plan", new Date(at(21, 12)), new Date(at(21, 12, 45))])
  })

  // CR-B49 R1b: a day's column draws its own ghosts, so a drag into the next day draws the ghost
  // there (another element): the drag goes on from it to its release.
  it("goes on with a drag into the next day, to where it is let go", async () => {
    const s = setup()
    await waitFor(() => expect(ghosts()).toHaveLength(2))
    const cols = [0, 1].map((i) => document.querySelector(`[data-day-col="${i}"]`) as HTMLElement)
    cols.forEach((c, i) => (c.getBoundingClientRect = () => ({ top: 0, height: 24 * 56, left: i * 100, right: i * 100 + 100, bottom: 24 * 56, width: 100, x: i * 100, y: 0, toJSON() {} }) as DOMRect))
    // jsdom lays nothing out: the column under a point is the one its x falls in.
    Object.defineProperty(document, "elementsFromPoint", { configurable: true, value: (x: number) => [cols[x < 100 ? 0 : 1]] })
    try {
      fireEvent.pointerDown(ghosts()[0], { button: 0, pointerId: 1, clientX: 50, clientY: 620 })
      fireEvent.pointerMove(ghosts()[0], { pointerId: 1, clientX: 150, clientY: 620 })
      const moved = cols[1].querySelector('[aria-label^="Proposed: Plan the launch,"]') as HTMLElement
      expect(moved).toBeTruthy()
      fireEvent.pointerMove(moved, { pointerId: 1, clientX: 150, clientY: 620 + 56 })
      fireEvent.pointerUp(moved, { pointerId: 1, clientX: 150, clientY: 620 + 56 })
      expect(s.pressed).not.toHaveBeenCalled()
      fireEvent.click(add(3))
      await waitFor(() => expect(s.blockTime).toHaveBeenCalledTimes(3))
      expect(s.blockTime.mock.calls[0].slice(0, 3)).toEqual(["t-plan", new Date(at(22, 12)), new Date(at(22, 12, 45))])
    } finally {
      delete (document as { elementsFromPoint?: unknown }).elementsFromPoint
    }
  })

  // CR-B50 T1: the week's own end of a drag (lib/ui/dragCancel) puts a ghost back where the drag began: Escape
  // mid-drag ends the drag, not the plan, and the browser taking the pointer ends it the same way.
  it("puts a ghost back where its drag began on Escape or a lost pointer, and Escape mid-drag keeps the plan", async () => {
    const stop = listenForEscape()
    try {
      const s = setup()
      await waitFor(() => expect(ghosts()).toHaveLength(2))
      const col = document.querySelector('[data-day-col="0"]') as HTMLElement
      col.getBoundingClientRect = () => ({ top: 0, height: 24 * 56, left: 0, right: 100, bottom: 24 * 56, width: 100, x: 0, y: 0, toJSON() {} }) as DOMRect
      const ghost = () => document.querySelector('[aria-label^="Proposed: Plan the launch,"]') as HTMLElement
      const began = ghost().getAttribute("aria-label")
      fireEvent.pointerDown(ghost(), { button: 0, pointerId: 1, clientX: 50, clientY: 620 })
      fireEvent.pointerMove(ghost(), { pointerId: 1, clientX: 50, clientY: 620 + 56 })
      expect(ghost().getAttribute("aria-label")).not.toBe(began)
      fireEvent.keyDown(document.body, { key: "Escape" })
      expect(ghost().getAttribute("aria-label")).toBe(began)
      expect(s.onClose).not.toHaveBeenCalled()
      expect(ghosts()).toHaveLength(2)
      expect(screen.getByRole("button", { name: "Discard the plan" })).toBeTruthy()
      // The drag is over: a later move moves nothing.
      fireEvent.pointerMove(document.body, { pointerId: 1, clientX: 50, clientY: 620 + 112 })
      expect(ghost().getAttribute("aria-label")).toBe(began)

      fireEvent.pointerDown(ghost(), { button: 0, pointerId: 2, clientX: 50, clientY: 620 })
      fireEvent.pointerMove(ghost(), { pointerId: 2, clientX: 50, clientY: 620 + 56 })
      expect(ghost().getAttribute("aria-label")).not.toBe(began)
      fireEvent.pointerCancel(ghost(), { pointerId: 2 })
      expect(ghost().getAttribute("aria-label")).toBe(began)
      expect(s.pressed).not.toHaveBeenCalled()
      fireEvent.click(add(3))
      await waitFor(() => expect(s.blockTime).toHaveBeenCalledTimes(3))
      expect(s.blockTime.mock.calls[0].slice(0, 3)).toEqual(["t-plan", new Date(at(21, 11)), new Date(at(21, 11, 45))])
    } finally {
      stop()
    }
  })

  // CR-B50 T2: a drag redraws the week only when the ghost lands on a new snap, not on every pointer move.
  it("hands the week a new layer once a snap while a ghost is dragged, not on every move", async () => {
    const s = setup()
    await waitFor(() => expect(ghosts()).toHaveLength(2))
    const col = document.querySelector('[data-day-col="0"]') as HTMLElement
    col.getBoundingClientRect = () => ({ top: 0, height: 24 * 56, left: 0, right: 100, bottom: 24 * 56, width: 100, x: 0, y: 0, toJSON() {} }) as DOMRect
    const g = ghosts()[0]
    const before = s.layered.mock.calls.length
    fireEvent.pointerDown(g, { button: 0, pointerId: 1, clientX: 50, clientY: 620 })
    // A few px is a few minutes: the same snap, so the same layer.
    for (const dy of [1, 2, 3]) fireEvent.pointerMove(g, { pointerId: 1, clientX: 50, clientY: 620 + dy })
    expect(s.layered).toHaveBeenCalledTimes(before)
    // An hour down is a new snap: one new layer, and moves within it add none.
    for (const dy of [56, 57, 58]) fireEvent.pointerMove(g, { pointerId: 1, clientX: 50, clientY: 620 + dy })
    expect(s.layered).toHaveBeenCalledTimes(before + 1)
    fireEvent.pointerUp(g, { pointerId: 1 })
  })

  // DESIGN-BUILD-128 F1: loading, empty and failed are the shared states, and their one way out is Close.
  it("waits with the shared skeleton rows and only Close", async () => {
    const s = setup({ plan: new Promise<never>(() => {}) })
    const waiting = screen.getByRole("status", { name: "Planning your week" })
    expect(waiting.querySelectorAll(".animate-shimmer").length).toBeGreaterThan(0)
    expect(document.querySelectorAll(".animate-pulse")).toHaveLength(0)
    expect(screen.queryByRole("button", { name: /^Add \d+ blocks?$/ })).toBeNull()
    fireEvent.click(closesOnly())
    expect(s.onClose).toHaveBeenCalledTimes(1)
  })

  it("says an empty plan's reason and what to do next, with only Close, which writes nothing", async () => {
    const s = setup({ plan: { ...PLAN, proposals: [], left: [], by: "due", model: undefined, note: "Nothing to plan: no open tasks" } })
    await waitFor(() => expect(screen.getByRole("heading", { name: "Nothing to plan" })).toBeTruthy())
    expect(screen.getByText("Assign yourself a task, then plan again.")).toBeTruthy()
    expect(screen.queryByRole("button", { name: /^Add \d+ blocks?$/ })).toBeNull()
    expect(screen.queryByRole("button", { name: "Discard" })).toBeNull()
    expect(ghosts()).toHaveLength(0)
    fireEvent.click(closesOnly())
    expect(s.onClose).toHaveBeenCalledTimes(1)
    expect(s.blockTime).not.toHaveBeenCalled()
  })

  it("says when none of the tasks fit, and why for each", async () => {
    setup({ plan: { ...PLAN, proposals: [], note: "No free time left this week" } })
    await waitFor(() => expect(screen.getByRole("heading", { name: "No time left for these tasks" })).toBeTruthy())
    expect(screen.getByText(/Free up some time/)).toBeTruthy()
    expect(screen.getByText(/Not planned: it needs 6 hours/)).toBeTruthy()
    expect(screen.queryByRole("button", { name: /^Add \d+ blocks?$/ })).toBeNull()
    closesOnly()
  })

  it("says once when the plan couldn't be made, with Try again and Close, and Try again asks again", async () => {
    const s = setup({ plan: new Error("offline") })
    await waitFor(() => expect(screen.getAllByText("Couldn't load a plan for your week")).toHaveLength(1))
    expect(screen.getByRole("alert").textContent).toContain("Nothing was added.")
    expect(screen.queryByRole("button", { name: /^Add \d+ blocks?$/ })).toBeNull()
    expect(s.toast).not.toHaveBeenCalled()
    expect(s.blockTime).not.toHaveBeenCalled()
    closesOnly()
    fireEvent.click(screen.getByRole("button", { name: "Try again" }))
    await waitFor(() => expect(s.ask).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(screen.getAllByText("Couldn't load a plan for your week")).toHaveLength(1))
    fireEvent.click(closesOnly())
    expect(s.onClose).toHaveBeenCalledTimes(1)
  })

  it("is a list in a drawer on a phone: a row removed, the rest added from the pinned footer", async () => {
    const s = setup({ phone: true })
    await waitFor(() => expect(screen.getByRole("list", { name: "Proposed blocks" })).toBeTruthy())
    expect(ghosts()).toHaveLength(0)
    // DESIGN-BUILD-128 F3: the phone keeps "nothing is added" (there is no drag on a phone).
    expect(screen.getByText("Nothing is added until you say so.")).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Remove Ship the pricing page" }))
    const footer = document.querySelector("[data-sheet-footer]") as HTMLElement
    await act(async () => fireEvent.click(within(footer).getByRole("button", { name: "Add 2 blocks" })))
    await waitFor(() => expect(s.onClose).toHaveBeenCalled())
    expect(s.blockTime.mock.calls.map((c) => c[0])).toEqual(["t-plan", "t-copy"])
  })

  it("skips only the tasks with a block still to come", () => {
    const e = (uuid: string, end: string) => ({ event_end_time: end, event_task: { task_uuid: uuid } }) as unknown as CalendarEventInterface
    expect(plannedTasks([e("a", at(21, 12)), e("a", at(22, 12)), e("b", at(21, 9)), { event_end_time: at(22, 9) } as CalendarEventInterface], new Date(at(21, 10)))).toEqual(["a"])
  })
})

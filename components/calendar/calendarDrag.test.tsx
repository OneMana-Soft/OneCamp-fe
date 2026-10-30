import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render } from "@testing-library/react"
import { addDays, startOfWeek } from "date-fns"
import { WeekView, HOUR_HEIGHT } from "./weekView"
import { MonthView } from "./monthView"
import { itemsByDay, layoutWeek, monthGridRange, placeItems } from "./calendarLayout"
import { installPointerEvent } from "@/lib/testing/pointerEvent"
import { spanLabel } from "@/lib/calendar/spanLabel"
import { pinTestClock, TEST_TODAY } from "@/lib/testing/testClock"

// Today is TEST_TODAY wherever the code under test reads the time.
pinTestClock()

// content.md C13: drag on the grid to draft an event, hold a block to move it.
const monday = startOfWeek(new Date(2026, 9, 14), { weekStartsOn: 1 })
const at = (d: number, h: number) => new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + d, h).toISOString()

installPointerEvent()

beforeEach(() => {
  // Seven 100px columns after a 56px gutter, the grid's top at 0.
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
    const col = this.dataset?.dayCol
    if (col !== undefined) {
      const left = 56 + Number(col) * 100
      return { left, right: left + 100, top: 0, bottom: 24 * HOUR_HEIGHT, width: 100, height: 24 * HOUR_HEIGHT, x: left, y: 0, toJSON: () => ({}) } as DOMRect
    }
    return { left: 56, right: 756, top: 0, bottom: 24 * HOUR_HEIGHT, width: 700, height: 24 * HOUR_HEIGHT, x: 56, y: 0, toJSON: () => ({}) } as DOMRect
  })
  vi.stubGlobal("requestAnimationFrame", (f: FrameRequestCallback) => { f(0); return 0 })
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  delete (document as unknown as { elementFromPoint?: unknown }).elementFromPoint
})

const y = (h: number) => h * HOUR_HEIGHT

// One event on the week and on the month, and the presses that drag it.
const standup = { event_uuid: "e1", event_title: "Standup", event_start_time: at(0, 9), event_end_time: at(0, 10) }
const week = (on: { onEventChange?: () => void; onDraft?: () => void; onEventClick?: () => void; onEventMenu?: () => void }) =>
  render(<WeekView weekStart={monday} events={[standup]} tasks={[]} showEvents showTasks onEventChange={on.onEventChange} onDraft={on.onDraft} onEventClick={on.onEventClick ?? vi.fn()} onEventMenu={on.onEventMenu} onTaskClick={vi.fn()} />)
const grid = () => document.querySelector('[data-day-col="0"]')!.parentElement as HTMLElement
/** Holds the block and carries it to Wednesday 11:00: lifted, its origin drawn. */
const liftBlock = () => {
  const block = document.querySelector('[data-hue-block="event"]') as HTMLElement
  fireEvent.pointerDown(block, { button: 0, clientX: 100, clientY: y(9) + 5 })
  fireEvent.pointerMove(grid(), { clientX: 300, clientY: y(11) + 5 })
  expect(document.querySelector("[data-drag-origin]")).toBeTruthy()
  return block
}

const october = new Date(2026, 9, 15)
function month(on: { onDraft?: () => void; onMoveDays?: () => void; onItemClick?: () => void; onItemMenu?: () => void }) {
  const iso = (d: number, h: number) => new Date(2026, 9, d, h).toISOString()
  const { start, end } = monthGridRange(october)
  const placed = placeItems([{ event_uuid: "e1", event_title: "Standup", event_start_time: iso(15, 9), event_end_time: iso(15, 10) }])
  const weeks = []
  for (let ws = start; ws <= end; ws = addDays(ws, 7)) weeks.push({ weekStart: ws, days: Array.from({ length: 7 }, (_, i) => addDays(ws, i)), tracks: layoutWeek(ws, placed) })
  render(<MonthView month={october} weeks={weeks} byDay={itemsByDay(placed, start, end)} now={october} onItemClick={on.onItemClick ?? vi.fn()} onItemMenu={on.onItemMenu} onDraft={on.onDraft} onMoveDays={on.onMoveDays} />)
}
const day = (d: number) => document.querySelector(`[data-month-day="${new Date(2026, 9, d).toISOString()}"]`) as HTMLElement
/** The day under the pointer: jsdom lays nothing out, so the test says which. */
const pointAt = (el: HTMLElement) => Object.defineProperty(document, "elementFromPoint", { value: () => el, configurable: true })
/** Holds the 15th's bar and carries it over the 17th, which shows it would land there. */
const liftBar = () => {
  const bar = document.querySelector('[data-hue-block][data-event-uuid="e1"]') as HTMLElement
  fireEvent.pointerDown(bar, { button: 0, clientX: 100, clientY: 100 })
  pointAt(day(17))
  fireEvent.pointerMove(window, { clientX: 300, clientY: 100 })
  expect(day(17).className).toMatch(/ring-brand/)
  return bar
}

describe("dragging on the week", () => {
  it("drafts an event from the press to the pointer, snapped to quarter hours", () => {
    const onDraft = vi.fn()
    render(<WeekView weekStart={monday} events={[]} tasks={[]} showEvents showTasks onDraft={onDraft} onEventClick={vi.fn()} onTaskClick={vi.fn()} />)
    const col = document.querySelector('[data-day-col="2"]') as HTMLElement
    fireEvent.pointerDown(col, { button: 0, clientX: 300, clientY: y(10) })
    const grid = col.parentElement as HTMLElement
    fireEvent.pointerMove(grid, { clientX: 300, clientY: y(11) + 10 })
    expect(document.querySelector("[data-calendar-ghost]")).toBeTruthy()
    fireEvent.pointerUp(grid, { clientX: 300, clientY: y(11) + 10 })
    const [draft] = onDraft.mock.calls[0]
    expect(draft.start).toEqual(new Date(addDays(monday, 2).setHours(10, 0, 0, 0)))
    expect(draft.end).toEqual(new Date(addDays(monday, 2).setHours(11, 15, 0, 0)))
  })

  it("moves a held block to another day and time through the change callback", () => {
    const onChange = vi.fn()
    const ev = { event_uuid: "e1", event_title: "Standup", event_start_time: at(0, 9), event_end_time: at(0, 10) }
    render(<WeekView weekStart={monday} events={[ev]} tasks={[]} showEvents showTasks onEventChange={onChange} onEventClick={vi.fn()} onTaskClick={vi.fn()} />)
    const block = document.querySelector('[data-hue-block="event"]') as HTMLElement
    fireEvent.pointerDown(block, { button: 0, clientX: 100, clientY: y(9) + 5 })
    const grid = document.querySelector('[data-day-col="0"]')!.parentElement as HTMLElement
    fireEvent.pointerMove(grid, { clientX: 300, clientY: y(11) + 5 })
    expect(document.querySelector("[data-drag-origin]")).toBeTruthy()
    fireEvent.pointerUp(grid, { clientX: 300, clientY: y(11) + 5 })
    expect(onChange).toHaveBeenCalledWith("e1", new Date(addDays(monday, 2).setHours(11, 0, 0, 0)), new Date(addDays(monday, 2).setHours(12, 0, 0, 0)))
  })

  it("leaves the dashed origin where the block was, as wide as it was drawn", () => {
    // 9–11, 9–10 and 9:30–10:30 take three columns; 10:30–11 stretches over two of them.
    const ev = (id: string, from: number, to: number) => ({ event_uuid: id, event_title: id, event_start_time: at(0, from), event_end_time: at(0, to) })
    const half = (h: number) => new Date(new Date(at(0, Math.floor(h))).getTime() + (h % 1) * 3_600_000).toISOString()
    const late = { ...ev("late", 10, 11), event_start_time: half(10.5) }
    const mid = { ...ev("mid", 9, 10), event_start_time: half(9.5), event_end_time: half(10.5) }
    render(<WeekView weekStart={monday} events={[ev("long", 9, 11), ev("short", 9, 10), mid, late]} tasks={[]} showEvents showTasks onEventChange={vi.fn()} onEventClick={vi.fn()} onTaskClick={vi.fn()} />)
    const block = document.querySelector('[data-hue-block][data-event-uuid="late"]') as HTMLElement
    const drawn = { left: block.style.left, width: block.style.width }
    fireEvent.pointerDown(block, { button: 0, clientX: 100, clientY: y(10.5) + 5 })
    fireEvent.pointerMove(document.querySelector('[data-day-col="0"]')!.parentElement as HTMLElement, { clientX: 300, clientY: y(13) + 5 })
    const origin = document.querySelector("[data-drag-origin]") as HTMLElement
    expect({ left: origin.style.left, width: origin.style.width }).toEqual(drawn)
  })

  it("treats a press without travel as a click", () => {
    const onClick = vi.fn()
    const ev = { event_uuid: "e1", event_title: "Standup", event_start_time: at(0, 9), event_end_time: at(0, 10) }
    render(<WeekView weekStart={monday} events={[ev]} tasks={[]} showEvents showTasks onEventChange={vi.fn()} onEventClick={onClick} onTaskClick={vi.fn()} />)
    const block = document.querySelector('[data-hue-block="event"]') as HTMLElement
    fireEvent.pointerDown(block, { button: 0, clientX: 100, clientY: y(9) + 5 })
    fireEvent.pointerUp(block.parentElement!.parentElement as HTMLElement, { clientX: 100, clientY: y(9) + 5 })
    expect(onClick).toHaveBeenCalledWith("e1", block)
  })
})

// The interaction audit (CA-08, CA-09): a scroll that starts on the calendar
// takes the pointer (pointercancel, and no pointerup), and the drag it began
// stayed live: the next tap anywhere landed it.
describe("a drag the browser takes back", () => {
  it("puts a block back when the browser takes the pointer, and the release then sends nothing", () => {
    const onEventChange = vi.fn()
    week({ onEventChange })
    liftBlock()
    fireEvent.pointerCancel(grid())
    expect(document.querySelector("[data-drag-origin]")).toBeNull()
    fireEvent.pointerUp(grid(), { clientX: 300, clientY: y(11) + 5 })
    expect(onEventChange).not.toHaveBeenCalled()
  })

  it("puts a block back when the grid loses the pointer without a pointerup", () => {
    const onEventChange = vi.fn()
    week({ onEventChange })
    liftBlock()
    fireEvent.lostPointerCapture(grid())
    expect(document.querySelector("[data-drag-origin]")).toBeNull()
    fireEvent.pointerUp(grid(), { clientX: 300, clientY: y(11) + 5 })
    expect(onEventChange).not.toHaveBeenCalled()
  })

  it("keeps the move when the pointer only passes from the pressed block to the grid", () => {
    const onEventChange = vi.fn()
    week({ onEventChange })
    const block = liftBlock()
    // A touch press is held by the block until the grid takes it: the block loses it.
    fireEvent.lostPointerCapture(block)
    fireEvent.pointerUp(grid(), { clientX: 300, clientY: y(11) + 5 })
    expect(onEventChange).toHaveBeenCalledWith("e1", new Date(addDays(monday, 2).setHours(11, 0, 0, 0)), new Date(addDays(monday, 2).setHours(12, 0, 0, 0)))
  })

  it("drafts nothing from a press on the grid that became a scroll", () => {
    const onDraft = vi.fn()
    week({ onDraft })
    const col = document.querySelector('[data-day-col="2"]') as HTMLElement
    fireEvent.pointerDown(col, { button: 0, clientX: 300, clientY: y(10) })
    fireEvent.pointerCancel(col)
    fireEvent.pointerUp(grid(), { clientX: 300, clientY: y(10) })
    expect(onDraft).not.toHaveBeenCalled()
  })

  describe("on the month", () => {
    it("drafts nothing from a press on a day that became a scroll, when the next tap lands elsewhere", () => {
      const onDraft = vi.fn()
      month({ onDraft })
      fireEvent.pointerDown(day(20), { button: 0, clientX: 300, clientY: 300 })
      fireEvent.pointerCancel(day(20))
      fireEvent.pointerDown(document.body, { button: 0 })
      fireEvent.pointerUp(document.body, { button: 0 })
      expect(onDraft).not.toHaveBeenCalled()
    })

    it("moves nothing when the browser takes the pointer from a held bar", () => {
      const onMoveDays = vi.fn()
      month({ onMoveDays })
      const bar = liftBar()
      fireEvent.pointerCancel(bar)
      expect(day(17).className).not.toMatch(/ring-brand/)
      fireEvent.pointerUp(window, { clientX: 300, clientY: 100 })
      expect(onMoveDays).not.toHaveBeenCalled()
    })
  })
})

// The interaction audit (CA-01, CA-03, CA-09, the drag table): Esc didn't call
// a calendar drag off; the release after it still moved the event and sent
// the update. Esc puts it back where it started, and nothing is sent.
describe("Esc during a drag", () => {
  const esc = () => fireEvent.keyDown(window, { key: "Escape" })

  it("puts a moved block back where it started, and letting go sends nothing and opens nothing", () => {
    const onEventChange = vi.fn()
    const onEventClick = vi.fn()
    week({ onEventChange, onEventClick })
    const block = liftBlock()
    esc()
    expect(document.querySelector("[data-drag-origin]")).toBeNull()
    expect(block.className).not.toMatch(/calendar-lift/)
    fireEvent.pointerUp(grid(), { clientX: 300, clientY: y(11) + 5 })
    fireEvent.click(block, { detail: 1 })
    expect(onEventChange).not.toHaveBeenCalled()
    expect(onEventClick).not.toHaveBeenCalled()
  })

  it("abandons a drag on the grid: its ghost goes, and letting go drafts nothing", () => {
    const onDraft = vi.fn()
    week({ onDraft })
    const col = document.querySelector('[data-day-col="2"]') as HTMLElement
    fireEvent.pointerDown(col, { button: 0, clientX: 300, clientY: y(10) })
    fireEvent.pointerMove(grid(), { clientX: 300, clientY: y(11) + 10 })
    expect(document.querySelector("[data-calendar-ghost]")).toBeTruthy()
    esc()
    expect(document.querySelector("[data-calendar-ghost]")).toBeNull()
    fireEvent.pointerUp(grid(), { clientX: 300, clientY: y(11) + 10 })
    expect(onDraft).not.toHaveBeenCalled()
  })

  it("puts a held bar back on the month, and letting go moves nothing", () => {
    const onMoveDays = vi.fn()
    month({ onMoveDays })
    liftBar()
    esc()
    expect(day(17).className).not.toMatch(/ring-brand/)
    fireEvent.pointerUp(window, { clientX: 300, clientY: 100 })
    expect(onMoveDays).not.toHaveBeenCalled()
  })

  it("abandons a range of days on the month: letting go drafts nothing", () => {
    const onDraft = vi.fn()
    month({ onDraft })
    fireEvent.pointerDown(day(20), { button: 0, clientX: 300, clientY: 300 })
    pointAt(day(22))
    fireEvent.pointerMove(window, { clientX: 500, clientY: 300 })
    expect(day(21).className).toMatch(/bg-brand\/8/)
    esc()
    expect(day(21).className).not.toMatch(/bg-brand\/8/)
    fireEvent.pointerUp(window, { clientX: 500, clientY: 300 })
    expect(onDraft).not.toHaveBeenCalled()
  })

  it("goes no further while a drag is live, so nothing under it closes too; without one it does", () => {
    const under = vi.fn()
    window.addEventListener("keydown", under)
    try {
      week({ onEventChange: vi.fn() })
      liftBlock()
      esc()
      expect(under).not.toHaveBeenCalled()
      fireEvent.pointerUp(grid(), { clientX: 300, clientY: y(11) + 5 })
      esc()
      expect(under).toHaveBeenCalledTimes(1)
    } finally {
      window.removeEventListener("keydown", under)
    }
  })
})

// CA-01, CA-09 and D16 (INTERACTION_SPEC §5.1): a mouse lifts an event after
// 5 px of travel, a finger after a 250 ms hold within 8 px (sooner, it is a
// scroll). Let go having changed nothing, a press is a click: held still for
// a moment it opened nothing. A finger held still opens the event's menu.
describe("a press on an event", () => {
  beforeEach(() => {
    vi.useRealTimers()
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"], now: TEST_TODAY })
  })
  afterEach(() => {
    vi.useRealTimers()
  })
  const wait = (ms: number) => act(() => void vi.advanceTimersByTime(ms))
  const origin = () => document.querySelector("[data-drag-origin]")
  const block = () => document.querySelector('[data-hue-block="event"]') as HTMLElement
  const at9 = { clientX: 100, clientY: y(9) + 5 }

  it("opens a week block held still under a mouse, however long", () => {
    const onEventClick = vi.fn()
    week({ onEventChange: vi.fn(), onEventClick })
    fireEvent.pointerDown(block(), { button: 0, ...at9 })
    wait(600)
    expect(origin()).toBeNull()
    fireEvent.pointerUp(grid(), at9)
    expect(onEventClick).toHaveBeenCalledWith("e1", block())
  })

  it("opens a week block tapped with a finger", () => {
    const onEventClick = vi.fn()
    week({ onEventChange: vi.fn(), onEventClick, onEventMenu: vi.fn() })
    fireEvent.pointerDown(block(), { button: 0, pointerType: "touch", ...at9 })
    wait(120)
    fireEvent.pointerUp(grid(), { pointerType: "touch", ...at9 })
    expect(onEventClick).toHaveBeenCalledWith("e1", block())
  })

  // V-38: the click a finger's release is followed by would land on the sheet
  // the tap just opened and close it; a mouse's click goes to the grid.
  it("swallows the click that follows a finger's tap on a block, never a mouse's", () => {
    const heard = vi.fn()
    window.addEventListener("click", heard)
    try {
      week({ onEventChange: vi.fn(), onEventClick: vi.fn(), onEventMenu: vi.fn() })
      fireEvent.pointerDown(block(), { button: 0, pointerType: "touch", ...at9 })
      wait(120)
      fireEvent.pointerUp(grid(), { pointerType: "touch", ...at9 })
      fireEvent.click(document.body)
      expect(heard, "the tap's own click").not.toHaveBeenCalled()
      fireEvent.click(document.body)
      expect(heard, "the next click").toHaveBeenCalledTimes(1)
      fireEvent.pointerDown(block(), { button: 0, ...at9 })
      fireEvent.pointerUp(grid(), at9)
      fireEvent.click(document.body)
      expect(heard, "a mouse's click").toHaveBeenCalledTimes(2)
    } finally {
      window.removeEventListener("click", heard)
      wait(600)
    }
  })

  // V-50: a finger's tap on an empty hour opens the new event's sheet a frame
  // after the release; on a slow phone the tap's click comes after that frame.
  it("swallows the click that follows a finger's tap on an empty hour, never a mouse's", () => {
    const heard = vi.fn()
    const onDraft = vi.fn()
    window.addEventListener("click", heard)
    try {
      week({ onDraft })
      const col = document.querySelector('[data-day-col="2"]') as HTMLElement
      const at20 = { clientX: 300, clientY: y(20) + 5 }
      fireEvent.pointerDown(col, { button: 0, pointerType: "touch", ...at20 })
      fireEvent.pointerUp(grid(), { pointerType: "touch", ...at20 })
      expect(onDraft, "the tap drafts an event").toHaveBeenCalledTimes(1)
      fireEvent.click(document.body)
      expect(heard, "the tap's own click").not.toHaveBeenCalled()
      fireEvent.click(document.body)
      expect(heard, "the next click").toHaveBeenCalledTimes(1)
      fireEvent.pointerDown(col, { button: 0, ...at20 })
      fireEvent.pointerUp(grid(), at20)
      expect(onDraft, "a click drafts an event").toHaveBeenCalledTimes(2)
      fireEvent.click(document.body)
      expect(heard, "a mouse's click").toHaveBeenCalledTimes(2)
    } finally {
      window.removeEventListener("click", heard)
      wait(600)
    }
  })

  it("lifts a week block under a finger only once held 250 ms, and opens its menu when let go still", () => {
    const onEventMenu = vi.fn()
    const onEventClick = vi.fn()
    week({ onEventChange: vi.fn(), onEventClick, onEventMenu })
    fireEvent.pointerDown(block(), { button: 0, pointerType: "touch", ...at9 })
    wait(200)
    expect(origin()).toBeNull()
    wait(60)
    expect(origin()).toBeTruthy()
    fireEvent.pointerUp(grid(), { pointerType: "touch", ...at9 })
    expect(onEventMenu).toHaveBeenCalledWith("e1", block())
    expect(onEventClick).not.toHaveBeenCalled()
  })

  it("leaves a finger that moves before its hold to scroll the grid: no drag, no click", () => {
    const onEventChange = vi.fn()
    const onEventClick = vi.fn()
    week({ onEventChange, onEventClick })
    fireEvent.pointerDown(block(), { button: 0, pointerType: "touch", ...at9 })
    wait(100)
    fireEvent.pointerMove(grid(), { pointerType: "touch", clientX: 100, clientY: y(9) + 30 })
    expect(origin()).toBeNull()
    fireEvent.pointerUp(grid(), { pointerType: "touch", clientX: 100, clientY: y(9) + 30 })
    expect(onEventChange).not.toHaveBeenCalled()
    expect(onEventClick).not.toHaveBeenCalled()
  })

  it("drags a week block held under a finger, the page kept still beneath it", () => {
    const onEventChange = vi.fn()
    week({ onEventChange })
    fireEvent.pointerDown(block(), { button: 0, pointerType: "touch", ...at9 })
    wait(260)
    const scroll = new Event("touchmove", { bubbles: true, cancelable: true })
    grid().dispatchEvent(scroll)
    expect(scroll.defaultPrevented).toBe(true)
    fireEvent.pointerMove(grid(), { pointerType: "touch", clientX: 300, clientY: y(11) + 5 })
    fireEvent.pointerUp(grid(), { pointerType: "touch", clientX: 300, clientY: y(11) + 5 })
    expect(onEventChange).toHaveBeenCalledWith("e1", new Date(addDays(monday, 2).setHours(11, 0, 0, 0)), new Date(addDays(monday, 2).setHours(12, 0, 0, 0)))
  })

  it("opens a month bar held still under a mouse, and a finger's menu when held still", () => {
    const onItemClick = vi.fn()
    const onItemMenu = vi.fn()
    month({ onMoveDays: vi.fn(), onItemClick, onItemMenu })
    const bar = () => document.querySelector('[data-hue-block][data-event-uuid="e1"]') as HTMLElement
    fireEvent.pointerDown(bar(), { button: 0, clientX: 100, clientY: 100 })
    wait(600)
    fireEvent.pointerUp(window, { clientX: 100, clientY: 100 })
    expect(onItemClick).toHaveBeenCalledWith(expect.objectContaining({ event_uuid: "e1" }), bar())
    fireEvent.pointerDown(bar(), { button: 0, pointerType: "touch", clientX: 100, clientY: 100 })
    wait(260)
    fireEvent.pointerUp(window, { pointerType: "touch", clientX: 100, clientY: 100 })
    expect(onItemMenu).toHaveBeenCalledWith(expect.objectContaining({ event_uuid: "e1" }), bar())
    expect(onItemClick).toHaveBeenCalledTimes(1)
  })
})

// INTERACTION_SPEC §4 (the calendar event row) and D12: an event moves from
// the keyboard as it does by hand, and the focus goes with it.
describe("moving an event from the keyboard", () => {
  it("moves the focused block a day with Alt+→, and the focus follows it to the next day's column", () => {
    const onEventChange = vi.fn()
    const view = (events: (typeof standup)[]) => <WeekView weekStart={monday} events={events} tasks={[]} showEvents showTasks onEventChange={onEventChange} onEventClick={vi.fn()} onTaskClick={vi.fn()} />
    const { rerender } = render(view([standup]))
    const block = document.querySelector('[data-hue-block="event"]') as HTMLElement
    block.focus()
    fireEvent.keyDown(block, { key: "ArrowRight", altKey: true })
    expect(onEventChange).toHaveBeenCalledWith("e1", new Date(addDays(monday, 1).setHours(9, 0, 0, 0)), new Date(addDays(monday, 1).setHours(10, 0, 0, 0)))
    // The calendar draws the move at once: the block is drawn again in Tuesday's column.
    block.blur()
    rerender(view([{ ...standup, event_start_time: at(1, 9), event_end_time: at(1, 10) }]))
    const moved = document.querySelector('[data-day-col="1"] [data-hue-block="event"]') as HTMLElement
    expect(moved).toBeTruthy()
    expect(document.activeElement).toBe(moved)
  })

  // From the review (rvNudgeEdge): Alt+→ on the week's last day (Alt+← on its
  // first, or either in the day view) moves the event out of the days shown;
  // its block went, and the focus fell to the page.
  it("keeps the focus in the calendar when the move takes the event past the days shown", () => {
    const onEventChange = vi.fn()
    const retro = { event_uuid: "e1", event_title: "Retro", event_start_time: at(6, 9), event_end_time: at(6, 10) }
    const view = (events: (typeof retro)[]) => <WeekView weekStart={monday} events={events} tasks={[]} showEvents showTasks onEventChange={onEventChange} onEventClick={vi.fn()} onTaskClick={vi.fn()} />
    const { rerender } = render(view([retro]))
    const block = document.querySelector('[data-hue-block="event"]') as HTMLElement
    block.focus()
    fireEvent.keyDown(block, { key: "ArrowRight", altKey: true })
    expect(onEventChange).toHaveBeenCalledWith("e1", new Date(addDays(monday, 7).setHours(9, 0, 0, 0)), new Date(addDays(monday, 7).setHours(10, 0, 0, 0)))
    // The calendar draws the move at once: next Monday, a week this one doesn't show.
    rerender(view([{ ...retro, event_start_time: at(7, 9), event_end_time: at(7, 10) }]))
    expect(document.querySelector('[data-hue-block="event"]')).toBeNull()
    expect(document.activeElement, "the focus after the move").toBe(document.querySelector("[data-time-grid-scroll]"))
  })

  it("leaves a block that can't be moved, and every key but Alt and an arrow, alone", () => {
    const onEventChange = vi.fn()
    render(<WeekView weekStart={monday} events={[standup]} tasks={[]} showEvents showTasks onEventChange={onEventChange} canMove={() => false} onEventClick={vi.fn()} onTaskClick={vi.fn()} />)
    const block = document.querySelector('[data-hue-block="event"]') as HTMLElement
    fireEvent.keyDown(block, { key: "ArrowDown", altKey: true })
    fireEvent.keyDown(block, { key: "ArrowDown" })
    expect(onEventChange).not.toHaveBeenCalled()
  })
})

// CA-02: the 6 px resize grips are a pointer's tool. A finger couldn't take
// them (a press there began a resize the page's scroll then took); a mouse
// resizing got the move's grabbing hand and lift.
describe("the resize grips", () => {
  const grip = (edge: "top" | "bottom") => document.querySelector(`[data-resize-grip="${edge}"]`) as HTMLElement

  it("aren't drawn on a touch screen, and a finger held there moves the whole event", () => {
    vi.useRealTimers()
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"], now: TEST_TODAY })
    try {
      const onEventChange = vi.fn()
      week({ onEventChange })
      expect(grip("bottom").className).toContain("[@media(hover:none)]:hidden")
      fireEvent.pointerDown(grip("bottom"), { button: 0, pointerType: "touch", clientX: 100, clientY: y(10) - 2 })
      act(() => void vi.advanceTimersByTime(260))
      fireEvent.pointerMove(grid(), { pointerType: "touch", clientX: 100, clientY: y(12) - 2 })
      fireEvent.pointerUp(grid(), { pointerType: "touch", clientX: 100, clientY: y(12) - 2 })
      expect(onEventChange).toHaveBeenCalledWith("e1", new Date(new Date(monday).setHours(11, 0, 0, 0)), new Date(new Date(monday).setHours(12, 0, 0, 0)))
    } finally {
      vi.useRealTimers()
    }
  })

  it("stretch a block under a mouse where it is, with the resize cursor and no lift", () => {
    const onEventChange = vi.fn()
    week({ onEventChange })
    const block = document.querySelector('[data-hue-block="event"]') as HTMLElement
    fireEvent.pointerDown(grip("bottom"), { button: 0, clientX: 100, clientY: y(10) - 2 })
    fireEvent.pointerMove(grid(), { clientX: 100, clientY: y(11) })
    expect(block.className).not.toContain("calendar-lift")
    expect(block.className).toContain("cursor-ns-resize")
    expect(grid().className).toContain("cursor-ns-resize")
    expect(grid().className).not.toContain("cursor-grabbing")
    // Its range as it stretches, and its length beside it.
    expect(block.textContent).toContain(spanLabel(new Date(new Date(monday).setHours(9, 0, 0, 0)), new Date(new Date(monday).setHours(11, 0, 0, 0))))
    expect(block.querySelector(".content-ghost-pulse")?.textContent).toBe("2 h")
    fireEvent.pointerUp(grid(), { clientX: 100, clientY: y(11) })
    expect(onEventChange).toHaveBeenCalledWith("e1", new Date(new Date(monday).setHours(9, 0, 0, 0)), new Date(new Date(monday).setHours(11, 0, 0, 0)))
  })
})

// CA-03: the grid's hover band was grey, and a drag stopped at the grid's
// edge: an event couldn't be carried to an hour out of view.
describe("the time grid under a drag", () => {
  it("draws the hover band in the brand's tint, its time in brand text", () => {
    week({ onDraft: vi.fn() })
    fireEvent.pointerMove(grid(), { clientX: 300, clientY: y(14) + 3 })
    const band = document.querySelector("[data-hover-band]") as HTMLElement
    expect(band.className).toContain("bg-brand/6")
    expect((band.firstElementChild as HTMLElement).className).toContain("text-brand-text")
  })

  it("scrolls near its bottom edge while a block is carried there, and the block goes on with the hours", async () => {
    let frames: FrameRequestCallback[] = []
    vi.stubGlobal("requestAnimationFrame", (f: FrameRequestCallback) => frames.push(f))
    vi.stubGlobal("cancelAnimationFrame", () => {
      frames = []
    })
    const run = () => {
      const now = frames
      frames = []
      now.forEach((f) => f(0))
    }
    const onEventChange = vi.fn()
    week({ onEventChange })
    // A 600 px window on the day's 1,344 px: the hours move up as it scrolls.
    const scroller = document.querySelector("[data-time-grid-scroll]") as HTMLElement
    let top = 0
    Object.defineProperty(scroller, "scrollTop", { get: () => top, set: (v: number) => (top = Math.max(0, Math.min(744, v))) })
    Object.defineProperty(scroller, "scrollHeight", { value: 24 * HOUR_HEIGHT })
    Object.defineProperty(scroller, "clientHeight", { value: 600 })
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      if (this === scroller) return { left: 56, right: 756, top: 0, bottom: 600, width: 700, height: 600, x: 56, y: 0, toJSON: () => ({}) } as DOMRect
      const col = this.dataset?.dayCol
      const left = col !== undefined ? 56 + Number(col) * 100 : 56
      const width = col !== undefined ? 100 : 700
      return { left, right: left + width, top: -top, bottom: 24 * HOUR_HEIGHT - top, width, height: 24 * HOUR_HEIGHT, x: left, y: -top, toJSON: () => ({}) } as DOMRect
    })
    const block = document.querySelector('[data-hue-block="event"]') as HTMLElement
    fireEvent.pointerDown(block, { button: 0, clientX: 100, clientY: y(9) + 5 })
    // 10 px from the bottom edge: 14 px a frame (0 to 18 over the 48 px zone).
    fireEvent.pointerMove(grid(), { clientX: 300, clientY: 590 })
    // The edge scroll's code is a chunk the press asked for: the move follows once it lands.
    await act(async () => {
      await import("@/lib/ui/edgeScroll")
    })
    act(() => {
      run()
      run()
    })
    expect(scroller.scrollTop).toBe(28)
    fireEvent.pointerUp(grid(), { clientX: 300, clientY: 590 })
    // Without the scroll it lands at 10:30; the hours moved up 28 px under the pointer.
    expect(onEventChange).toHaveBeenCalledWith("e1", new Date(addDays(monday, 2).setHours(11, 0, 0, 0)), new Date(addDays(monday, 2).setHours(12, 0, 0, 0)))
    act(() => run())
    expect(scroller.scrollTop).toBe(28)
  })
})

// CA-09 (interaction audit): a month bar being moved dimmed where it was and
// nothing followed the pointer. INTERACTION_SPEC §2.5, §5.1: the lifted bar is
// drawn where it would land, and a placeholder keeps where it was.
describe("a month bar in a drag", () => {
  it("is drawn lifted in the day it would land on, its place kept by a placeholder, until it lands", () => {
    const onMoveDays = vi.fn()
    month({ onMoveDays })
    const bar = liftBar()
    const ghost = day(17).querySelector("[data-drag-ghost]") as HTMLElement
    expect(ghost).toBeTruthy()
    expect(ghost.textContent).toBe("Standup")
    expect(ghost.className).toContain("calendar-lift")
    expect(bar.className).toContain("outline-dashed")
    expect(bar.className).not.toContain("opacity-40")
    fireEvent.pointerUp(window, { clientX: 300, clientY: 100 })
    expect(onMoveDays).toHaveBeenCalledWith(expect.objectContaining({ event_uuid: "e1" }), 2)
    expect(document.querySelector("[data-drag-ghost]")).toBeNull()
  })

  it("keeps a week block's place with the same placeholder", () => {
    week({ onEventChange: vi.fn() })
    liftBlock()
    expect((document.querySelector("[data-drag-origin]") as HTMLElement).className).toContain("outline-dashed")
  })

  // DESIGN-BUILD-3 (B1 review, 21 Oct): a carried block said its old times,
  // with the new ones on a tag beside them. It says when it would land, by
  // the shared range (noon's rule included); the day is the column's.
  it("says, while it is carried, when it would land, with no second time beside it", () => {
    week({ onEventChange: vi.fn() })
    const block = liftBlock()
    const wednesday = addDays(monday, 2)
    expect(block.textContent).toContain(spanLabel(new Date(new Date(wednesday).setHours(11, 0, 0, 0)), new Date(new Date(wednesday).setHours(12, 0, 0, 0))))
    expect(block.textContent).not.toContain(spanLabel(new Date(new Date(monday).setHours(9, 0, 0, 0)), new Date(new Date(monday).setHours(10, 0, 0, 0))))
    expect(block.querySelector(".content-ghost-pulse")).toBeNull()
  })
})

// gcal-new-task-blocks: a task carried from the all-day lane onto the hours
// blocks an hour of its time there; a tap on it still opens the task.
describe("a task carried from the all-day lane", () => {
  const brief = { task_uuid: "t1", task_name: "Write the brief", task_due_date: at(2, 12), task_status: "todo" }
  const view = (on: { onTaskBlock?: () => void; onTaskClick?: () => void }) =>
    render(
      <WeekView
        weekStart={monday}
        events={[]}
        tasks={[brief] as never}
        showEvents
        showTasks
        onEventClick={vi.fn()}
        onTaskClick={on.onTaskClick ?? vi.fn()}
        onTaskBlock={on.onTaskBlock}
      />,
    )
  const chip = () => document.querySelector('[data-all-day-rail] [aria-label^="Task: Write the brief"]') as HTMLElement

  it("blocks an hour of its time where it is let go over the hours, an hour about the pointer", () => {
    const onTaskBlock = vi.fn()
    view({ onTaskBlock })
    fireEvent.pointerDown(chip(), { button: 0, pointerId: 1, clientX: 300, clientY: 10 })
    // Carried to Wednesday (the third column) at 10:00: 9:30 to 10:30, drawn as a ghost that names the task.
    fireEvent.pointerMove(grid(), { pointerId: 1, clientX: 320, clientY: y(10) })
    const ghost = document.querySelector('[data-day-col="2"] [data-calendar-ghost]')
    expect(ghost?.textContent).toContain("Write the brief")
    fireEvent.pointerUp(grid(), { pointerId: 1, clientX: 320, clientY: y(10) })
    expect(onTaskBlock).toHaveBeenCalledWith("t1", new Date(addDays(monday, 2).setHours(9, 30, 0, 0)), new Date(addDays(monday, 2).setHours(10, 30, 0, 0)))
    expect(document.querySelector("[data-calendar-ghost]")).toBeNull()
  })

  it("opens the task on a tap, and blocks nothing", () => {
    const onTaskBlock = vi.fn()
    const onTaskClick = vi.fn()
    view({ onTaskBlock, onTaskClick })
    fireEvent.pointerDown(chip(), { button: 0, pointerId: 1, clientX: 300, clientY: 10 })
    fireEvent.pointerUp(grid(), { pointerId: 1, clientX: 300, clientY: 10 })
    expect(onTaskClick).toHaveBeenCalledWith("t1")
    expect(onTaskBlock).not.toHaveBeenCalled()
  })

  it("only opens, where the hours take no tasks", () => {
    const onTaskClick = vi.fn()
    view({ onTaskClick })
    fireEvent.click(chip(), { detail: 1 })
    expect(onTaskClick).toHaveBeenCalledWith("t1")
  })
})

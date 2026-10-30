import "./timelineTestKit"
import { afterEach, describe, expect, it } from "vitest"
import { cleanup, fireEvent, render, renderHook, screen } from "@testing-library/react"
import { vi } from "vitest"
import { startOfDay } from "date-fns"
import { useRef } from "react"

import { ProjectTimeline } from "@/components/project/timeline/ProjectTimeline"
import { TimelineHeader } from "@/components/project/timeline/TimelineHeader"
import { timelineRange, zoomStep } from "@/lib/timeline"
import { pinTestClock } from "@/lib/testing/testClock"

pinTestClock()

afterEach(() => {
  cleanup()
  localStorage.clear()
})

/**
 * The timeline's frame (design v3, work.md W23): no outer box, a 260px
 * sticky name column, today as a brand ring round its number (never a filled
 * disc) with a 1.5px brand line and its pill, and one 44px toolbar.
 */
const day = (d: number) => new Date(2026, 9, d, 17).toISOString()
const tasks = [
  { task_uuid: "a", task_name: "Write the launch announcement", task_status: "inProgress", task_start_date: day(10), task_due_date: day(12) },
  { task_uuid: "b", task_name: "Book the launch retro", task_status: "todo", task_start_date: day(14), task_due_date: day(15) },
]

describe("the timeline's frame", () => {
  it("rings today in brand, never a filled disc", () => {
    const today = startOfDay(new Date())
    const range = timelineRange([], today, "day")
    const { container } = render(<TimelineHeader range={range} zoom="day" dayWidth={36} today={today} nameWidth={260} />)
    const ring = container.querySelector<HTMLElement>("[data-today]")!
    expect(ring.style.boxShadow).toContain("var(--brand)")
    expect(ring.className).not.toMatch(/bg-primary|bg-brand/)
    expect(container.querySelector("[data-today-pill]")?.textContent).toBe("Today")
  })

  it("has no outer box, a 260px sticky name column, and one 44px toolbar", () => {
    const { container } = render(<ProjectTimeline projectId="p" tasks={tasks} onOpenTask={() => {}} />)
    const region = container.querySelector("[role=region]")!
    for (let el: Element | null = region; el && el !== container; el = el.parentElement) {
      expect(el.className).not.toMatch(/\brounded-md border\b|\brounded-md\b.*\bborder\b/)
    }
    const names = container.querySelector<HTMLElement>("[data-name-column]")!
    expect(names.style.width).toBe("260px")
    expect(names.className).toContain("sticky")
    expect(container.querySelector("[data-work-toolbar]")!.className).toContain("h-11")
    expect(container.querySelector("[data-today-line]")!.className).toContain("w-[1.5px]")
    // Groups carry the status glyph, not a dot.
    expect(container.querySelector("[data-timeline-group] [data-status-glyph]")).not.toBeNull()
  })

  it("makes a task with C, as the List and the Board do, and says so on New task (PTC-6)", () => {
    const create = vi.fn()
    render(<ProjectTimeline projectId="p" tasks={tasks} onOpenTask={() => {}} onCreateTask={create} />)
    const button = screen.getByRole("button", { name: "New task" })
    expect(button.getAttribute("aria-keyshortcuts")).toBe("C")
    expect(button.querySelector(".kbd")?.textContent).toBe("C")
    // The keys answer only while the timeline is on screen (offsetParent),
    // which jsdom, with no layout, never says.
    const was = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "offsetParent")
    Object.defineProperty(HTMLElement.prototype, "offsetParent", { configurable: true, get: () => document.body })
    try {
      fireEvent.keyDown(window, { key: "c" })
    } finally {
      if (was) Object.defineProperty(HTMLElement.prototype, "offsetParent", was)
    }
    expect(create).toHaveBeenCalledTimes(1)
  })

  it("steps the zoom in and out, Days to Quarters", () => {
    expect(zoomStep("week", 1)).toBe("month")
    expect(zoomStep("month", 1)).toBe("quarter")
    expect(zoomStep("quarter", 1)).toBe("quarter")
    expect(zoomStep("day", -1)).toBe("day")
  })
})

// PTC-29: a month's name stuck at the grid's left edge slid under the names
// column as its month scrolled away ("ptember 2026"), and so did a bar's.
describe("names stuck at the timeline's left edge", () => {
  it("narrow to what is left of their month or bar in view", async () => {
    const { stuckRoom, SCROLL_X } = await import("@/hooks/useTimelineView")
    expect(stuckRoom(400)).toBe(`max(0px, calc(400px - var(${SCROLL_X}, 0px)))`)
    expect(stuckRoom(400, 4)).toBe(`max(0px, calc(396px - var(${SCROLL_X}, 0px)))`)
    const range = timelineRange(tasks as never, startOfDay(new Date(2026, 9, 12)), "week")
    const { container } = render(<TimelineHeader range={range} zoom="week" dayWidth={12} today={startOfDay(new Date(2026, 9, 12))} nameWidth={260} />)
    const label = container.querySelector<HTMLElement>("[data-timeline-header] [data-month-label]")!
    expect(label.style.maxWidth).toContain(`var(${SCROLL_X}`)
  })

  it("keep the scroll in one CSS variable as the grid scrolls", async () => {
    const { useTimelineView, SCROLL_X } = await vi.importActual<typeof import("@/hooks/useTimelineView")>("@/hooks/useTimelineView")
    const el = document.createElement("div")
    const range = timelineRange(tasks as never, startOfDay(new Date(2026, 9, 12)), "week")
    const { result } = renderHook(() =>
      useTimelineView({ scrollRef: { current: el }, range, dayWidth: 12, nameWidth: 260, spans: [] as never, today: new Date(2026, 9, 12), ready: false }),
    )
    el.scrollLeft = 120
    result.current.onScroll()
    expect(el.style.getPropertyValue(SCROLL_X)).toBe("120px")
  })
})

describe("the timeline's view", () => {
  // V-63 at 1280 (29 Oct 2026): a project's timeline draws its scroller only once its milestones are in too, and
  // they can come after its rows and its zoom (ready). The view was never placed then, and its width never
  // watched, so a task's panel opening beside it moved its centre day (11-28 to 11-14 on the live demo).
  it("places the scroller and watches its width when the scroller comes after ready", async () => {
    const { useTimelineView } = await vi.importActual<typeof import("@/hooks/useTimelineView")>("@/hooks/useTimelineView")
    const watched: Element[] = []
    const real = globalThis.ResizeObserver
    globalThis.ResizeObserver = class {
      observe(target: Element) {
        watched.push(target)
      }
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver
    try {
      const today = new Date(2026, 9, 12)
      const range = timelineRange(tasks as never, startOfDay(today), "week")
      function View({ drawn }: { drawn: boolean }) {
        const scrollRef = useRef<HTMLDivElement>(null)
        const { scrollerRef } = useTimelineView({ scrollRef, range, dayWidth: 12, nameWidth: 260, spans: [] as never, today, ready: true })
        return drawn ? <div ref={scrollerRef} data-testid="scroller" /> : <div data-testid="loading" />
      }
      const { rerender } = render(<View drawn={false} />)
      rerender(<View drawn />)
      const scroller = screen.getByTestId("scroller")
      expect(watched, "the scroller's width isn't watched").toContain(scroller)
      expect(scroller.scrollLeft, "the scroller isn't placed at its first view").toBeGreaterThan(0)
    } finally {
      globalThis.ResizeObserver = real
    }
  })
})

import "./timelineTestKit"
import { afterEach, describe, expect, it } from "vitest"
import { cleanup, render } from "@testing-library/react"
import { startOfDay } from "date-fns"

import { ProjectTimeline } from "@/components/project/timeline/ProjectTimeline"
import { TimelineHeader } from "@/components/project/timeline/TimelineHeader"
import { timelineRange, zoomStep } from "@/lib/timeline"

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

  it("steps the zoom in and out, Days to Quarters", () => {
    expect(zoomStep("week", 1)).toBe("month")
    expect(zoomStep("month", 1)).toBe("quarter")
    expect(zoomStep("quarter", 1)).toBe("quarter")
    expect(zoomStep("day", -1)).toBe("day")
  })
})

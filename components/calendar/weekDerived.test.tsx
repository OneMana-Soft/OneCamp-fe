import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"
import type { CalendarEventInterface } from "@/types/calendar"

vi.mock("@/hooks/useConfirm", () => ({ useConfirm: () => vi.fn() }))
import { WeekView } from "./weekView"
import { HueBlock } from "./HueBlock"
import { pinTestClock } from "@/lib/testing/testClock"

// gcal-14: what a project's, a channel's or a team's calendar fills itself
// with (a task, a milestone, someone's time off) is drawn apart in every view
// and named with where it comes from, the week's all-day rail and its timed
// grid included, even where a view names its blocks itself.
afterEach(cleanup)

const task: CalendarEventInterface = {
  event_uuid: "task:t-notes:1792540800",
  event_title: "Write launch notes",
  event_start_time: "2026-10-21T00:00:00Z",
  event_end_time: "2026-10-22T00:00:00Z",
  event_all_day: true,
  event_start_date: "2026-10-21",
  event_end_date: "2026-10-22",
  event_read_only: true,
  event_source: { kind: "task", id: "t-notes", href: "/app/task/t-notes", open: "Open task", from: "A task in Launch" },
}

const away: CalendarEventInterface = {
  event_uuid: "away:maya:1792573200",
  event_title: "Away",
  event_start_time: new Date(2026, 9, 21, 13).toISOString(),
  event_end_time: new Date(2026, 9, 21, 17).toISOString(),
  event_is_away: true,
  event_read_only: true,
  event_source: { kind: "person", id: "maya", href: "/app/user/maya", open: "Open profile", from: "Time off, on Design team's calendar" },
}

pinTestClock()

describe("the week draws what the work fills in apart", () => {
  it("in its all-day rail and in its timed grid, each named with where it comes from", () => {
    render(<WeekView weekStart={new Date(2026, 9, 19)} events={[task, away]} tasks={[]} showEvents showTasks onEventClick={vi.fn()} onTaskClick={vi.fn()} />)
    const chip = screen.getByRole("button", { name: /Write launch notes, A task in Launch$/ })
    expect(chip.getAttribute("data-derived")).toBe("task")
    const block = screen.getByRole("button", { name: /^Away, .*, Time off, on Design team's calendar$/ })
    expect(block.getAttribute("data-derived")).toBe("person")
  })

  it("keeps a view's own name for a block and adds where it comes from", () => {
    render(<HueBlock item={{ ...task, event_source: { ...task.event_source!, kind: "milestone", from: "A milestone of Launch" } }} variant="bar" aria-label="Event: Beta ships" />)
    expect(screen.getByRole("button", { name: "Event: Beta ships, A milestone of Launch" }).getAttribute("data-derived")).toBe("milestone")
  })
})

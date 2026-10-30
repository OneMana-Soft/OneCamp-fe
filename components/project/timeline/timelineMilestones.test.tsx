import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"

import { pinTestClock } from "@/lib/testing/testClock"
import { DAY_WIDTH, offsetOf, timelineRange } from "@/lib/timeline"
import { dayDate } from "@/lib/utils/timeZone"
import type { Milestone } from "@/lib/work/milestones"
import { TimelineMilestones, datedMilestones, milestonesHeight } from "./TimelineMilestones"
import { GROUP_HEIGHT, ROW_HEIGHT } from "./TimelineRows"

// The project's milestones above its tasks on the timeline (linear-16): a row
// for each one with a day, its diamond on the target day and a thin bar over
// its tasks' days; a failed read says so in the heading, with Try again.

pinTestClock()
afterEach(cleanup)

const milestone = (over: Partial<Milestone>): Milestone => ({
  id: "m",
  project_uuid: "p",
  name: "Beta",
  description: "",
  target_date: null,
  progress: { total: 4, started: 1, done: 1 },
  home: true,
  projects: [],
  hidden_projects: 0,
  next: false,
  can_edit: true,
  ...over,
})

const draw = (list: Milestone[], retry?: () => void) => {
  const shown = datedMilestones(list)
  const today = new Date()
  const range = timelineRange(shown.map((d) => d.days), today, "week")
  const view = render(
    <TimelineMilestones shown={shown} range={range} dayWidth={DAY_WIDTH.week} nameWidth={260} gridWidth={range.days * DAY_WIDTH.week} today={today} backdrop={<div data-backdrop="" />} retry={retry} />,
  )
  return { ...view, range, shown }
}

describe("milestones on the project's timeline", () => {
  it("draws a row for each milestone with a day, its diamond on the target day and a bar over its tasks' days", () => {
    const beta = milestone({ id: "beta", name: "Beta", target_date: "2026-11-30", starts: "2026-11-02T12:00:00Z", ends: "2026-11-20T12:00:00Z", next: true })
    const later = milestone({ id: "later", name: "Later" }) // no day: not on the timeline
    const launch = milestone({ id: "launch", name: "Launch", target_date: "2026-12-15", progress: { total: 2, started: 0, done: 2 } })
    const { container, range } = draw([beta, later, launch])
    expect(screen.getAllByRole("listitem").map((li) => li.getAttribute("data-milestone"))).toEqual(["beta", "launch"])
    const block = container.querySelector<HTMLElement>("[data-timeline-milestones]")!
    expect(block.style.height).toBe(`${milestonesHeight(2)}px`)
    expect(milestonesHeight(2)).toBe(GROUP_HEIGHT + 2 * ROW_HEIGHT)
    expect(container.querySelector("[data-backdrop]")).toBeTruthy()

    const row = container.querySelector<HTMLElement>('[data-milestone="beta"]')!
    const mark = row.querySelector<HTMLElement>("[data-milestone-target]")!
    expect(mark.style.left).toBe(`${offsetOf(dayDate("2026-11-30")!, range, DAY_WIDTH.week) + DAY_WIDTH.week / 2}px`)
    expect(mark.querySelector("[data-milestone-mark]")!.getAttribute("data-milestone-mark")).toBe("next")
    const bar = row.querySelector<HTMLElement>("[data-milestone-bar]")!
    expect(bar.style.left).toBe(`${offsetOf(dayDate("2026-11-02")!, range, DAY_WIDTH.week)}px`)
    // A finished one is green, with no bar when none of its tasks is dated.
    const done = container.querySelector<HTMLElement>('[data-milestone="launch"]')!
    expect(done.querySelector("[data-milestone-bar]")).toBeNull()
    expect(done.querySelector("[data-milestone-target] [data-milestone-mark]")!.getAttribute("data-milestone-mark")).toBe("finished")
    // Its words: the name, the target day, and its progress for a screen reader.
    expect(row.textContent).toContain("Beta")
    expect(row.textContent).toContain("1 of 4 done · 1 started")
  })

  it("isn't there when no milestone has a day", () => {
    const { container } = draw([milestone({ id: "later" })])
    expect(container.querySelector("[data-timeline-milestones]")).toBeNull()
    expect(milestonesHeight(0)).toBe(0)
  })

  it("says a read that failed in its heading, and Try again reads them again", () => {
    const retry = vi.fn()
    const { container } = draw([], retry)
    expect(container.querySelector<HTMLElement>("[data-timeline-milestones]")!.style.height).toBe(`${GROUP_HEIGHT}px`)
    fireEvent.click(screen.getByRole("button", { name: /Couldn't load the milestones\. Try again/ }))
    expect(retry).toHaveBeenCalledTimes(1)
  })
})

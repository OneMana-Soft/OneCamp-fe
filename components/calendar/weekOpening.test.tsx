import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { addDays, startOfWeek } from "date-fns"

import type { CalendarEventInterface } from "@/types/calendar"
import type { TaskInfoInterface } from "@/types/task"
import { pinTestClock } from "@/lib/testing/testClock"
import { HOUR_HEIGHT, WeekView } from "./weekView"

// Thursday 15 Oct 2026, 8 am on the clock the grid reads.
const NOW = new Date(2026, 9, 15, 8, 0)
pinTestClock(NOW)
afterEach(cleanup)

const monday = startOfWeek(NOW, { weekStartsOn: 1 })
const at = (day: number, hours: number, minutes = 0) => new Date(2026, 9, 12 + day, hours, minutes).toISOString()
const meeting = (id: string, day: number, from: [number, number], to: [number, number]): CalendarEventInterface => ({
  event_uuid: id,
  event_title: id,
  event_start_time: at(day, ...from),
  event_end_time: at(day, ...to),
})
// The demo's week: every meeting in the evening (pages review, 16 Oct).
const evening = [meeting("Launch sync", 3, [18, 45], [19, 30]), meeting("Design crit", 4, [19, 0], [20, 0])]

function week(events: CalendarEventInterface[], tasks: TaskInfoInterface[] = []) {
  return render(
    <WeekView weekStart={monday} events={events} tasks={tasks} showEvents showTasks onEventClick={vi.fn()} onTaskClick={vi.fn()} />,
  )
}
const scroller = () => document.querySelector<HTMLElement>("[data-week-scroll]")!
// Opens on an hour's line, with the label clear of the top.
const topAt = (hour: number) => hour * HOUR_HEIGHT - 12

describe("a week grid's first scroll", () => {
  it("opens on the evening's meetings, not an empty working day", () => {
    week(evening)
    expect(scroller().scrollTop).toBe(topAt(17))
  })

  it("follows the meetings as they land, until the person scrolls", () => {
    const view = week([])
    expect(scroller().scrollTop).toBe(topAt(7))
    view.rerender(<WeekView weekStart={monday} events={evening} tasks={[]} showEvents showTasks onEventClick={vi.fn()} onTaskClick={vi.fn()} />)
    expect(scroller().scrollTop).toBe(topAt(17))

    // Once they have scrolled, a meeting arriving leaves the grid where they put it.
    fireEvent.wheel(scroller())
    scroller().scrollTop = topAt(12)
    const earlier = [...evening, meeting("Breakfast", 3, [9, 0], [9, 30])]
    view.rerender(<WeekView weekStart={monday} events={earlier} tasks={[]} showEvents showTasks onEventClick={vi.fn()} onTaskClick={vi.fn()} />)
    expect(scroller().scrollTop).toBe(topAt(12))
  })

  it("shows now with the next meeting when both fit", () => {
    week([meeting("Standup", 3, [10, 0], [10, 15])])
    expect(scroller().scrollTop).toBe(topAt(7))
  })

  // Hidden on screen beside now's pill (data-[beside-now]:invisible), and
  // drawn, so that paper, which has no pill, prints every hour.
  it("hides the hour label beside now on today's week only, and keeps it for print", () => {
    week([])
    expect(screen.getByText("8 AM").hasAttribute("data-beside-now")).toBe(true)
    expect(screen.getByText("9 AM").hasAttribute("data-beside-now")).toBe(false)
    cleanup()
    render(<WeekView weekStart={addDays(monday, 7)} events={[]} tasks={[]} showEvents showTasks onEventClick={vi.fn()} onTaskClick={vi.fn()} />)
    expect(screen.getByText("8 AM").hasAttribute("data-beside-now")).toBe(false)
  })
})

describe("the all-day lane's +N", () => {
  const task = (i: number): TaskInfoInterface =>
    ({ task_uuid: `t${i}`, task_name: `Task number ${i}`, task_due_date: at(3, 12), task_status: "todo" }) as TaskInfoInterface

  it("opens that day's list once the lane is open, where it used to do nothing", async () => {
    const onTaskClick = vi.fn()
    render(
      <WeekView weekStart={monday} events={[]} tasks={[1, 2, 3, 4, 5].map(task)} showEvents showTasks onEventClick={vi.fn()} onTaskClick={onTaskClick} />,
    )
    // The list is a chunk of its own: "+2" turns into its button once it lands.
    // The test waits for the chunk, not a clock: under load its first import
    // took longer than findByRole's second.
    await act(async () => {
      await import("./railMore")
    })
    const more = await screen.findByRole("button", { name: "2 more on Thursday 15 October" })
    await act(async () => fireEvent.click(more))
    const list = document.querySelector("[data-rail-more]")!
    expect(list.textContent).toContain("5 all day")
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Task: Task number 5" })))
    expect(onTaskClick).toHaveBeenCalledWith("t5")
  })
})

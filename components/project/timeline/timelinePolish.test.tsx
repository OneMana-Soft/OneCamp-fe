import { cleanup, render } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { pinTestClock } from "@/lib/testing/testClock"
import { HUE_CLASS } from "@/components/ui/graphics/hues"

pinTestClock()

// T-1, the timeline's polish (DESIGN-BUILD-3, 20 Oct, from F-1 #4's shots):
// a group's header cut mid-word at 390 ("To…", "In p…"), a month with a
// sliver in view showed "S…" at the chart's edge, and the client's timeline
// drew blue bars under the project's teal mark.

vi.mock("@/hooks/useFetch", () => {
  const nothing = () => ({ data: undefined, isLoading: false, isError: false, mutate: () => Promise.resolve() })
  return { useFetch: nothing, useFetchOnlyOnce: nothing }
})
vi.mock("react-redux", async (orig) => ({ ...(await orig<typeof import("react-redux")>()), useSelector: () => "" }))

const { ProjectTimeline } = await import("./ProjectTimeline")
const { TimelineGroupRow } = await import("./TimelineRows")
const { TimelineHeader } = await import("./TimelineHeader")

afterEach(cleanup)

const day = (d: number) => new Date(2026, 9, d, 17).toISOString()
const tasks = [{ task_uuid: "t1", task_name: "Write the brief", task_status: "todo", task_start_date: day(19), task_due_date: day(22) }]

describe("the timeline's polish", () => {
  it("takes the hue it's given: a client's view draws in the project's colour", () => {
    const { container } = render(<ProjectTimeline projectId="" tasks={tasks} hue="moss" onOpenTask={() => {}} />)
    const root = container.querySelector("[data-timeline]") as HTMLElement
    for (const c of HUE_CLASS.moss.split(" ")) expect(root.classList.contains(c)).toBe(true)
  })

  it("lets a group's name run past the names column, so it's never cut mid-word", () => {
    const { container } = render(
      <TimelineGroupRow id="todo" top={0} width={900} nameWidth={120} first label="In progress" count={10} collapsed={false} status={undefined} onToggle={() => {}} />,
    )
    const button = container.querySelector("[data-timeline-group] button") as HTMLElement
    expect(button.style.width).toBe("")
    expect(button.style.minWidth).toBe("120px")
    expect(container.querySelector("[data-timeline-group] .truncate")).toBeNull()
  })

  it("shows a month's name whole or not at all at the chart's edge", () => {
    const { container } = render(
      <TimelineHeader range={{ from: new Date(2026, 8, 28), days: 63 }} zoom="week" dayWidth={16} today={new Date(2026, 9, 20)} nameWidth={240} />,
    )
    const labels = [...container.querySelectorAll<HTMLElement>("[data-month-label]")]
    expect(labels.length).toBeGreaterThan(0)
    // A one-line box that wraps: a word wider than the room goes to the hidden
    // second line, rather than to "S…".
    for (const l of labels) {
      expect(l.className).toMatch(/flex-wrap/)
      expect(l.className).toMatch(/overflow-hidden/)
      expect(l.querySelector(".truncate")).toBeNull()
      // The empty first item is a line tall, so the hidden second line stays hidden.
      expect((l.firstElementChild as HTMLElement).className).toMatch(/\bh-6\b/)
    }
  })

  it("ends the month's name before the Today pill when the pill is in its month", () => {
    // Weeks at 16 px a day from 28 Sep; today, 20 Oct, is 22 days in: the pill's centre is 360 px.
    const { container } = render(
      <TimelineHeader range={{ from: new Date(2026, 8, 28), days: 63 }} zoom="week" dayWidth={16} today={new Date(2026, 9, 20)} nameWidth={240} />,
    )
    const october = [...container.querySelectorAll<HTMLElement>("[data-month-label]")].find((l) => l.textContent?.startsWith("October"))!
    // October starts 3 days in (48 px); its name's room ends at the pill's left (360 - 22) less 8: 330 - 48 = 282 px.
    expect(october.style.maxWidth).toContain("282px")
  })

  // V-223: on a month's first day the pill sits on the month's start, so its stop falls in the month before, and
  // the month's own name kept its whole room and sat under the pill. It begins after the pill (and 8 px).
  const label = (c: HTMLElement, month: string) => [...c.querySelectorAll<HTMLElement>("[data-month-label]")].find((l) => l.textContent?.startsWith(month))!

  it("begins a month's name after the Today pill when the pill sits on the month's first day", () => {
    // Weeks at 16 px a day from 28 Sep: November starts 34 days in (544 px) and ends at 1,024 px; today, 1 Nov, puts
    // the pill's centre at 552 px. October ends before it (552 - 22 - 8 = 522: 474 px of room from 48).
    const { container } = render(
      <TimelineHeader range={{ from: new Date(2026, 8, 28), days: 70 }} zoom="week" dayWidth={16} today={new Date(2026, 10, 1)} nameWidth={240} />,
    )
    expect(label(container, "October").style.maxWidth).toContain("474px")
    expect(label(container, "October").style.marginLeft).toBe("")
    // November begins at the pill's right edge and 8 px (552 + 22 + 8 = 582), 38 px into its month: 442 px of room.
    expect(label(container, "November").style.marginLeft).toBe("38px")
    expect(label(container, "November").style.maxWidth).toContain("442px")
  })

  it("begins the next month's name after the pill on a month's last day, where the pill runs over its start", () => {
    // Today, 31 Oct, 33 days in: the pill's centre is 536 px and its right edge 558, past November's start (544).
    const { container } = render(
      <TimelineHeader range={{ from: new Date(2026, 8, 28), days: 70 }} zoom="week" dayWidth={16} today={new Date(2026, 9, 31)} nameWidth={240} />,
    )
    expect(label(container, "October").style.maxWidth).toContain("458px")
    expect(label(container, "November").style.marginLeft).toBe("22px")
    expect(label(container, "November").style.maxWidth).toContain("458px")
  })

  it("does the same by day, where a day is 36 px", () => {
    // Days from Monday 26 Oct: November starts 6 days in (216 px); the pill's centre is 234 px on 1 Nov.
    const { container } = render(
      <TimelineHeader range={{ from: new Date(2026, 9, 26), days: 56 }} zoom="day" dayWidth={36} today={new Date(2026, 10, 1)} nameWidth={240} />,
    )
    expect(label(container, "November").style.marginLeft).toBe("48px")
  })
})

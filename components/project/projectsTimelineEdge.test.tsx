import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, renderHook, screen } from "@testing-library/react"
import type { ReactNode } from "react"
import { startOfDay } from "date-fns"

import type { ProjectOverview } from "@/lib/projectsOverview"
import type { ProjectPlan } from "@/lib/work/projectPlan"
import { SCROLL_X, VIEW_W, offViewRoom, useTimelineView } from "@/hooks/useTimelineView"
import { DAY_WIDTH, offsetOf, timelineRange } from "@/lib/timeline"
import { resetGrowForTests } from "@/hooks/useGrow"
import { pinTestClock } from "@/lib/testing/testClock"

vi.mock("next/link", () => ({ default: ({ children, href, ...rest }: { children: ReactNode; href: string }) => <a href={href} {...rest}>{children}</a> }))
// The milestones' diamonds come in a chunk of their own: none here.
vi.mock("next/dynamic", () => ({ default: () => () => null }))

import { ProjectsTimeline } from "@/components/project/ProjectsTimeline"

const plan = (o: Partial<ProjectPlan> = {}): ProjectPlan => ({
  lead: null,
  start: null,
  target: null,
  priority: "",
  status: { category: "planned", name: "Planned", color: "" },
  labels: null,
  ...o,
})
const project = (name: string, over: Partial<ProjectOverview> = {}): ProjectOverview => ({
  project_uuid: `p-${name}`,
  project_name: name,
  is_admin: 1,
  open: 3,
  done: 1,
  overdue: 0,
  due_soon: 0,
  ...over,
})
// Mobile app runs from its tasks' first day to its target, 1 Sep to 30 Sep, late with work open; Launch runs Q2 2027
// to the end of June with nothing open.
const MOBILE = project("Mobile app", { first_day: "2026-09-01T12:00:00Z", last_day: "2026-10-01T12:00:00Z", plan: plan({ target: { date: "2026-09-30", resolution: "day" } }) })
const LAUNCH = project("Launch", { open: 0, plan: plan({ start: { date: "2027-04-01", resolution: "quarter" }, target: { date: "2027-06-01", resolution: "month" } }) })
/** A project's chip at one edge of its row: the row holds its bar. */
const chip = (id: string, side: "before" | "after") => document.querySelector(`[data-project-bar="${id}"]`)!.parentElement!.querySelector<HTMLElement>(`[data-off-view="${side}"]`)!

const zone = process.env.TZ
pinTestClock()
beforeEach(() => {
  window.localStorage.clear()
  resetGrowForTests()
})
afterEach(() => {
  cleanup()
  if (zone === undefined) delete process.env.TZ
  else process.env.TZ = zone
})

describe("the projects timeline, by its plans (linear-15)", () => {
  // new Date("2026-09-30") is UTC's midnight: in New York, the 29th. A plan's days are days where the viewer is.
  it("draws a plan's days where the viewer is, so a bar to 30 Sep ends on the 30th in New York too", () => {
    process.env.TZ = "America/New_York"
    render(<ProjectsTimeline projects={[project("Mobile app", { plan: plan({ start: { date: "2026-09-01", resolution: "day" }, target: { date: "2026-09-30", resolution: "day" } }) })]} />)
    expect(screen.getByRole("link", { name: /^Mobile app, 1 Sep to 30 Sep, / })).toBeTruthy()
  })

  // V-256: a project whose bar lay wholly out of view opened as an empty row, with no hint where its bar was or that
  // it was late, and Today couldn't find it.
  it("points to each bar from both edges of its row: the bar's nearest day and an arrow, in danger ink when the project is late", () => {
    render(<ProjectsTimeline projects={[MOBILE, LAUNCH]} />)
    expect(chip("p-Mobile app", "before").textContent).toBe("30 Sep")
    expect(chip("p-Mobile app", "after").textContent).toBe("1 Sep")
    expect(chip("p-Mobile app", "before").className).toContain("text-danger-ink")
    expect(chip("p-Launch", "after").textContent).toBe("1 Apr 2027")
    expect(chip("p-Launch", "before").textContent).toBe("30 Jun 2027")
    expect(chip("p-Launch", "after").className).toContain("text-ink-2")
    expect(chip("p-Launch", "after").className).not.toContain("text-danger-ink")
    // Each is a pointer's: the bar's own link is the way in for a keyboard and a screen reader, and says it's late.
    expect(chip("p-Launch", "after").getAttribute("tabindex")).toBe("-1")
    expect(chip("p-Launch", "after").getAttribute("aria-hidden")).toBe("true")
    expect(screen.getByRole("link", { name: /^Mobile app, 1 Sep to 30 Sep, late, / })).toBeTruthy()
    expect(screen.getByRole("link", { name: /^Launch, 1 Apr 2027 to 30 Jun 2027, \d+% done/ })).toBeTruthy()
  })

  it("shows a chip only while its bar is wholly out of view on its side, by the scroll's variables: a scroll draws nothing", () => {
    expect(offViewRoom("before", 480)).toBe(`max(0px, calc((var(${SCROLL_X}, 0px) - 480px) * 999))`)
    expect(offViewRoom("after", 1200)).toBe(`max(0px, calc((1200px - var(${SCROLL_X}, 0px) - var(${VIEW_W}, 100vw)) * 999))`)
    render(<ProjectsTimeline projects={[MOBILE]} />)
    const bar = document.querySelector<HTMLElement>('[data-project-bar="p-Mobile app"]')!
    const left = parseFloat(bar.style.left)
    const right = left + parseFloat(bar.style.width)
    expect(chip("p-Mobile app", "before").parentElement!.style.maxWidth).toBe(offViewRoom("before", right))
    expect(chip("p-Mobile app", "after").parentElement!.style.maxWidth).toBe(offViewRoom("after", left))
  })

  it("scrolls the timeline to a bar when its chip is pressed: its end two thirds across the view, or its start a third", () => {
    const scrollTo = vi.fn()
    const had = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "scrollTo")
    Object.defineProperty(HTMLElement.prototype, "scrollTo", { value: scrollTo, configurable: true })
    // jsdom lays nothing out: the scroller is 1,000 px wide here, so 740 px of grid are in view beside the names.
    Object.defineProperty(HTMLElement.prototype, "clientWidth", {
      configurable: true,
      get(this: HTMLElement) {
        return this.getAttribute("role") === "region" ? 1000 : 0
      },
    })
    try {
      render(<ProjectsTimeline projects={[MOBILE, LAUNCH]} />)
      const today = startOfDay(new Date())
      const range = timelineRange(
        [
          { start: new Date(2026, 8, 1), end: new Date(2026, 8, 30) },
          { start: new Date(2027, 3, 1), end: new Date(2027, 5, 30) },
        ],
        today,
        "week",
      )
      const at = (day: Date, part: number) => Math.max(0, offsetOf(day, range, DAY_WIDTH.week) + DAY_WIDTH.week / 2 - (1000 - 260) * part)
      fireEvent.click(chip("p-Mobile app", "before"))
      expect(scrollTo).toHaveBeenLastCalledWith({ left: at(new Date(2026, 8, 30), 2 / 3), behavior: "smooth" })
      fireEvent.click(chip("p-Launch", "after"))
      expect(scrollTo).toHaveBeenLastCalledWith({ left: at(new Date(2027, 3, 1), 1 / 3), behavior: "smooth" })
    } finally {
      if (had) Object.defineProperty(HTMLElement.prototype, "scrollTo", had)
      else delete (HTMLElement.prototype as unknown as { scrollTo?: unknown }).scrollTo
      // Element.prototype's own clientWidth shows through again.
      delete (HTMLElement.prototype as unknown as { clientWidth?: unknown }).clientWidth
    }
  })

  it("keeps the grid's width in view in a CSS variable beside the scroll, both set where the view is placed", () => {
    const el = document.createElement("div")
    Object.defineProperty(el, "clientWidth", { configurable: true, value: 1000 })
    const today = new Date(2026, 9, 15)
    const range = timelineRange([], startOfDay(today), "week")
    const scrollRef = { current: null as HTMLDivElement | null }
    const { result } = renderHook(() => useTimelineView({ scrollRef, range, dayWidth: 16, nameWidth: 260, spans: [], today, ready: true }))
    act(() => result.current.scrollerRef(el))
    expect(el.style.getPropertyValue(VIEW_W)).toBe("740px")
    expect(el.style.getPropertyValue(SCROLL_X)).toBe(`${el.scrollLeft}px`)
  })
})

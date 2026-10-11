import "@/components/project/timeline/timelineTestKit"
import { afterEach, describe, expect, it } from "vitest"
import { cleanup, render } from "@testing-library/react"

import { ProjectTimeline } from "@/components/project/timeline/ProjectTimeline"
import { resetGrowForTests } from "@/hooks/useGrow"

/**
 * Reduced motion in the work area (work.md §1.6.3): the timeline's bars are
 * drawn at their final size (data-grown="instant"); with motion allowed, the
 * first reveal grows them.
 */
const at = (d: number) => new Date(2026, 9, d, 17).toISOString()
const tasks = [{ task_uuid: "a", task_name: "Write the launch announcement", task_status: "inProgress", task_start_date: at(10), task_due_date: at(12) }]

function motion(reduce: boolean) {
  window.matchMedia = ((q: string) => ({ matches: reduce && q.includes("reduce"), media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false })) as unknown as typeof window.matchMedia
}

afterEach(() => {
  cleanup()
  resetGrowForTests()
  // @ts-expect-error jsdom has none; each test sets its own
  delete window.matchMedia
})

describe("the timeline under reduced motion", () => {
  it("draws its bars at their final size", () => {
    motion(true)
    const { container } = render(<ProjectTimeline projectId="p" tasks={tasks} onOpenTask={() => {}} />)
    const fill = container.querySelector("[data-bar-fill]")!
    expect(fill.getAttribute("data-grown")).toBe("instant")
  })

  it("grows them on first reveal when motion is allowed", () => {
    motion(false)
    const { container } = render(<ProjectTimeline projectId="p" tasks={tasks} onOpenTask={() => {}} />)
    const fill = container.querySelector<HTMLElement>("[data-bar-fill]")!
    expect(fill.getAttribute("data-grown")).toBe("animate")
    expect(fill.style.animation).toContain("work-grow-x")
  })
})

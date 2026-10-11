import "./timelineTestKit"
import { afterEach, describe, expect, it } from "vitest"
import { cleanup, render } from "@testing-library/react"

import { ProjectTimeline } from "@/components/project/timeline/ProjectTimeline"
import { TimelineBar } from "@/components/project/timeline/TimelineBar"
import { bubbleLabel } from "@/lib/timeline"

afterEach(cleanup)

/**
 * Timeline bars (design v3, work.md W24): each in its status's camp tint,
 * never a washed bg-*\/10; late bars grow a hatched tail up to today; a
 * dependency the plan can't keep is a dashed danger path with a "!".
 */
const at = (d: number) => new Date(2026, 9, d, 17).toISOString()
const base = { left: 40, width: 160, label: "8 Oct to 12 Oct", late: false, done: false, canEdit: true, stickAt: 264, blocked: 0, onPointerDown: () => {}, onKeyDown: () => {}, onClick: () => {} }
const task = { task_uuid: "a", task_name: "Write the launch announcement", task_status: "inProgress" }

describe("timeline bars", () => {
  it("fill with their status's tint, with a cap in the strong cut", () => {
    const { container } = render(<TimelineBar {...base} task={task} hue="sun" />)
    const bar = container.querySelector<HTMLElement>("[data-bar]")!
    expect(bar.className).toContain("hue-sun")
    const fill = container.querySelector<HTMLElement>("[data-bar-fill]")!
    expect(fill.className).toContain("bg-hue-tint")
    expect(container.innerHTML).not.toMatch(/bg-\w+-\d+\/10/)
    expect(fill.querySelector(".bg-hue")).not.toBeNull()
  })

  it("draw a late bar's tail up to today, and none when on time", () => {
    const late = render(<TimelineBar {...base} task={task} hue="sun" late lateTail={48} />)
    expect(late.container.querySelector<HTMLElement>("[data-late-tail]")!.style.width).toBe("48px")
    cleanup()
    expect(render(<TimelineBar {...base} task={task} hue="sun" />).container.querySelector("[data-late-tail]")).toBeNull()
  })

  it("lift over a ghost of where they were, with the date bubble, while dragged", () => {
    const { container } = render(<TimelineBar {...base} task={task} hue="sun" bubble="Tue 14 → Fri 17 Oct" shift={48} ghost={{ left: 40, width: 160 }} />)
    expect(container.querySelector("[data-bar-ghost]")!.className).toContain("opacity-30")
    expect(container.querySelector("[data-date-bubble]")!.textContent).toBe("Tue 14 → Fri 17 Oct")
    expect(container.querySelector<HTMLElement>("[data-bar]")!.style.transition).toContain("80ms")
  })

  it("write the bubble's dates as the spec does", () => {
    expect(bubbleLabel({ start: new Date(2026, 9, 13), end: new Date(2026, 9, 16) })).toBe("Tue 13 → Fri 16 Oct")
    expect(bubbleLabel({ start: new Date(2026, 9, 30), end: new Date(2026, 10, 2) })).toBe("Fri 30 Oct → Mon 2 Nov")
  })

  it("dash a dependency the plan can't keep, in danger, with a '!'", () => {
    const tasks = [
      { task_uuid: "plan", task_name: "Plan the load test", task_status: "inProgress", task_start_date: at(5), task_due_date: at(12) },
      { task_uuid: "run", task_name: "Run the load test", task_status: "todo", task_start_date: at(8), task_due_date: at(14), task_blocked_by: [{ task_uuid: "plan" }] },
    ]
    const { container } = render(<ProjectTimeline projectId="p" tasks={tasks} onOpenTask={() => {}} />)
    const path = container.querySelector<SVGPathElement>("path[data-broken]")!
    expect(path.getAttribute("stroke-dasharray")).toBe("4 3")
    expect(path.style.stroke).toBe("var(--destructive)")
    expect(container.querySelector("[data-conflict]")!.getAttribute("data-tip")).toContain("Plan the load test")
  })
})

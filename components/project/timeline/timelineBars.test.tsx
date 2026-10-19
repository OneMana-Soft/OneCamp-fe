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
  // Step 3, part 3 (the rivals review, 16 Oct): bars were each status's pale
  // tint, a field of outlines. Now a bar is its project's hue in the a2 cut
  // with white words, the one pairing over 4.5:1 for all six hues in both
  // themes (paletteContrast.test); its status is in its glyphs and the late tail.
  it("fill with their project's hue in the a2 cut, with the name in white", () => {
    const { container, getByText } = render(<TimelineBar {...base} width={300} task={task} hue="sun" />)
    const bar = container.querySelector<HTMLElement>("[data-bar]")!
    expect(bar.className).toContain("hue-sun")
    const fill = container.querySelector<HTMLElement>("[data-bar-fill]")!
    expect(fill.className).toContain("bg-[var(--hue-a2)]")
    expect(fill.className).not.toContain("bg-hue-tint")
    expect(container.innerHTML).not.toMatch(/bg-\w+-\d+\/10/)
    expect(getByText("Write the launch announcement").closest("[data-bar-name]")!.className).toContain("text-white")
  })

  it("let a done bar step back to the project's tint, with its check and the hue's ink", () => {
    const { container, getByText } = render(<TimelineBar {...base} width={300} task={{ ...task, task_status: "done" }} hue="sun" done />)
    expect(container.querySelector<HTMLElement>("[data-bar-fill]")!.className).toContain("bg-hue-tint")
    expect(getByText("Write the launch announcement").closest("[data-bar-name]")!.className).toContain("text-hue-ink")
  })

  it("carry the assignee's face on any bar 40 px wide, the name beside a bar too short for it", () => {
    const who = { user_uuid: "u1", user_full_name: "Maya Chen" }
    const short = render(<TimelineBar {...base} width={48} task={{ ...task, task_assignee: who }} hue="sun" />)
    expect(short.container.querySelector("[data-bar] [data-bar-face]")).not.toBeNull()
    // The name is beside it, outside.
    expect(short.container.querySelector("[data-bar-name]")).toBeNull()
    cleanup()
    const narrow = render(<TimelineBar {...base} width={32} task={{ ...task, task_assignee: who }} hue="sun" />)
    expect(narrow.container.querySelector("[data-bar-face]")).toBeNull()
  })

  it("draw a milestone as a diamond in the a2 cut with a halo", () => {
    const { container } = render(<TimelineBar {...base} task={task} hue="sun" milestone />)
    const diamond = container.querySelector<HTMLElement>("[data-milestone]")!
    expect(diamond.className).toContain("bg-[var(--hue-a2)]")
    expect(diamond.className).toContain("ring-2")
    expect(diamond.className).toContain("rotate-45")
  })

  it("give every bar its project's hue, whatever its status", async () => {
    const { projectHue } = await import("@/lib/projectHue")
    const tasks = [
      { task_uuid: "a", task_name: "Plan the load test", task_status: "inProgress", task_start_date: at(5), task_due_date: at(12) },
      { task_uuid: "b", task_name: "Write it up", task_status: "inReview", task_start_date: at(6), task_due_date: at(13) },
      { task_uuid: "c", task_name: "Ship it", task_status: "done", task_start_date: at(7), task_due_date: at(9) },
    ]
    const { container } = render(<ProjectTimeline projectId="p-hue" tasks={tasks} onOpenTask={() => {}} />)
    const hues = Array.from(container.querySelectorAll<HTMLElement>("[data-bar]")).map((b) => b.dataset.hue)
    expect(hues).toEqual([projectHue("p-hue"), projectHue("p-hue"), projectHue("p-hue")])
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

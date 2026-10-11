import { afterEach, describe, expect, it } from "vitest"
import { cleanup, render } from "@testing-library/react"

import { TaskStatusCell } from "@/components/task/taskStatusCell"
import { STATUS_COLORS, STATUS_HUES, STORED_NAME, colorDot, statusHueOf, statusOptions, type ProjectStatuses } from "@/lib/taskStatus"

afterEach(cleanup)

/**
 * Status is a shape before it is a colour (work.md §1.4, W01): every status a
 * project can have draws its category's glyph, and a project's own status
 * takes one of the camp hues its category allows. The 17 Tailwind colours
 * fold onto those hues, so every colour already stored keeps working.
 */
const project: ProjectStatuses = {
  built_in: [],
  custom: [
    { id: "qa", project_id: "p", name: "QA", category: "inReview", color: "rose", position: 0 },
    { id: "design", project_id: "p", name: "Design", category: "inProgress", color: "sky", position: 0 },
    { id: "shipped", project_id: "p", name: "Shipped", category: "done", color: "teal", position: 0 },
  ],
  colors: [],
  max: 20,
}

const SHAPE = { backlog: "backlog", todo: "todo", inProgress: "progress", inReview: "review", done: "done", canceled: "cancelled" } as const

describe("status shapes", () => {
  it("draws every status a project has as its category's glyph, never a dot", () => {
    for (const option of statusOptions(project)) {
      const { container } = render(<TaskStatusCell status={option} />)
      const glyph = container.querySelector("[data-status-glyph]")
      expect(glyph?.getAttribute("data-status-glyph"), option.label).toBe(SHAPE[option.category])
      expect(container.querySelector(".rounded-full")).toBeNull()
      cleanup()
    }
  })

  it("draws a project's own status in its own hue", () => {
    const qa = statusOptions(project).find((o) => o.value === "qa")!
    const { container } = render(<TaskStatusCell status={qa} label="tip" />)
    expect(container.querySelector("[data-status-glyph]")?.getAttribute("data-hue")).toBe("berry")
  })

  it("offers exactly the camp hue choices, stored as names the server knows", () => {
    expect(STATUS_COLORS).toEqual(["slate", "amber", "emerald", "teal", "sky", "violet", "rose"])
    expect(STATUS_HUES.backlog).toEqual(["neutral"])
    expect(STATUS_HUES.todo).toEqual(["neutral", "sky", "lake"])
    expect(STATUS_HUES.inProgress).toEqual(["sun", "sky", "lake", "berry"])
    expect(STATUS_HUES.inReview).toEqual(["dusk", "berry", "sky", "lake"])
    expect(STATUS_HUES.done).toEqual(["moss", "lake"])
    expect(STATUS_HUES.canceled).toEqual(["neutral"])
    for (const [hue, name] of Object.entries(STORED_NAME)) expect(statusHueOf(name)).toBe(hue)
  })

  it("folds the old Tailwind names onto the camp hues", () => {
    expect(statusHueOf("emerald")).toBe("moss")
    expect(statusHueOf("green")).toBe("moss")
    expect(statusHueOf("violet")).toBe("dusk")
    expect(statusHueOf("purple")).toBe("dusk")
    expect(statusHueOf("rose")).toBe("berry")
    expect(statusHueOf("red")).toBe("berry")
    expect(statusHueOf("cyan")).toBe("lake")
    expect(statusHueOf("blue")).toBe("sky")
    expect(statusHueOf("orange")).toBe("sun")
    expect(statusHueOf("slate")).toBe("neutral")
    expect(colorDot("emerald")).toContain("hue-moss")
    expect(colorDot("slate")).toBe("bg-ink-3")
  })
})

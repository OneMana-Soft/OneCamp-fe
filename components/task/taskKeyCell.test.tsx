import { afterEach, describe, expect, it } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"
import { TaskKeyCell, keyWidth } from "./TaskKeyCell"
import type { TaskInfoInterface } from "@/types/task"

afterEach(cleanup)

const task = (key?: string, type?: TaskInfoInterface["task_work_type"]) => ({ task_uuid: "t", task_name: "x", task_key: key, task_work_type: type }) as TaskInfoInterface

describe("a row's key (STEP4 #8)", () => {
  it("is as wide as the list's longest key, at least four characters, and nothing when no task has one", () => {
    expect(keyWidth([task("Q4-1"), task("LAUNC-128")])).toBe(9)
    expect(keyWidth([task("Q4-1")])).toBe(4)
    expect(keyWidth([task(), task()])).toBe(0)
  })

  it("keeps the type's slot whether or not the task has a type, so titles line up", () => {
    const { container } = render(
      <>
        <TaskKeyCell task={task("Q4-1")} />
        <TaskKeyCell task={task("Q4-2", { id: "b", builtin: "bug", name: "Bug", icon: "bug" })} />
      </>,
    )
    const cells = container.querySelectorAll("[data-task-key]")
    expect(cells).toHaveLength(2)
    for (const c of cells) expect(c.firstElementChild!.className).toContain("size-3.5")
    expect(screen.getByText("Q4-1").className).toContain("w-[var(--key-w)]")
  })

  it("draws the type's glyph, named for screen readers, once it has loaded", async () => {
    render(<TaskKeyCell task={task("Q4-2", { id: "b", builtin: "bug", name: "Bug", icon: "bug" })} />)
    expect(await screen.findByRole("img", { name: "Bug" }, { timeout: 5000 })).toBeTruthy()
  })
})

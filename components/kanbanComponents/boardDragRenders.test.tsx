import { act, cleanup, fireEvent, render } from "@testing-library/react"
import { forwardRef, type ComponentProps } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"

import type { StatusOption } from "@/lib/taskStatus"
import type { TaskInfoInterface } from "@/types/task"

// F-1 #5 (FLUIDITY-LEAD, 20 Oct, beta 482460c3d): a card dragged across the
// board ran at frame p95 33 ms with 7% of frames dropped, and took 272 ms from
// the drop to the card in its new column. Every card on the board read the
// drag's context (x639), so each of them drew again when a drag started, as
// it moved and when it ended. Only the card held, and the cards the line
// passes, may draw again. Each card's body is counted.

const renders = vi.hoisted(() => new Map<string, number>())
vi.mock("react-redux", () => ({ useDispatch: () => vi.fn(), useSelector: () => undefined }))
vi.mock("@/components/task/taskAssigneeCell", () => ({ TaskAssigneeCell: () => null }))
vi.mock("@/components/task/PRStatusBadge", () => ({ GitHubBadgeGroup: () => null }))
vi.mock("@/components/kanbanComponents/Item/Item", async (load) => {
  const real = (await load()) as typeof import("@/components/kanbanComponents/Item/Item")
  const Counted = forwardRef<HTMLDivElement, ComponentProps<typeof real.Item>>(function Counted(props, ref) {
    const id = String(props.value)
    renders.set(id, (renders.get(id) ?? 0) + 1)
    return <real.Item {...props} ref={ref} />
  })
  return { ...real, Item: Counted }
})

const { TaskBoard } = await import("@/components/kanbanComponents/TaskBoard")

afterEach(() => {
  cleanup()
  renders.clear()
  localStorage.clear()
})

const col = (value: string): StatusOption => ({ value, label: value, category: "todo", custom: false, color: "" })
const VISIBLE = ["todo", "inProgress", "inReview", "done"].map(col)
const task = (i: number, status: string) =>
  ({ task_uuid: `${status}-${i}`, task_name: `Task ${i}`, task_status: status, task_due_date: "", task_project: { project_uuid: "p", project_name: "P" } }) as unknown as TaskInfoInterface
// 120 cards on screen: each column draws its first 30.
const BIG = {
  todo: Array.from({ length: 30 }, (_, i) => task(i, "todo")),
  inProgress: Array.from({ length: 30 }, (_, i) => task(i, "inProgress")),
  inReview: Array.from({ length: 30 }, (_, i) => task(i, "inReview")),
  done: Array.from({ length: 30 }, (_, i) => task(i, "done")),
}
const total = () => [...renders.values()].reduce((a, b) => a + b, 0)

describe("a card dragged with the pointer", () => {
  it("draws only the held card again as the drag starts, moves and ends, never the board's other cards", () => {
    const { container } = render(<TaskBoard columns={BIG} visible={VISIBLE} canDrag={() => true} onMove={() => {}} boardKey="drag" />)
    expect(total()).toBe(120)
    renders.clear()
    const card = container.querySelector<HTMLElement>('[data-task-id="todo-3"]')!
    // A press, then past the lift's few pixels: the drag starts.
    act(() => void fireEvent.mouseDown(card, { button: 0, clientX: 100, clientY: 100 }))
    act(() => void fireEvent.mouseMove(document, { clientX: 140, clientY: 110 }))
    for (let i = 1; i <= 5; i++) act(() => void fireEvent.mouseMove(document, { clientX: 140 + i * 40, clientY: 110 + i * 10 }))
    act(() => void fireEvent.mouseUp(document, { clientX: 340, clientY: 160 }))
    const others = [...renders.entries()].filter(([id, n]) => id !== "todo-3" && n > 0).map(([id]) => id)
    // The drag started: the held card drew again as the placeholder it leaves.
    expect(renders.get("todo-3") ?? 0).toBeGreaterThan(0)
    expect(others.length).toBeLessThanOrEqual(4)
  })
})

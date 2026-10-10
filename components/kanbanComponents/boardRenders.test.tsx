import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render } from "@testing-library/react"
import { Profiler, forwardRef, type ComponentProps } from "react"

// Counts how often each card renders: the measure of a long board's cost.
const renders = new Map<string, number>()
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
import type { StatusOption } from "@/lib/taskStatus"
import type { TaskInfoInterface } from "@/types/task"

const col = (value: string): StatusOption => ({ value, label: value, category: "todo", custom: false, color: "" })
const VISIBLE = ["todo", "inProgress", "inReview", "done"].map(col)
const task = (i: number, status: string) =>
  ({ task_uuid: `${status}-${i}`, task_name: `Task ${i}`, task_status: status, task_due_date: "", task_project: { project_uuid: "p", project_name: "P" } }) as unknown as TaskInfoInterface
// 250 tasks; each column draws its first 30 (CARDS_PER_PAGE), so 120 cards are on screen.
const BIG = {
  todo: Array.from({ length: 90 }, (_, i) => task(i, "todo")),
  inProgress: Array.from({ length: 60 }, (_, i) => task(i, "inProgress")),
  inReview: Array.from({ length: 40 }, (_, i) => task(i, "inReview")),
  done: Array.from({ length: 60 }, (_, i) => task(i, "done")),
}
const total = () => [...renders.values()].reduce((a, b) => a + b, 0)

afterEach(() => {
  cleanup()
  renders.clear()
  localStorage.clear()
})

describe("a board of 250 tasks", () => {
  it("draws 120 cards once, and moving the line renders only the cards beside it", () => {
    let commits = 0
    const { container } = render(
      <Profiler id="board" onRender={() => commits++}>
        <TaskBoard columns={BIG} visible={VISIBLE} canDrag={() => true} onMove={() => {}} boardKey="renders" />
      </Profiler>,
    )
    expect(total()).toBe(120)
    renders.clear()
    const card = container.querySelector<HTMLElement>('[data-task-id="todo-0"]')!
    act(() => card.focus())
    act(() => void fireEvent.keyDown(card, { key: " " }))
    const onLift = total()
    act(() => void fireEvent.keyDown(document.activeElement!, { key: "ArrowDown" }))
    const onStep = total() - onLift
    // Picking up renders the held card and the card the line sits above; a
    // step renders the two cards the line leaves and reaches. Never a column.
    expect(onLift).toBeLessThanOrEqual(3)
    expect(onStep).toBeLessThanOrEqual(3)
    expect(commits).toBeGreaterThan(0)
  })

  it("renders no card again when new data changes nothing it shows", () => {
    const { rerender } = render(<TaskBoard columns={BIG} visible={VISIBLE} canDrag={() => true} onMove={() => {}} boardKey="renders" />)
    renders.clear()
    // The data rebuilt (a refetch, another task's edit): new arrays, the same tasks.
    const again = Object.fromEntries(Object.entries(BIG).map(([k, v]) => [k, [...v]]))
    rerender(<TaskBoard columns={again} visible={VISIBLE} canDrag={() => true} onMove={() => {}} boardKey="renders" />)
    expect(total()).toBe(0)
  })

  it("after a drop, renders only the moved card and its new neighbours", () => {
    const { container, rerender } = render(<TaskBoard columns={BIG} visible={VISIBLE} canDrag={() => true} onMove={() => {}} boardKey="renders" />)
    const card = container.querySelector<HTMLElement>('[data-task-id="todo-0"]')!
    act(() => card.focus())
    renders.clear()
    act(() => void fireEvent.keyDown(card, { key: " " }))
    act(() => void fireEvent.keyDown(document.activeElement!, { key: "ArrowRight" }))
    act(() => void fireEvent.keyDown(document.activeElement!, { key: " " }))
    const onDrop = total()
    // The server's copy arrives as the optimistic update leaves it: only the
    // moved task is a new object, and only two lists are new arrays.
    const moved = { ...BIG.todo[0], task_status: "inProgress" } as TaskInfoInterface
    renders.clear()
    rerender(
      <TaskBoard
        columns={{ ...BIG, todo: BIG.todo.slice(1), inProgress: [moved, ...BIG.inProgress] }}
        visible={VISIBLE}
        canDrag={() => true}
        onMove={() => {}}
        boardKey="renders"
      />,
    )
    expect(onDrop).toBeLessThan(10)
    expect(total()).toBeLessThanOrEqual(2)
  })
})

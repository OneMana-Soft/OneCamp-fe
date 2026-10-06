import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"

vi.mock("react-redux", () => ({ useDispatch: () => vi.fn(), useSelector: () => undefined }))
vi.mock("@/components/task/taskAssigneeCell", () => ({ TaskAssigneeCell: () => null }))
vi.mock("@/components/task/PRStatusBadge", () => ({ GitHubBadgeGroup: () => null }))

const { TaskBoard, CARDS_PER_PAGE } = await import("@/components/kanbanComponents/TaskBoard")
import type { StatusOption } from "@/lib/taskStatus"
import { cellKey } from "@/lib/board/lanes"
import type { TaskInfoInterface } from "@/types/task"

const todo: StatusOption = { value: "todo", label: "To do", category: "todo", custom: false, color: "" }
const done: StatusOption = { value: "done", label: "Done", category: "done", custom: false, color: "" }

const task = (i: number, status = "todo") =>
  ({ task_uuid: `t-${status}-${i}`, task_name: `Task ${i}`, task_status: status, task_due_date: "", task_project: { project_uuid: "p", project_name: "P" } }) as unknown as TaskInfoInterface

const many = (n: number, status = "todo") => Array.from({ length: n }, (_, i) => task(i, status))

afterEach(() => {
  cleanup()
  localStorage.clear()
})

function board(props: Partial<Parameters<typeof TaskBoard>[0]> = {}) {
  return render(
    <TaskBoard
      columns={{ todo: many(100), done: many(3, "done") }}
      visible={[todo, done]}
      canDrag={() => true}
      onMove={() => {}}
      boardKey="test"
      {...props}
    />,
  )
}

describe("a board with hundreds of tasks", () => {
  it("renders one page of cards per column, and says how many more", () => {
    const { container } = board()
    const todoCol = container.querySelector('[data-column="todo"]')!
    expect(todoCol.querySelectorAll("[data-task-id]")).toHaveLength(CARDS_PER_PAGE)
    expect(todoCol.textContent).toContain(`${100 - CARDS_PER_PAGE} more`)
  })

  it("still counts every task in the column", () => {
    board()
    expect(screen.getByLabelText("100 tasks")).toBeTruthy()
  })
})

describe("a closed column the server sent only part of", () => {
  it("counts the real total and says the rest are in the list", () => {
    board({ totals: { done: 812 } })
    expect(screen.getByLabelText("812 tasks")).toBeTruthy()
    expect(screen.getByText("The newest 3 of 812.")).toBeTruthy()
    expect(screen.getByText("The list view has them all.")).toBeTruthy()
  })

  it("offers the next page when the board can load it", () => {
    const onShowMore = vi.fn()
    board({ totals: { done: 812 }, onShowMore })
    act(() => screen.getByRole("button", { name: "Show 200 more" }).click())
    expect(onShowMore).toHaveBeenCalledWith("done")
  })
})

describe("a board of people", () => {
  it("shows each card's status, which the column no longer says", () => {
    board({ columns: { todo: many(2) }, visible: [todo], badgeFor: () => "In review" })
    expect(screen.getAllByText("In review").length).toBeGreaterThan(0)
  })
})

describe("folding a column", () => {
  it("folds to a strip with no cards, and stays folded on this board", () => {
    const { container } = board()
    act(() => screen.getByRole("button", { name: "Collapse Done" }).click())
    expect(container.querySelector('[data-column="done"]')!.querySelectorAll("[data-task-id]")).toHaveLength(0)
    expect(screen.getByRole("button", { name: "Expand Done" })).toBeTruthy()
    cleanup()
    board()
    expect(screen.getByRole("button", { name: "Expand Done" })).toBeTruthy()
  })
})

describe("adding a task in a column", () => {
  it("adds by name into that column and stays open for the next", async () => {
    const onQuickAdd = vi.fn(async () => true)
    board({ onQuickAdd })
    act(() => screen.getAllByRole("button", { name: /add task/i })[0].click())
    const box = screen.getByLabelText("New task name") as HTMLInputElement
    fireEvent.change(box, { target: { value: "Write the release notes" } })
    await act(async () => {
      fireEvent.keyDown(box, { key: "Enter" })
    })
    expect(onQuickAdd).toHaveBeenCalledWith("todo", "Write the release notes")
    expect((screen.getByLabelText("New task name") as HTMLInputElement).value).toBe("")
  })

  it("is not offered where the person cannot add", () => {
    board()
    expect(screen.queryByRole("button", { name: /add task/i })).toBeNull()
  })
})

describe("a board in swimlanes", () => {
  const lanes = {
    list: [
      { id: "high", label: "High" },
      { id: "low", label: "Low" },
    ],
    laneOf: (t: TaskInfoInterface) => (t.task_uuid.endsWith("-0") ? "high" : "low"),
  }

  it("cuts every column into one cell per lane, empty cells included", () => {
    const { container } = board({ columns: { todo: many(3), done: many(1, "done") }, lanes })
    expect(screen.getByRole("region", { name: "High" })).toBeTruthy()
    expect(container.querySelectorAll("[data-column]")).toHaveLength(4)
    expect(container.querySelector(`[data-column="${cellKey("high", "todo")}"]`)!.querySelectorAll("[data-task-id]")).toHaveLength(1)
    expect(container.querySelector(`[data-column="${cellKey("low", "todo")}"]`)!.querySelectorAll("[data-task-id]")).toHaveLength(2)
    expect(container.querySelector(`[data-column="${cellKey("low", "done")}"]`)!.querySelectorAll("[data-task-id]")).toHaveLength(0)
  })

  it("folds a lane to its header and remembers it", () => {
    const { container } = board({ columns: { todo: many(3), done: [] }, lanes })
    fireEvent.click(screen.getByRole("button", { name: /High/ }))
    expect(container.querySelector(`[data-column="${cellKey("high", "todo")}"]`)).toBeNull()
    expect(JSON.parse(localStorage.getItem("oc_board_collapsed:test:lanes")!)).toEqual(["high"])
  })

  it("adds a task to the cell's column and lane", async () => {
    const onQuickAdd = vi.fn().mockResolvedValue(true)
    const { container } = board({ columns: { todo: [], done: [] }, lanes, onQuickAdd })
    const cell = container.querySelector(`[data-column="${cellKey("low", "done")}"]`)!
    fireEvent.click(cell.querySelector("button")!)
    const input = screen.getByLabelText("New task name")
    fireEvent.change(input, { target: { value: "Ship it" } })
    await act(async () => fireEvent.keyDown(input, { key: "Enter" }))
    expect(onQuickAdd).toHaveBeenCalledWith("done", "Ship it", "low")
  })

  it("counts each column across lanes, with the server's total when it sent part", () => {
    board({ columns: { todo: many(3), done: many(2, "done") }, lanes, totals: { done: 450 }, onShowMore: () => {} })
    expect(screen.getByText("450")).toBeTruthy()
    expect(screen.getByRole("button", { name: "Show more" })).toBeTruthy()
  })
})

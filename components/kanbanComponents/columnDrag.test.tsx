import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"

// Board columns in the project's order (design/projects-vs-asana-jira/
// BOARD_COLUMNS_PLAN.md): a grip and its keys for whoever may change the
// project's statuses, the column menu's moves everywhere (a phone's way), and
// nothing for anyone else. The pointer's drag is the browser's (e2e/boardColumns).

vi.mock("react-redux", () => ({ useDispatch: () => vi.fn(), useSelector: () => undefined }))
vi.mock("@/components/task/taskAssigneeCell", () => ({ TaskAssigneeCell: () => null }))
vi.mock("@/components/task/PRStatusBadge", () => ({ GitHubBadgeGroup: () => null }))
vi.mock("@/lib/celebrate", () => ({ celebrateTask: () => {}, prefersReducedMotion: () => true }))
const media = vi.hoisted(() => ({ phone: false }))
vi.mock("@/hooks/usePhone", () => ({ usePhone: () => media.phone }))

const { TaskBoard } = await import("@/components/kanbanComponents/TaskBoard")
import type { StatusCategory, StatusOption } from "@/lib/taskStatus"
import type { TaskInfoInterface } from "@/types/task"

const status = (value: StatusCategory, label: string): StatusOption => ({ value, label, category: value, custom: false, color: "" })
const ALL = [status("backlog", "Backlog"), status("todo", "To do"), status("inProgress", "In progress"), status("done", "Done"), status("canceled", "Cancelled")]
const ORDER = ALL.map((s) => s.value)
const closed = (v: string) => v === "done" || v === "canceled"

const task = (i: number, s: string) =>
  ({ task_uuid: `t-${s}-${i}`, task_name: `Task ${i}`, task_status: s, task_due_date: "", task_project: { project_uuid: "p", project_name: "P" } }) as unknown as TaskInfoInterface

afterEach(() => {
  cleanup()
  localStorage.clear()
  media.phone = false
})

function board({ ordered = true, visible = ALL, ...props }: { ordered?: boolean; visible?: StatusOption[] } & Partial<Parameters<typeof TaskBoard>[0]> = {}) {
  const onChange = vi.fn()
  const r = render(
    <TaskBoard
      columns={{ todo: [task(0, "todo")], inProgress: [task(1, "inProgress")], done: [task(2, "done")] }}
      visible={visible}
      canDrag={() => true}
      onMove={() => {}}
      boardKey="cols"
      columnOrder={ordered ? { order: ORDER, closed, onChange } : undefined}
      {...props}
    />,
  )
  const said = () => r.container.querySelector('[aria-live="assertive"]')?.textContent ?? ""
  return { ...r, onChange, said }
}

const grips = () => screen.queryAllByRole("button", { name: /^Move the .* column$/ })
const openMenu = (name: string) => act(() => void fireEvent.keyDown(screen.getByRole("button", { name: `${name} column actions` }), { key: "Enter" }))
const item = (name: "Move left" | "Move right") => screen.queryByRole("menuitem", { name })
const disabled = (el: HTMLElement | null) => el?.getAttribute("aria-disabled") === "true"

describe("who may move a board's columns", () => {
  it("a board without the project's order (a member, or columns of people) has no grip and no moves", () => {
    board({ ordered: false })
    expect(grips()).toHaveLength(0)
    openMenu("To do")
    expect(item("Move left")).toBeNull()
    expect(item("Move right")).toBeNull()
  })

  it("whoever may change the statuses has a grip on every column, saying what it does", () => {
    board()
    expect(grips().map((g) => g.getAttribute("aria-label"))).toEqual(ALL.map((s) => `Move the ${s.label} column`))
    const help = document.getElementById(grips()[0].getAttribute("aria-describedby")!)
    expect(help?.textContent).toContain("Moves the column for everyone in the project.")
  })

  it("a phone has no grip, and the column's menu moves it", () => {
    media.phone = true
    const { onChange, said } = board()
    expect(grips()).toHaveLength(0)
    openMenu("Done")
    act(() => void fireEvent.click(item("Move right")!))
    expect(onChange).toHaveBeenCalledWith(["backlog", "todo", "inProgress", "canceled", "done"])
    expect(said()).toBe("Done moved last.")
  })
})

describe("the column menu's moves", () => {
  it("moves a column one place, and says where it went", () => {
    const { onChange, said } = board()
    openMenu("To do")
    act(() => void fireEvent.click(item("Move left")!))
    expect(onChange).toHaveBeenCalledWith(["todo", "backlog", "inProgress", "done", "canceled"])
    expect(said()).toBe("To do moved first.")
  })

  // Done and Cancelled stay after the open columns, and an end is an end.
  it.each([
    ["Backlog", { left: false, right: true }],
    ["In progress", { left: true, right: false }],
    ["Done", { left: false, right: true }],
    ["Cancelled", { left: true, right: false }],
  ] as const)("offers %s only the moves it may make", (name, can) => {
    board()
    openMenu(name)
    expect(disabled(item("Move left"))).toBe(!can.left)
    expect(disabled(item("Move right"))).toBe(!can.right)
  })

  it("leaves a column the person hides where it was, and moves among the columns they see", () => {
    const { onChange } = board({ visible: ALL.filter((s) => s.value !== "backlog") })
    openMenu("To do")
    expect(disabled(item("Move left"))).toBe(true)
    cleanup()
    const next = board({ visible: ALL.filter((s) => s.value !== "backlog") })
    openMenu("In progress")
    act(() => void fireEvent.click(item("Move left")!))
    expect(onChange).not.toHaveBeenCalled()
    expect(next.onChange).toHaveBeenCalledWith(["backlog", "inProgress", "todo", "done", "canceled"])
  })
})

describe("moving a column from the keys", () => {
  it("picks it up, moves the gap only where it may go, and puts it down, each step said", () => {
    const { container, onChange, said } = board()
    const grip = screen.getByRole("button", { name: "Move the To do column" })
    act(() => grip.focus())
    fireEvent.keyDown(grip, { key: " " })
    expect(said()).toBe("Picked up the To do column. The left and right arrows move it, Space or Enter puts it down, Escape puts it back.")
    expect(container.querySelector('[data-column="todo"]')!.getAttribute("data-column-lifted")).toBe("keys")
    fireEvent.keyDown(grip, { key: "ArrowRight" })
    expect(said()).toBe("To do, between In progress and Done.")
    // Past Done is the closed columns' side.
    fireEvent.keyDown(grip, { key: "ArrowRight" })
    expect(said()).toBe("The To do column can't go further right.")
    fireEvent.keyDown(grip, { key: " " })
    expect(onChange).toHaveBeenCalledWith(["backlog", "inProgress", "todo", "done", "canceled"])
    expect(said()).toBe("To do put down between In progress and Done.")
    expect(container.querySelector('[data-column="todo"]')!.getAttribute("data-column-lifted")).toBeNull()
  })

  it("Escape puts it back, and so does leaving the grip", () => {
    const { container, onChange, said } = board()
    const grip = screen.getByRole("button", { name: "Move the To do column" })
    act(() => grip.focus())
    fireEvent.keyDown(grip, { key: "Enter" })
    fireEvent.keyDown(grip, { key: "ArrowLeft" })
    expect(said()).toBe("To do, first.")
    fireEvent.keyDown(grip, { key: "Escape" })
    expect(said()).toBe("To do put back where it was.")
    fireEvent.keyDown(grip, { key: "Enter" })
    expect(said()).toContain("Picked up the To do column.")
    act(() => screen.getByRole("button", { name: "Move the Done column" }).focus())
    expect(said()).toBe("To do put back where it was.")
    expect(container.querySelector("[data-column-lifted]")).toBeNull()
    expect(onChange).not.toHaveBeenCalled()
  })

  it("leaves the keys of a card alone", () => {
    const { onChange, said } = board()
    const grip = screen.getByRole("button", { name: "Move the To do column" })
    act(() => grip.focus())
    fireEvent.keyDown(grip, { key: "ArrowRight" })
    expect(said()).toBe("")
    expect(onChange).not.toHaveBeenCalled()
  })
})

describe("a board in swimlanes", () => {
  const lanes = { list: [{ id: "high", label: "High" }, { id: "low", label: "Low" }], laneOf: () => "high" }

  it("moves its columns from the header row, in every lane at once", () => {
    const { onChange } = board({ lanes })
    expect(grips()).toHaveLength(ALL.length)
    openMenu("In progress")
    expect(disabled(item("Move right"))).toBe(true)
    act(() => void fireEvent.click(item("Move left")!))
    expect(onChange).toHaveBeenCalledWith(["backlog", "inProgress", "todo", "done", "canceled"])
  })

  it("has no moves for a member", () => {
    board({ lanes, ordered: false })
    expect(grips()).toHaveLength(0)
    expect(screen.queryByRole("button", { name: "In progress column actions" })).toBeNull()
  })
})

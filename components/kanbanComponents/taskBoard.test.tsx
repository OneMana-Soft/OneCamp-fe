import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react"

vi.mock("react-redux", () => ({ useDispatch: () => vi.fn(), useSelector: () => undefined }))
vi.mock("@/components/task/taskAssigneeCell", () => ({ TaskAssigneeCell: () => null }))
vi.mock("@/components/task/PRStatusBadge", () => ({ GitHubBadgeGroup: () => null }))
const celebrate = vi.fn()
vi.mock("@/lib/celebrate", () => ({ celebrateTask: (el: Element) => celebrate(el), prefersReducedMotion: () => true }))

const { TaskBoard, CARDS_PER_PAGE, columnPaging } = await import("@/components/kanbanComponents/TaskBoard")
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

describe("an open column the server sent only part of (PROJ-BUG-8)", () => {
  it("counts the real total, says which part is shown, and asks for the next 1,000 of that column", () => {
    const onShowMore = vi.fn()
    board({ columns: { todo: many(3), done: [] }, totals: { todo: 2500 }, onShowMore })
    expect(screen.getByLabelText("2500 tasks")).toBeTruthy()
    expect(screen.getByText("The first 3 of 2500.")).toBeTruthy()
    act(() => screen.getByRole("button", { name: "Show 1000 more" }).click())
    expect(onShowMore).toHaveBeenCalledWith("todo")
  })

  it("pages done newest first and open columns in board order", () => {
    expect(columnPaging({ value: "done" })).toEqual({ closed: true, step: 200, max: 2000 })
    expect(columnPaging({ value: "shipped-id", category: "done" }).closed).toBe(true)
    expect(columnPaging({ value: "todo" })).toEqual({ closed: false, step: 1000, max: 5000 })
    expect(columnPaging({ value: "ready-id", category: "todo" }).closed).toBe(false)
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
    // Collapse is in the column's menu (work.md W20).
    act(() => void fireEvent.keyDown(screen.getByRole("button", { name: "Done column actions" }), { key: "Enter" }))
    act(() => void fireEvent.click(screen.getByRole("menuitem", { name: "Collapse" })))
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
    act(() => screen.getAllByRole("button", { name: /^new task$/i })[0].click())
    const box = screen.getByLabelText("New task name") as HTMLInputElement
    fireEvent.change(box, { target: { value: "Write the release notes" } })
    await act(async () => {
      fireEvent.keyDown(box, { key: "Enter" })
    })
    expect(onQuickAdd).toHaveBeenCalledWith("todo", "Write the release notes")
    expect((screen.getByLabelText("New task name") as HTMLInputElement).value).toBe("")
  })

  // Review, 15 Oct 2026: typing a name in Japanese, Chinese or Korean, the
  // Enter that picks a word made the task with half its name, and the Escape
  // that drops a word closed the box (lib/keys/ime.ts fieldKeyDown).
  it("leaves an input method's Enter and Escape to it: no task made mid-word, the box kept", async () => {
    const onQuickAdd = vi.fn(async () => true)
    board({ onQuickAdd })
    act(() => screen.getAllByRole("button", { name: /^new task$/i })[0].click())
    const box = screen.getByLabelText("New task name") as HTMLInputElement
    fireEvent.change(box, { target: { value: "リリース" } })
    await act(async () => {
      fireEvent.keyDown(box, { key: "Enter", isComposing: true })
      fireEvent.keyDown(box, { key: "Enter", keyCode: 229 })
      fireEvent.keyDown(box, { key: "Escape", isComposing: true })
    })
    expect(onQuickAdd).not.toHaveBeenCalled()
    expect((screen.getByLabelText("New task name") as HTMLInputElement).value).toBe("リリース")
    await act(async () => {
      fireEvent.keyDown(box, { key: "Enter" })
    })
    expect(onQuickAdd).toHaveBeenCalledWith("todo", "リリース")
  })

  it("is not offered where the person cannot add", () => {
    board()
    expect(screen.queryByRole("button", { name: /new task/i })).toBeNull()
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

describe("moving a card from the keyboard", () => {
  const inProgress: StatusOption = { value: "inProgress", label: "In progress", category: "inProgress", custom: false, color: "" }
  // requestAnimationFrame runs the save at once, so a test sees onMove.
  const raf = vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => {
    cb(0)
    return 0
  })
  afterEach(() => raf.mockClear())

  function threeColumns(onMove = vi.fn()) {
    const utils = board({
      columns: { todo: many(3), inProgress: many(2, "inProgress"), done: [] },
      visible: [todo, inProgress, done],
      onMove,
    })
    const card = (id: string) => utils.container.querySelector<HTMLElement>(`[data-task-id="${id}"]`)!
    const key = (key: string) => act(() => void fireEvent.keyDown(document.activeElement ?? document.body, { key }))
    return { ...utils, card, key, onMove }
  }

  it("picks up with Space, moves with the arrows and drops with Space where the line is", () => {
    const { card, key, onMove, container } = threeColumns()
    act(() => card("t-todo-0").focus())
    key(" ")
    expect(container.querySelector("[data-drop-line]")).toBeTruthy()
    key("ArrowRight")
    key("ArrowDown")
    // The line is in In progress, below its first card.
    const lineCol = container.querySelector("[data-drop-line]")!.closest("[data-column]")!
    expect(lineCol.getAttribute("data-column")).toBe("inProgress")
    key(" ")
    expect(onMove).toHaveBeenCalledTimes(1)
    const [task, drop] = onMove.mock.calls[0]
    expect(task.task_uuid).toBe("t-todo-0")
    expect(drop).toMatchObject({ column: "inProgress", index: 1, before: "t-inProgress-0", after: "t-inProgress-1" })
    // The board shows it there at once, and focus went with it.
    expect(card("t-todo-0").closest("[data-column]")!.getAttribute("data-column")).toBe("inProgress")
    expect(document.activeElement).toBe(card("t-todo-0"))
    expect(container.querySelector("[data-drop-line]")).toBeNull()
  })

  it("reorders within a column, and Enter drops as Space does", () => {
    const { card, key, onMove } = threeColumns()
    act(() => card("t-todo-0").focus())
    key(" ")
    key("ArrowDown")
    key("ArrowDown")
    key("Enter")
    expect(onMove.mock.calls[0][1]).toMatchObject({ column: "todo", index: 2, before: "t-todo-2", after: "" })
  })

  it("puts it back with Escape, saving nothing", () => {
    const { card, key, onMove, container } = threeColumns()
    act(() => card("t-todo-1").focus())
    key(" ")
    key("ArrowRight")
    key("Escape")
    expect(onMove).not.toHaveBeenCalled()
    expect(container.querySelector("[data-drop-line]")).toBeNull()
    expect(card("t-todo-1").closest("[data-column]")!.getAttribute("data-column")).toBe("todo")
  })

  it("says each step aloud", () => {
    const { card, key } = threeColumns()
    act(() => card("t-todo-0").focus())
    key(" ")
    expect(screen.getByText(/Picked up Task 0\. To do, 1 of 3\./)).toBeTruthy()
    key("ArrowRight")
    expect(screen.getByText("In progress, 1 of 3")).toBeTruthy()
  })

  it("keeps the list's keys and Enter to open out of a move", () => {
    const listKeys = vi.fn()
    document.addEventListener("keydown", listKeys)
    const { card, key } = threeColumns()
    act(() => card("t-todo-0").focus())
    key(" ")
    key("ArrowDown")
    key("Enter")
    document.removeEventListener("keydown", listKeys)
    expect(listKeys).not.toHaveBeenCalled()
  })

  it("leaves a card that can't be moved where it is", () => {
    const onMove = vi.fn()
    const { container } = board({ columns: { todo: many(2), done: [] }, canDrag: () => false, onMove })
    const c = container.querySelector<HTMLElement>('[data-task-id="t-todo-0"]')!
    act(() => c.focus())
    act(() => void fireEvent.keyDown(c, { key: " " }))
    act(() => void fireEvent.keyDown(c, { key: "ArrowDown" }))
    expect(container.querySelector("[data-drop-line]")).toBeNull()
    expect(onMove).not.toHaveBeenCalled()
  })
})

describe("completing a card on the board", () => {
  const inProgress: StatusOption = { value: "inProgress", label: "In progress", category: "inProgress", custom: false, color: "" }
  const raf = vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => {
    cb(0)
    return 0
  })
  afterEach(() => {
    raf.mockClear()
    celebrate.mockClear()
  })

  const move = (key: string, from: string, steps: string[]) => {
    const utils = board({ columns: { inProgress: many(2, "inProgress"), done: many(1, "done") }, visible: [inProgress, done] })
    const card = utils.container.querySelector<HTMLElement>(`[data-task-id="${from}"]`)!
    act(() => card.focus())
    for (const k of [" ", ...steps, " "]) act(() => void fireEvent.keyDown(document.activeElement ?? document.body, { key: k }))
    return utils
  }

  // The Spark comes once the card has landed, at the drop's end.
  const landed = () => act(() => new Promise((r) => setTimeout(r, 260)))

  it("celebrates from the card when it lands in a done column", async () => {
    move(" ", "t-inProgress-0", ["ArrowRight"])
    await landed()
    expect(celebrate).toHaveBeenCalledTimes(1)
    expect((celebrate.mock.calls[0][0] as HTMLElement).dataset.taskId).toBe("t-inProgress-0")
  })

  it("never celebrates a task moved out of done, or within its column", async () => {
    move(" ", "t-done-0", ["ArrowLeft"])
    move(" ", "t-inProgress-0", ["ArrowDown"])
    await landed()
    expect(celebrate).not.toHaveBeenCalled()
  })
})

describe("a card under the pointer", () => {
  it("lifts a pixel (the playful layer's hover-lift), a card being a thing to open", () => {
    const { container } = board({ columns: { todo: many(1) }, visible: [todo] })
    expect(container.querySelector('[data-task-id="t-todo-0"]')!.className).toMatch(/\bhover-lift\b/)
  })
})

describe("the v3 board (work.md W20, W22)", () => {
  it("draws columns that share the board, 264 to 320px, on the sunken surface with no border", () => {
    const { container } = board()
    const column = container.querySelector<HTMLElement>('[data-column="todo"]')!
    expect(column.className).toContain("sm:min-w-[264px]")
    expect(column.className).toContain("sm:max-w-[320px]")
    expect(column.className).toContain("sm:flex-1")
    expect(column.className).toContain("bg-sunken")
    expect(column.className).not.toMatch(/(^|\s)border(\s|$)|border-border/)
  })

  it("leaves room after the last column, so nothing is clipped", () => {
    const { container } = board()
    expect(container.querySelector("[data-board]")!.className).toMatch(/after:w-1|sm:after:w-5/)
  })

  it("opens a gap where the held card will land, by moving the cards below", () => {
    const { container } = board({ columns: { todo: many(3), done: many(2, "done") } })
    const card = container.querySelector<HTMLElement>('[data-task-id="t-todo-0"]')!
    act(() => card.focus())
    act(() => void fireEvent.keyDown(card, { key: " " }))
    // At its own place nothing moves: the slot it left says so.
    expect(container.querySelectorAll("[data-shift]")).toHaveLength(0)
    act(() => void fireEvent.keyDown(document.activeElement!, { key: "ArrowRight" }))
    const shifted = [...container.querySelectorAll<HTMLElement>("[data-shift]")].map((e) => e.dataset.cardSlot)
    expect(shifted).toEqual(["t-done-0", "t-done-1"])
    act(() => void fireEvent.keyDown(document.activeElement!, { key: "Escape" }))
    expect(container.querySelectorAll("[data-shift]")).toHaveLength(0)
  })

  it("lights only another column under a held card, as the layer's drop well", () => {
    const { container } = board({ columns: { todo: many(2), done: many(1, "done") } })
    const card = container.querySelector<HTMLElement>('[data-task-id="t-todo-0"]')!
    act(() => card.focus())
    act(() => void fireEvent.keyDown(card, { key: " " }))
    expect(container.querySelector('[data-column="todo"]')!.hasAttribute("data-drag-over")).toBe(false)
    act(() => void fireEvent.keyDown(document.activeElement!, { key: "ArrowRight" }))
    const target = container.querySelector<HTMLElement>('[data-column="done"]')!
    expect(target.hasAttribute("data-drag-over")).toBe(true)
    // A dashed accent edge and tint (app/interaction.css [data-drop], INTERACTION_SPEC §5.2), not a solid ring of its own.
    expect(target.getAttribute("data-drop")).toBe("valid")
    expect(target.className).not.toMatch(/ring-brand/)
    // And the line where it will land is drawn, not hidden.
    const line = target.querySelector<HTMLElement>("[data-drop-line]")!
    expect(line.className).not.toMatch(/opacity-0|(^|\s)h-0(\s|$)/)
  })

  // The rivals review (16 Oct 2026): Notion tints each status column and heads
  // it with a coloured pill, so the stage reads from across the room.
  it("washes a column in its status's hue, under a lozenge, and leaves To do neutral", () => {
    const { container } = board({ columns: { todo: many(1), done: many(1, "done") } })
    const doneCol = container.querySelector<HTMLElement>('[data-column="done"]')!
    expect(doneCol.className).toContain("hue-moss")
    expect(doneCol.className).toContain("var(--hue-tint)")
    expect(doneCol.querySelector("[data-column-lozenge]")!.className).toContain("bg-hue-tint text-hue-ink")
    const todoCol = container.querySelector<HTMLElement>('[data-column="todo"]')!
    expect(todoCol.className).not.toMatch(/hue-/)
    expect(todoCol.querySelector("[data-column-lozenge]")!.className).toContain("bg-hover")
  })

  it("keeps a column's + in sight at rest, where it waited on the column's hover", () => {
    board({ columns: { todo: many(1), done: [] }, onQuickAdd: async () => true })
    const plus = screen.getByRole("button", { name: "New task in To do" })
    for (let el: HTMLElement | null = plus; el && !el.hasAttribute("data-column"); el = el.parentElement) {
      expect(el.className).not.toMatch(/(^|\s)opacity-0(\s|$)/)
    }
  })

  it("offers every drag as a menu: Move to… each column", () => {
    const onMove = vi.fn()
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => {
      cb(0)
      return 0
    })
    const { container } = board({ columns: { todo: many(2), done: [] }, onMove })
    const card = container.querySelector<HTMLElement>('[data-task-id="t-todo-1"]')!
    act(() => void fireEvent.keyDown(within(card).getByRole("button", { name: "Card actions" }), { key: "Enter" }))
    act(() => void fireEvent.keyDown(screen.getByRole("menuitem", { name: "Move to…" }), { key: "ArrowRight" }))
    act(() => void fireEvent.click(screen.getByRole("menuitem", { name: /Done/ })))
    expect(onMove).toHaveBeenCalledTimes(1)
    expect(onMove.mock.calls[0][1]).toMatchObject({ column: "done", index: 0 })
  })
})

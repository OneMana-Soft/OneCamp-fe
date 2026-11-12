import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { TasksAside, TasksPanel } from "./tasksPanel"
import type { TaskInfoInterface } from "@/types/task"
import { installPointerEvent } from "@/lib/testing/pointerEvent"
import { pinTestClock } from "@/lib/testing/testClock"

// gcal-new-task-blocks: the calendar's Tasks list, your open tasks to put on
// the grid. Beside the grid a row is carried onto it (the week's own drag); on
// a phone it is a drawer, a task tapped and then "Block time"; from the keys,
// a row's menu blocks time too. A task that waits on open ones says so.
afterEach(cleanup)
pinTestClock()
// The list's own read, ask and toast (TasksAside): the server, in memory.
const server = vi.hoisted(() => ({ read: undefined as { data: { user_tasks: unknown[] } } | undefined, failed: false, retry: vi.fn(), ask: vi.fn(), toast: vi.fn() }))
vi.mock("@/hooks/useAssignedTasks", () => ({ useAssignedTasks: () => ({ data: server.read, isError: server.failed, mutate: server.retry }) }))
vi.mock("@/hooks/usePost", () => ({ usePost: () => ({ makeRequest: server.ask, isSubmitting: false }) }))
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: server.toast }) }))
// jsdom has no PointerEvent: a press's button reaches the row as a browser's would.
installPointerEvent()

const plan = { task_uuid: "t-plan", task_name: "Plan the launch", task_status: "todo", task_estimate_minutes: 45, task_project: { project_uuid: "p1", project_name: "Launch" } } as TaskInfoInterface
const brief = { task_uuid: "t-brief", task_name: "Write the brief", task_status: "todo", task_blocked_open: 1 } as TaskInfoInterface
const panel = (over: Partial<Parameters<typeof TasksPanel>[0]> = {}) => {
  const on = { onClose: vi.fn(), onBlock: vi.fn(async () => true), onOpen: vi.fn(), onCarry: vi.fn(() => true), onRetry: vi.fn() }
  render(<TasksPanel tasks={[plan, brief]} {...on} {...over} />)
  return on
}
const row = (name: string) => screen.getByRole("button", { name: new RegExp(`^${name}`) })

describe("the calendar's Tasks list", () => {
  it("lists your open tasks, marking the one that waits", () => {
    panel()
    expect(screen.getByRole("heading", { name: "Tasks" })).toBeTruthy()
    expect(row("Plan the launch").textContent).toContain("Launch")
    expect(within(row("Write the brief")).getByTitle("Blocked by 1 task")).toBeTruthy()
    expect(row("Write the brief").getAttribute("aria-label")).toBe("Write the brief, waiting on 1 task")
    expect(within(row("Plan the launch")).queryByTitle(/Blocked by/)).toBeNull()
  })

  it("carries a row onto the grid through the week's drag, and a click opens the task only once", () => {
    const on = panel()
    fireEvent.pointerDown(row("Plan the launch"), { button: 0, pointerId: 1, clientX: 5, clientY: 5 })
    expect(on.onCarry).toHaveBeenCalledTimes(1)
    expect((on.onCarry.mock.calls[0] as unknown[])[0]).toBe(plan)
    // The week took the press: its own tap opens the task, so the row's click doesn't again.
    fireEvent.click(row("Plan the launch"), { detail: 1 })
    expect(on.onOpen).not.toHaveBeenCalled()
    // From the keys, Enter opens it.
    fireEvent.click(row("Plan the launch"), { detail: 0 })
    expect(on.onOpen).toHaveBeenCalledWith("t-plan")
  })

  it("shows a row's menu on a touch screen, where nothing hovers", () => {
    panel()
    expect(screen.getByRole("button", { name: "More for Plan the launch" }).className).toContain("[@media(hover:none)]:opacity-100")
  })

  it("blocks time from a row's menu", async () => {
    const on = panel()
    fireEvent.keyDown(screen.getByRole("button", { name: "More for Plan the launch" }), { key: "Enter" })
    fireEvent.click(await screen.findByRole("menuitem", { name: "Block time" }))
    expect(on.onBlock).toHaveBeenCalledWith(plan)
  })

  it("says when there are no open tasks, and when they couldn't load", () => {
    panel({ tasks: [] })
    expect(screen.getByText("No open tasks")).toBeTruthy()
    cleanup()
    const on = panel({ tasks: undefined, failed: true })
    fireEvent.click(screen.getByRole("button", { name: "Try again" }))
    expect(on.onRetry).toHaveBeenCalled()
  })
})

describe("the Tasks list on a phone", () => {
  it("is a drawer: a task tapped, then Block time in its footer", () => {
    const on = panel({ phone: true, onCarry: undefined })
    const block = screen.getByRole("button", { name: "Block time" })
    expect(block.hasAttribute("disabled")).toBe(true)
    fireEvent.click(row("Plan the launch"))
    expect(row("Plan the launch").getAttribute("aria-pressed")).toBe("true")
    fireEvent.click(block)
    expect(on.onBlock).toHaveBeenCalledWith(plan)
    expect(on.onOpen).not.toHaveBeenCalled()
  })

  it("is busy with its own Block time, not disabled: a second press makes no second block", async () => {
    let done: (v: unknown) => void = () => {}
    const onBlock = vi.fn(() => new Promise((land) => (done = land)))
    panel({ phone: true, onCarry: undefined, onBlock })
    fireEvent.click(row("Plan the launch"))
    const block = screen.getByRole("button", { name: "Block time" })
    fireEvent.click(block)
    expect([block.getAttribute("aria-busy"), block.hasAttribute("disabled")]).toEqual(["true", false])
    fireEvent.click(block)
    expect(onBlock).toHaveBeenCalledTimes(1)
    await act(async () => done(true))
    expect(block.getAttribute("aria-busy")).toBeNull()
  })
})

// The list with its read, a chunk of its own: the calendar's first screen holds only its button.
describe("the Tasks list's read and its Block time", () => {
  const at = (h: number) => new Date(2026, 9, 21, h).toISOString()
  const aside = (over: Partial<Parameters<typeof TasksAside>[0]> = {}) => {
    const on = { onClose: vi.fn(), onOpen: vi.fn(), onOpenBlock: vi.fn(), onBlockTime: vi.fn(async () => ({ id: "b-new" })) }
    render(<TasksAside phone={false} {...on} {...over} />)
    return on
  }
  afterEach(() => {
    Object.assign(server, { read: undefined, failed: false })
    vi.clearAllMocks()
  })

  it("lists your open tasks soonest due first, undated last, and says a failed read in place", () => {
    server.read = { data: { user_tasks: [brief, { ...plan, task_due_date: "2026-10-30" }, { task_uuid: "t-copy", task_name: "Write the copy", task_due_date: "2026-10-22" }] } }
    aside()
    expect(screen.getAllByRole("button", { name: /^(Plan|Write)/ }).map((b) => b.getAttribute("aria-label")?.split(",")[0])).toEqual(["Write the copy", "Plan the launch", "Write the brief"])
    cleanup()
    Object.assign(server, { read: undefined, failed: true })
    aside()
    expect(screen.getByRole("alert").textContent).toContain("Couldn't load your tasks.")
    fireEvent.click(screen.getByRole("button", { name: "Try again" }))
    expect(server.retry).toHaveBeenCalled()
  })

  it("carries a row through the week's drag, the task's estimate long", () => {
    server.read = { data: { user_tasks: [plan] } }
    const carry = { current: vi.fn() }
    aside({ carry })
    fireEvent.pointerDown(row("Plan the launch"), { button: 0, pointerId: 1, clientX: 5, clientY: 5 })
    expect(carry.current).toHaveBeenCalledWith({ uuid: "t-plan", title: "Plan the launch", minutes: 45 }, expect.objectContaining({ pointerId: 1 }))
  })

  it("blocks your next free time, then closes the drawer and opens the block", async () => {
    server.read = { data: { user_tasks: [plan] } }
    server.ask.mockResolvedValue({ suggestions: [{ start: at(15), end: at(16) }, { start: at(11), end: at(12) }] })
    const on = aside({ phone: true })
    fireEvent.click(row("Plan the launch"))
    fireEvent.click(screen.getByRole("button", { name: "Block time" }))
    await waitFor(() => expect(on.onOpenBlock).toHaveBeenCalledWith("b-new"))
    expect((server.ask.mock.calls[0] as [{ payload: { duration_minutes: number } }])[0].payload.duration_minutes).toBe(45)
    expect(on.onBlockTime).toHaveBeenCalledWith("t-plan", new Date(at(11)), new Date(at(12)))
    expect(on.onClose).toHaveBeenCalled()
  })

  // V-775: neither "today or tomorrow" (it asks further) nor the success check, as nothing was made.
  it("says when there is no free time left, in the info look, and blocks nothing", async () => {
    server.read = { data: { user_tasks: [plan] } }
    server.ask.mockResolvedValue({ suggestions: [] })
    const on = aside({ phone: true })
    fireEvent.click(row("Plan the launch"))
    fireEvent.click(screen.getByRole("button", { name: "Block time" }))
    await waitFor(() => expect(server.toast).toHaveBeenCalledWith(expect.objectContaining({ title: "No free time in the next few days", tone: "info" })))
    expect([on.onBlockTime.mock.calls.length, on.onOpenBlock.mock.calls.length, on.onClose.mock.calls.length]).toEqual([0, 0, 0])
  })
})

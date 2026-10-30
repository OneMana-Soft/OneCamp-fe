import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import type { BacklogAnswer, BacklogData } from "@/lib/work/backlog"
import type { TaskInfoInterface } from "@/types/task"
import type { BulkChange } from "@/lib/bulkTasks"
import type { BulkResult } from "@/hooks/useBulkTaskUpdate"
import { pinTestClock } from "@/lib/testing/testClock"

let answer: BacklogAnswer | undefined
const mutate = vi.fn(async (next?: BacklogAnswer) => {
  if (next) answer = next
})
vi.mock("@/hooks/useFetch", () => ({ useFetch: () => ({ data: answer, isLoading: !answer, isError: undefined, mutate }) }))
vi.mock("@/hooks/useProjectStatuses", () => ({ useProjectStatuses: () => ({ options: [] }) }))
vi.mock("@/hooks/useUserAvatar", () => ({ useUserAvatar: () => ({ src: undefined }) }))
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }), toast: vi.fn() }))
let mobile = false
vi.mock("@/context/MediaQueryContext", () => ({ useMedia: () => ({ isMobile: mobile, isDesktop: !mobile }) }))
// The keys read the app's split view and its task panel (hooks/useListKeyboard).
const app = { getState: () => ({ split: { active: -1 }, rightPanel: { rightPanelState: { isOpen: false, data: {} } } }), subscribe: () => () => {} }
vi.mock("react-redux", () => ({ useDispatch: () => vi.fn(), useSelector: () => undefined, useStore: () => app }))
// The selection's bar changes many tasks through one hook; its tag picker reads the project's tags.
const bulk = vi.fn<(tasks: TaskInfoInterface[], change: BulkChange) => Promise<BulkResult>>(async (tasks) => ({ changed: tasks.length, failed: 0, unchanged: 0, done: tasks }))
vi.mock("@/hooks/useBulkTaskUpdate", () => ({ useBulkTaskUpdate: () => bulk }))
vi.mock("@/components/tags/TagPicker", () => ({ useProjectTags: () => ({ tags: [], refresh: () => {} }) }))
const api = {
  setTaskCycle: vi.fn(async () => {}),
  startCycle: vi.fn(async () => {}),
  completeCycle: vi.fn(async () => {}),
  createCycle: vi.fn(async () => {}),
  saveSchedule: vi.fn(async () => {}),
  stopSchedule: vi.fn(async () => {}),
  setCycleCapacity: vi.fn(async () => {}),
}
vi.mock("@/lib/work/backlog", async (orig) => ({
  ...(await orig<typeof import("@/lib/work/backlog")>()),
  setTaskCycle: (...a: unknown[]) => api.setTaskCycle(...(a as [])),
  startCycle: (...a: unknown[]) => api.startCycle(...(a as [])),
  completeCycle: (...a: unknown[]) => api.completeCycle(...(a as [])),
  createCycle: (...a: unknown[]) => api.createCycle(...(a as [])),
  saveSchedule: (...a: unknown[]) => api.saveSchedule(...(a as [])),
  stopSchedule: (...a: unknown[]) => api.stopSchedule(...(a as [])),
  setCycleCapacity: (...a: unknown[]) => api.setCycleCapacity(...(a as [])),
}))

const { default: ProjectBacklog } = await import("@/components/work/backlog/ProjectBacklog")

pinTestClock()
// The selection's bar is a chunk of its own (next/dynamic in KeyboardList): loaded once ahead, as components/task/keyboardList.test does.
beforeAll(async () => {
  await import("@/components/task/BulkTaskBar")
})
afterEach(cleanup)
beforeEach(() => {
  mobile = false
  mutate.mockClear()
  bulk.mockClear()
  Object.values(api).forEach((f) => f.mockClear())
})

const task = (id: string, name: string, extra: object = {}) => ({ task_uuid: id, task_name: name, task_status: "todo", ...extra })
const cycle = (id: string, n: number, state: string, tasks: object[], estimate: number, done = 0) => ({
  id, project_uuid: "p", number: n, name: "", starts_at: "2026-10-12T00:00:00Z", ends_at: "2026-10-26T00:00:00Z", state,
  progress: { total: tasks.length, started: 0, done }, tasks, estimate_minutes: estimate,
})
const backlog = (over: Partial<BacklogData> = {}): BacklogAnswer =>
  ({
    data: {
      backlog: {
        cycles: [
          cycle("c3", 3, "current", [task("a", "Write the launch post", { task_key: "Q4-1", task_estimate_minutes: 600, task_sub_task_count: 5, task_sub_task_done: 2 }), task("b", "Ship it", { task_status: "done" })], 1800, 1),
          cycle("c4", 4, "upcoming", [], 0),
        ],
        tasks: [task("x", "Plan the webinar", { task_key: "Q4-9" })],
        count: 12,
        estimate_minutes: 2040,
        capacity_minutes: 1440,
        ...over,
      },
      can_edit: true,
      can_plan: true,
    },
  }) as BacklogAnswer

// STEP4 #9 with spec F: containers, totals, capacity, one orange action.
describe("the backlog tab", () => {
  it("shows the open cycles, then the backlog, with their totals as the spec says them", () => {
    answer = backlog()
    const { container } = render(<ProjectBacklog projectId="p" />)
    const cur = container.querySelector<HTMLElement>("[data-container='c3']")!
    expect(within(cur).getByRole("heading", { name: "Cycle 3" })).toBeTruthy()
    expect(cur.querySelector("[data-cycle-totals]")!.textContent).toBe("2 tasks · 30 h of 24 h")
    expect(cur.querySelector("[data-load]")!.getAttribute("data-load")).toBe("over")
    expect(within(cur).getByRole("img", { name: "Cycle 3 is over capacity" })).toBeTruthy()
    expect(within(cur).getByRole("progressbar", { name: "Cycle 3, 1 of 2 done" })).toBeTruthy()
    // The row: its key, its sub-tasks' ring "2/5" and its estimate.
    const row = within(cur).getByText("Write the launch post").closest<HTMLElement>("[data-backlog-row]")!
    expect(within(row).getByText("Q4-1")).toBeTruthy()
    expect(row.querySelector("[data-subtask-ring]")!.textContent).toBe("2/5")
    expect(within(row).getByText("10 h")).toBeTruthy()
    expect(container.querySelector("[data-backlog-totals]")!.textContent).toBe("12 tasks · 34 h")
    expect(screen.getByText(/The oldest 1 of 12 are shown/)).toBeTruthy()
  })

  it("has one orange action: complete the running cycle; the next one's Start is secondary", () => {
    answer = backlog()
    render(<ProjectBacklog projectId="p" />)
    const complete = screen.getByRole("button", { name: "Complete cycle" })
    const start = screen.getByRole("button", { name: "Start cycle" })
    expect(complete.className).not.toContain("bg-raised")
    expect(start.className).toContain("bg-raised")
  })

  it("completes a cycle, its unfinished tasks to the next or the backlog, as chosen", async () => {
    answer = backlog()
    render(<ProjectBacklog projectId="p" />)
    fireEvent.click(screen.getByRole("button", { name: "Complete cycle" }))
    const dialog = await screen.findByRole("dialog", { name: "Complete Cycle 3" })
    expect(within(dialog).getByText("1 task isn't done. Move it to the next cycle or the backlog?")).toBeTruthy()
    fireEvent.click(within(dialog).getByRole("radio", { name: "Back to the backlog" }))
    await act(async () => fireEvent.click(within(dialog).getByRole("button", { name: "Complete cycle" })))
    expect(api.completeCycle).toHaveBeenCalledWith("p", "c3", false)
  })

  it("starts the next cycle", async () => {
    answer = backlog()
    render(<ProjectBacklog projectId="p" />)
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Start cycle" })))
    expect(api.startCycle).toHaveBeenCalledWith("p", "c4")
  })

  it("says what is empty: no cycle yet, and nothing left to plan", async () => {
    answer = backlog({ cycles: [], tasks: [], count: 0, estimate_minutes: 0 })
    render(<ProjectBacklog projectId="p" />)
    expect(screen.getByRole("heading", { name: "Plan in cycles" })).toBeTruthy()
    expect(screen.getByText("Everything is planned.")).toBeTruthy()
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Make a cycle" })))
    expect(api.createCycle).toHaveBeenCalled()
  })

  it("offers nothing to change to someone who can't", () => {
    answer = backlog()
    answer.data.can_edit = false
    answer.data.can_plan = false
    const { container } = render(<ProjectBacklog projectId="p" />)
    expect(screen.queryByRole("button", { name: /cycle$/i })).toBeNull()
    expect(screen.queryByRole("button", { name: /capacity/ })).toBeNull()
    expect(container.querySelector("[data-cycle-totals]")!.tagName).toBe("SPAN")
    expect(container.querySelector("[aria-roledescription='draggable task']")).toBeNull()
  })

  it("lifts a row from the keys on a computer", () => {
    answer = backlog()
    const { container } = render(<ProjectBacklog projectId="p" />)
    const row = container.querySelector<HTMLElement>("[data-task-id='x']")!
    expect(row.getAttribute("aria-roledescription")).toBe("draggable task")
    expect(row.getAttribute("tabindex")).toBe("0")
  })

  it("picks tasks with X and moves them into a cycle with Shift+C, through the selection's bar", async () => {
    answer = backlog()
    const { container } = render(<ProjectBacklog projectId="p" />)
    const webinar = container.querySelector<HTMLElement>("[data-task-id='x']")!
    const post = container.querySelector<HTMLElement>("[data-task-id='a']")!
    fireEvent.keyDown(webinar, { key: "x" })
    fireEvent.keyDown(post, { key: "x" })
    expect(webinar.getAttribute("data-state")).toBe("selected")
    expect(within(post).getByRole("checkbox", { name: "Select task" }).getAttribute("aria-checked")).toBe("true")
    fireEvent.keyDown(post, { key: "C", shiftKey: true })
    await screen.findByRole("toolbar", { name: "2 tasks selected" }, { timeout: 10_000 })
    fireEvent.click(await screen.findByRole("option", { name: /Cycle 4/ }))
    await waitFor(() => expect(bulk).toHaveBeenCalledTimes(1))
    const [tasks, change] = bulk.mock.calls[0]
    expect(tasks.map((t) => t.task_uuid).sort()).toEqual(["a", "x"])
    expect(change).toEqual({ field: "cycle", value: "c4" })
  }, 15_000)

  it("offers the backlog itself among the cycles, and C alone does nothing here", async () => {
    answer = backlog()
    const { container } = render(<ProjectBacklog projectId="p" />)
    const post = container.querySelector<HTMLElement>("[data-task-id='a']")!
    fireEvent.keyDown(post, { key: "c" })
    expect(screen.queryByRole("toolbar")).toBeNull()
    fireEvent.keyDown(post, { key: "C", shiftKey: true })
    fireEvent.click(await screen.findByRole("option", { name: "Backlog" }, { timeout: 10_000 }))
    await waitFor(() => expect(bulk).toHaveBeenCalledWith([expect.objectContaining({ task_uuid: "a" })], { field: "cycle", value: "" }))
  }, 15_000)

  it("counts a project in points from its first paint: the unit comes in the backlog's own answer", () => {
    answer = backlog({ estimate_points: 2, capacity_points: 10, scale: { kind: "fibonacci", extended: false, allow_zero: false, count_unestimated: true, sizes: [1, 2, 3, 5, 8], labels: ["1", "2", "3", "5", "8"] } })
    answer.data.backlog.cycles[0].estimate_points = 8
    const { container } = render(<ProjectBacklog projectId="p" />)
    expect(container.querySelector("[data-backlog-totals]")!.textContent).toBe("12 tasks · 2 points")
    expect(screen.getByRole("button", { name: "2 tasks · 8 of 10 points. Set Cycle 3's capacity" })).toBeTruthy()
  })

  it("lets an admin set a cycle's capacity at its totals, painting first", async () => {
    answer = backlog()
    render(<ProjectBacklog projectId="p" />)
    fireEvent.click(screen.getByRole("button", { name: "2 tasks · 30 h of 24 h. Set Cycle 3's capacity" }))
    const hours = await screen.findByRole("textbox", { name: "Capacity for Cycle 3" })
    expect(screen.getByText(/Its project's is 24 h, from its recent cycles/)).toBeTruthy()
    expect(screen.queryByRole("button", { name: /Use the project's/ })).toBeNull()
    fireEvent.change(hours, { target: { value: "lots" } })
    fireEvent.click(screen.getByRole("button", { name: "Save" }))
    expect(await screen.findByText("Write it in hours, like 40, 37.5 or 2h 30m.")).toBeTruthy()
    expect(api.setCycleCapacity).not.toHaveBeenCalled()
    fireEvent.change(hours, { target: { value: "36" } })
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Save" })))
    expect(api.setCycleCapacity).toHaveBeenCalledWith("p", "c3", 2160, false)
    expect(answer!.data.backlog.cycles[0].capacity_minutes).toBe(2160)
  })

  it("gives a cycle with its own capacity the project's again", async () => {
    answer = backlog()
    answer.data.backlog.cycles[0].capacity_minutes = 2160
    render(<ProjectBacklog projectId="p" />)
    fireEvent.click(screen.getByRole("button", { name: "2 tasks · 30 h of 36 h. Set Cycle 3's capacity" }))
    expect(((await screen.findByRole("textbox", { name: "Capacity for Cycle 3" })) as HTMLInputElement).value).toBe("36")
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Use the project's (24 h)" })))
    expect(api.setCycleCapacity).toHaveBeenCalledWith("p", "c3", null, false)
    expect(answer!.data.backlog.cycles[0].capacity_minutes).toBeUndefined()
  })

  it("moves a task from its sheet on a phone, painting first", async () => {
    mobile = true
    answer = backlog()
    const { container } = render(<ProjectBacklog projectId="p" />)
    expect(container.querySelector("[aria-roledescription='draggable task']")).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: "Move Plan the webinar" }))
    fireEvent.click(await screen.findByRole("button", { name: "Cycle 4" }))
    await waitFor(() => expect(api.setTaskCycle).toHaveBeenCalledWith("x", "c4"))
    expect(answer!.data.backlog.cycles[1].tasks.map((t) => t.task_uuid)).toEqual(["x"])
    expect(answer!.data.backlog.count).toBe(11)
  })
})

// DESIGN-BUILD-2 on B3: the sub-task mark is spec B's (ink-2 arc on a line-2
// track, closing in the done green), never the orange progress gradient; the
// capacity bar takes status colours, not area hues.
describe("the backlog's marks", () => {
  it("draws sub-tasks in ink, closing in green when all are done", async () => {
    const { SubtaskMark } = await import("@/components/work/backlog/SubtaskMark")
    const { container, rerender } = render(<SubtaskMark done={2} total={5} />)
    expect(container.querySelector("linearGradient")).toBeNull()
    expect(container.querySelectorAll("circle")[1].getAttribute("class")).toContain("stroke-ink-2")
    expect(screen.getByRole("img", { name: "2 of 5 sub-tasks done" }).textContent).toBe("2/5")
    rerender(<SubtaskMark done={5} total={5} />)
    expect(container.querySelectorAll("circle")[1].getAttribute("class")).toContain("stroke-success")
  })

  it("fills the capacity bar in status colours", () => {
    answer = backlog()
    const { container } = render(<ProjectBacklog projectId="p" />)
    expect(container.querySelector("[data-load='over'] span")!.className).toContain("bg-destructive")
    cleanup()
    answer = backlog({ capacity_minutes: 99999 })
    const under = render(<ProjectBacklog projectId="p" />).container
    expect(under.querySelector("[data-load='under'] span")!.className).toContain("bg-success")
  })
})

// B3b: cycles that run themselves, set from the backlog's head.
describe("the backlog's cycle schedule", () => {
  const schedule = { weeks: 2, cooldown_weeks: 1, upcoming: 2, roll_over: true, add_started: false, starts_at: "2026-10-12T00:00:00Z" }

  it("says when cycles run themselves; a member reads it and changes nothing", () => {
    answer = backlog()
    answer.data.schedule = schedule
    answer.data.can_edit = false
    const { container } = render(<ProjectBacklog projectId="p" />)
    expect(container.querySelector("[data-schedule]")!.textContent).toContain("Every 2 weeks, then a week off · 2 ready ahead · unfinished tasks move on")
    expect(screen.queryByRole("button", { name: "Change schedule" })).toBeNull()
  })

  // linear-12 part 4: anyone who sees the project may have its cycles in their calendar.
  it("offers a member who can't plan the cycles in their calendar", async () => {
    answer = backlog()
    answer.data.can_edit = false
    render(<ProjectBacklog projectId="p" />)
    fireEvent.click(screen.getByRole("button", { name: "Add to calendar" }))
    expect(await screen.findByRole("dialog", { name: "Show cycles in your calendar" })).toBeTruthy()
  })

  it("lets an admin make the cycles run themselves, the backlog's orange action left alone", async () => {
    answer = backlog()
    render(<ProjectBacklog projectId="p" />)
    const run = screen.getByRole("button", { name: "Run cycles automatically" })
    expect(run.className).toContain("bg-raised")
    fireEvent.click(run)
    const dialog = await screen.findByRole("dialog", { name: "Run cycles automatically" })
    fireEvent.click(within(dialog).getByRole("radio", { name: "1 week" }))
    fireEvent.click(within(dialog).getByRole("switch", { name: "A week off between cycles" }))
    await act(async () => fireEvent.click(within(dialog).getByRole("button", { name: "Run them" })))
    expect(api.saveSchedule).toHaveBeenCalledWith("p", expect.objectContaining({ weeks: 1, cooldown_weeks: 1, upcoming: 2, roll_over: true }))
    expect(mutate).toHaveBeenCalled()
  })

  it("lets an admin have tasks join the running cycle when they start (linear-12)", async () => {
    answer = backlog()
    answer.data.schedule = schedule
    render(<ProjectBacklog projectId="p" />)
    fireEvent.click(screen.getByRole("button", { name: "Change schedule" }))
    const dialog = await screen.findByRole("dialog", { name: "Cycle schedule" })
    const started = within(dialog).getByRole("switch", { name: "Add tasks to the running cycle when they start" })
    expect(started.getAttribute("aria-checked")).toBe("false")
    fireEvent.click(started)
    await act(async () => fireEvent.click(within(dialog).getByRole("button", { name: "Save" })))
    expect(api.saveSchedule).toHaveBeenCalledWith("p", expect.objectContaining({ add_started: true, roll_over: true }))
  })

  it("hands the cycles back when stopped", async () => {
    answer = backlog()
    answer.data.schedule = schedule
    render(<ProjectBacklog projectId="p" />)
    fireEvent.click(screen.getByRole("button", { name: "Change schedule" }))
    const dialog = await screen.findByRole("dialog", { name: "Cycle schedule" })
    expect(within(dialog).getByRole("radio", { name: "2 weeks" }).getAttribute("aria-checked")).toBe("true")
    fireEvent.click(within(dialog).getByRole("button", { name: "Stop running them" }))
    // It asks first, in place.
    expect(within(dialog).getByText("Stop running cycles? The ones made so far stay.")).toBeTruthy()
    expect(api.stopSchedule).not.toHaveBeenCalled()
    await act(async () => fireEvent.click(within(dialog).getByRole("button", { name: "Stop" })))
    expect(api.stopSchedule).toHaveBeenCalledWith("p")
  })
})

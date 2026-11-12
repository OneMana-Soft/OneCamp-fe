import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import type { DependencyTask } from "@/types/task"

const setDependency = vi.fn(async () => true)
vi.mock("@/hooks/useTaskDependencies", () => ({ useTaskDependencies: () => setDependency }))
vi.mock("@/hooks/useProjectStatuses", () => ({ useProjectStatuses: () => ({ options: [] }) }))
// The project's tasks, as the timeline's read answers them (nothing, until a test says).
const unread = () => ({ data: undefined as unknown, isLoading: false, isError: undefined as unknown, mutate: vi.fn() })
// Each read's url and request config, as the app sends them.
const read = vi.hoisted(() => ({ now: undefined as unknown as { data: unknown; isLoading: boolean; isError: unknown; mutate: () => void }, asked: [] as [string, unknown][] }))
vi.mock("@/hooks/useFetch", () => ({
  useFetch: (url: string, _shape?: unknown, _fetch?: unknown, request?: unknown) => {
    if (url) read.asked.push([url, request])
    return read.now
  },
}))

const { TaskDependencies } = await import("@/components/task/TaskDependencies")

const design: DependencyTask = { task_uuid: "design", task_name: "Design", task_status: "todo", "task_blocked_by|kind": "ss", "task_blocked_by|lag": 2 }
const ship: DependencyTask = { task_uuid: "ship", task_name: "Ship", task_status: "todo" }

read.now = unread()

afterEach(() => {
  cleanup()
  setDependency.mockClear()
  read.now = unread()
  read.asked = []
})

describe("how a task waits on another", () => {
  it("shows beside each task, in a few words and as a sentence", () => {
    render(<TaskDependencies taskUUID="build" taskName="Build" projectUUID="p" canEdit={false} waitingOn={[design]} blocking={[ship]} onOpen={() => {}} />)
    expect(screen.getByText("Start to start +2d").getAttribute("title")).toBe("Build can't start until 2 days after Design starts.")
    // Ship waits on Build, finish to start: it says so from Ship's side.
    expect(screen.getByText("Finish to start").getAttribute("title")).toBe("Ship can't start until Build finishes.")
    expect(screen.queryByRole("button", { name: /Change how/ })).toBeNull()
  })

  it("can be changed by the project's admins, kind and lag", async () => {
    render(<TaskDependencies taskUUID="build" taskName="Build" projectUUID="p" canEdit waitingOn={[design]} blocking={[ship]} onOpen={() => {}} />)
    fireEvent.click(screen.getByRole("button", { name: /Design starts\. Change how/ }))
    fireEvent.click(await screen.findByRole("radio", { name: /Finish to finish/ }))
    const lag = screen.getByLabelText("Lag in days")
    expect((lag as HTMLInputElement).value).toBe("2")
    fireEvent.change(lag, { target: { value: "400" } })
    expect(screen.getByText(/up to 365 either way/)).toBeTruthy()
    expect((screen.getByRole("button", { name: "Save" }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.change(lag, { target: { value: "-1" } })
    expect(screen.getByText("Build can't finish until 1 day before Design finishes.")).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Save" }))
    expect(setDependency).toHaveBeenCalledWith("build", "design", false, { kind: "ff", lag: -1 })
  })

  it("changes one it's blocking from the other task's side, and saves nothing unchanged", async () => {
    render(<TaskDependencies taskUUID="build" taskName="Build" projectUUID="p" canEdit waitingOn={[]} blocking={[ship]} onOpen={() => {}} />)
    fireEvent.click(screen.getByRole("button", { name: /Ship can't start until Build finishes\. Change how/ }))
    fireEvent.click(await screen.findByRole("button", { name: "Save" }))
    expect(setDependency).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole("button", { name: /Change how/ }))
    fireEvent.click(await screen.findByRole("radio", { name: /Start to start/ }))
    fireEvent.click(screen.getByRole("button", { name: "Save" }))
    expect(setDependency).toHaveBeenCalledWith("ship", "build", false, { kind: "ss", lag: 0 })
  })
})

describe("adding a task it waits on", () => {
  const draw = () => render(<TaskDependencies taskUUID="build" taskName="Build" projectUUID="p" canEdit waitingOn={[design]} blocking={[ship]} onOpen={() => {}} />)

  it("offers the project's tasks, none taken or canceled, and waits on the one picked", async () => {
    const tasks = [
      { task_uuid: "build", task_name: "Build", task_status: "todo" },
      { task_uuid: "design", task_name: "Design", task_status: "todo" },
      { task_uuid: "ship", task_name: "Ship", task_status: "todo" },
      { task_uuid: "old", task_name: "Old idea", task_status: "canceled" },
      { task_uuid: "docs", task_name: "Write the docs", task_status: "todo" },
    ]
    read.now = { ...unread(), data: { data: { tasks, total: tasks.length, can_edit: true } } }
    draw()
    fireEvent.click(screen.getByRole("button", { name: "Add a task it waits on" }))
    const docs = await screen.findByRole("option", { name: /Write the docs/ })
    expect(screen.getAllByRole("option").map((o) => o.textContent)).toEqual(["Write the docs"])
    fireEvent.click(docs)
    await waitFor(() => expect(setDependency).toHaveBeenCalledTimes(1))
    expect(setDependency.mock.calls[0]).toEqual(["build", "docs", false, undefined])
  })

  it("says the project's tasks couldn't be read, with Try again, which reads them again", async () => {
    read.now = { ...unread(), isError: new Error("Network Error") }
    draw()
    fireEvent.click(screen.getByRole("button", { name: "Add a task it waits on" }))
    expect(await screen.findByText("Couldn't load this project's tasks")).toBeTruthy()
    expect(screen.queryByText("Loading…")).toBeNull()
    // The picker says the failure itself, so its read is made with OWN_ERRORS: the app's toast for a failed read stays quiet.
    const timeline = read.asked.filter(([url]) => url === "/project/p/timeline")
    expect(timeline).not.toHaveLength(0)
    for (const [, request] of timeline) expect(request).toEqual({ suppressErrorToast: true })
    fireEvent.click(screen.getByRole("button", { name: "Try again" }))
    expect(read.now.mutate).toHaveBeenCalledTimes(1)
  })
})

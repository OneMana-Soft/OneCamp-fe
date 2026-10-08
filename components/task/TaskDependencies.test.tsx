import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import type { DependencyTask } from "@/types/task"

const setDependency = vi.fn(async () => true)
vi.mock("@/hooks/useTaskDependencies", () => ({ useTaskDependencies: () => setDependency }))
vi.mock("@/hooks/useProjectStatuses", () => ({ useProjectStatuses: () => ({ options: [] }) }))
vi.mock("@/hooks/useFetch", () => ({ useFetch: () => ({ data: undefined, isLoading: false, isError: undefined, mutate: vi.fn() }) }))

const { TaskDependencies } = await import("@/components/task/TaskDependencies")

const design: DependencyTask = { task_uuid: "design", task_name: "Design", task_status: "todo", "task_blocked_by|kind": "ss", "task_blocked_by|lag": 2 }
const ship: DependencyTask = { task_uuid: "ship", task_name: "Ship", task_status: "todo" }

afterEach(() => {
  cleanup()
  setDependency.mockClear()
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

import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"

// /app/task/Q4-12 (A8K): a key finds its task's id first and the page opens
// the task by it; a key that names nothing the reader can open says so, with
// the way back, as an id that names nothing does.

let param = "Q4-12"
const resolveTask = vi.fn()
vi.mock("next/navigation", () => ({ useParams: () => ({ "task-id": param }) }))
vi.mock("@/components/rightPanel/taskInfoPanel", () => ({ default: ({ taskUUID }: { taskUUID: string }) => <p data-testid="panel">{taskUUID}</p> }))
vi.mock("@/lib/work/keysApi", async (orig) => ({ ...(await orig<typeof import("@/lib/work/keysApi")>()), resolveTask: (k: string) => resolveTask(k) }))
vi.mock("@/components/ui/load-failure-state", () => ({ LoadFailureState: ({ goneDetail, back }: { goneDetail: string; back: { label: string } }) => <p data-testid="failure">{goneDetail} {back.label}</p> }))

const { default: Page } = await import("./[task-id]/page")

afterEach(() => {
  cleanup()
  resolveTask.mockReset()
})

describe("the task page by key", () => {
  it("opens the task the key names", async () => {
    param = "q4-12"
    resolveTask.mockResolvedValue({ task_uuid: "uuid-12", task_key: "Q4-12" })
    render(<Page />)
    expect(screen.getByLabelText("Opening Q4-12")).toBeTruthy()
    expect((await screen.findByTestId("panel")).textContent).toBe("uuid-12")
    expect(resolveTask).toHaveBeenCalledWith("q4-12")
  })

  it("says plainly when the key names nothing the reader can open", async () => {
    param = "Q4-999"
    resolveTask.mockRejectedValue({ response: { status: 404 } })
    render(<Page />)
    const failure = await screen.findByTestId("failure")
    expect(failure.textContent).toContain("There's no task Q4-999 that you can open.")
    expect(failure.textContent).toContain("Back to My Tasks")
  })

  it("opens an id as it always did, without looking anything up", () => {
    param = "a2573bba-d50b-44a2-b9f0-94df8d7310a7"
    render(<Page />)
    expect(screen.getByTestId("panel").textContent).toBe(param)
    expect(resolveTask).not.toHaveBeenCalled()
  })
})

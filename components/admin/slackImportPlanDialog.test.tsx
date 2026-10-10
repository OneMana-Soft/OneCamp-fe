import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"

let answer: unknown = null
const plan = vi.fn(async () => {
  throw answer
})
vi.mock("@/services/slackImportService", async (orig) => ({
  ...(await orig<typeof import("@/services/slackImportService")>()),
  planSlackImport: () => plan(),
}))
const toast = vi.fn()
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast }) }))

const { SlackImportPlanDialog } = await import("./SlackImportPlanDialog")

afterEach(() => {
  cleanup()
  toast.mockClear()
  plan.mockClear()
})

describe("planning a Slack import", () => {
  // Run started it from another tab while it was planned: said in the dialog
  // and the import loaded again, rather than "Planning failed".
  it("says so and loads the import again when it changed in the meantime", async () => {
    answer = { response: { status: 409, data: { code: "job_changed", error: "This import changed in the meantime." } } }
    const onChanged = vi.fn()
    render(<SlackImportPlanDialog jobId="j1" open onOpenChange={() => {}} onComplete={() => {}} onChanged={onChanged} />)
    await waitFor(() => expect(screen.getByRole("alert").textContent).toBe("This import changed in the meantime."))
    expect(onChanged).toHaveBeenCalledOnce()
    expect(toast).not.toHaveBeenCalled()
    // Nothing to plan again here: the import moved on.
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull()
  })

  // Any other failure is said in the dialog too, with a way to try again; it
  // was a "Planning failed" toast over a dialog with no plan and nothing to press.
  it("says why any other plan failed, in the dialog, and tries again", async () => {
    answer = { response: { status: 400, data: { error: "zip safety check failed" } } }
    const onChanged = vi.fn()
    render(<SlackImportPlanDialog jobId="j1" open onOpenChange={() => {}} onComplete={() => {}} onChanged={onChanged} />)
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("zip safety check failed"))
    expect(toast).not.toHaveBeenCalled()
    expect(onChanged).not.toHaveBeenCalled()
    expect(plan).toHaveBeenCalledTimes(1)
    await act(async () => void fireEvent.click(screen.getByRole("button", { name: "Try again" })))
    await waitFor(() => expect(plan).toHaveBeenCalledTimes(2))
  })

  it("says the last run is still stopping, once", async () => {
    answer = { response: { status: 409, data: { code: "run_alive", error: "The last run of this import is still stopping. Try again in a moment." } } }
    render(<SlackImportPlanDialog jobId="j1" open onOpenChange={() => {}} onComplete={() => {}} />)
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("The last run of this import is still stopping."))
    expect(toast).not.toHaveBeenCalled()
    expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy()
  })
})

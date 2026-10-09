import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen, waitFor } from "@testing-library/react"

let answer: unknown = null
vi.mock("@/services/slackImportService", async (orig) => ({
  ...(await orig<typeof import("@/services/slackImportService")>()),
  planSlackImport: vi.fn(async () => {
    throw answer
  }),
}))
const toast = vi.fn()
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast }) }))

const { SlackImportPlanDialog } = await import("./SlackImportPlanDialog")

afterEach(() => {
  cleanup()
  toast.mockClear()
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
  })

  it("still says why any other plan failed", async () => {
    answer = { response: { status: 400, data: { error: "zip safety check failed" } } }
    const onChanged = vi.fn()
    render(<SlackImportPlanDialog jobId="j1" open onOpenChange={() => {}} onComplete={() => {}} onChanged={onChanged} />)
    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Planning failed", description: "zip safety check failed" })))
    expect(onChanged).not.toHaveBeenCalled()
    expect(screen.queryByRole("alert")).toBeNull()
  })
})

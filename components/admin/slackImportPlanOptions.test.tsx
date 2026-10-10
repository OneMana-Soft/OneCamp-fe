import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"

const thePlan = {
  job_id: "j1",
  user_count: 120,
  user_new: 100,
  user_merge: 20,
  channel_count: 42,
  channel_conflict: 3,
  message_count: 12400,
  thread_count: 3100,
  file_count: 830,
  file_bytes: 1288490188,
  warnings: [],
}
const planSlackImport = vi.fn<(id: string, opts: unknown) => Promise<typeof thePlan>>(async () => thePlan)
const runSlackImport = vi.fn<(id: string, opts: unknown) => Promise<void>>(async () => {})
vi.mock("@/services/slackImportService", async (orig) => ({
  ...(await orig<typeof import("@/services/slackImportService")>()),
  planSlackImport: (id: string, opts: unknown) => planSlackImport(id, opts),
  runSlackImport: (id: string, opts: unknown) => runSlackImport(id, opts),
}))
const toast = vi.fn()
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast }) }))

const { SlackImportPlanDialog } = await import("./SlackImportPlanDialog")

afterEach(() => {
  cleanup()
  planSlackImport.mockClear()
  runSlackImport.mockClear()
  toast.mockClear()
})

const open = () => render(<SlackImportPlanDialog jobId="j1" open onOpenChange={() => {}} onComplete={() => {}} />)

describe("a Slack import's plan and options", () => {
  it("reads as quiet labels with their counts in ink, while it reads the export as rows of that shape", async () => {
    let finish: (v: typeof thePlan) => void = () => {}
    planSlackImport.mockImplementationOnce(() => new Promise((r) => (finish = r)))
    open()
    expect(screen.getByRole("status", { name: "Reading the export" })).toBeTruthy()
    finish(thePlan)
    expect(await screen.findByText("120 (100 new, 20 already here)")).toBeTruthy()
    expect(screen.getByText("42 (3 names already taken)")).toBeTruthy()
    expect(screen.getByText("830 (1.2 GB)")).toBeTruthy()
  })

  // Clearing the size field sent a cap of 1 MB, so nearly every file was
  // skipped, without a word.
  it("says the size cap is missing rather than skipping every file over 1 MB", async () => {
    open()
    const cap = await screen.findByLabelText("Skip files larger than (MB)")
    fireEvent.change(cap, { target: { value: "" } })
    expect(screen.getByText("Enter a size from 1 to 10,240 MB.")).toBeTruthy()
    expect(cap.getAttribute("aria-invalid")).toBe("true")
    const run = screen.getByRole("button", { name: "Run import" }) as HTMLButtonElement
    expect(run.disabled).toBe(true)
    fireEvent.click(run)
    expect(runSlackImport).not.toHaveBeenCalled()
  })

  // The counts were made once, with the options as they stood, and stayed
  // after the options changed, so "3 names already taken" could be wrong
  // by the time Run was pressed.
  it("says the counts are from before a change, and counts again with it", async () => {
    open()
    await screen.findByText("42 (3 names already taken)")
    fireEvent.change(screen.getByLabelText("Channel name prefix (optional)"), { target: { value: "slack-" } })
    expect(screen.getByText("These counts are from before your changes.")).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Count again" }))
    await waitFor(() => expect(planSlackImport).toHaveBeenCalledTimes(2))
    expect(planSlackImport.mock.calls[1][1]).toMatchObject({ channel_prefix: "slack-" })
    await waitFor(() => expect(screen.queryByText("These counts are from before your changes.")).toBeNull())
  })

  // The prefix field was w-40 and the size cap w-28, so two fields in one
  // list started at two places once the row put them at its end.
  it("gives the options' two fields one width and one height", async () => {
    open()
    const prefix = await screen.findByLabelText("Channel name prefix (optional)")
    const cap = screen.getByLabelText("Skip files larger than (MB)")
    for (const field of [prefix, cap]) {
      expect(field.className).toContain("w-40")
      expect(field.className).toMatch(/(^|\s)h-8(\s|$)/)
    }
  })
})

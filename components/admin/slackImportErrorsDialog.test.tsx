import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"

const getSlackImportErrors = vi.fn()
vi.mock("@/services/slackImportService", async (orig) => ({
  ...(await orig<typeof import("@/services/slackImportService")>()),
  getSlackImportErrors: (...a: unknown[]) => getSlackImportErrors(...a),
}))
const toast = vi.fn()
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast }), toast: (...a: unknown[]) => toast(...a) }))

const { SlackImportErrorsDialog } = await import("./SlackImportErrorsDialog")

const row = (i: number) => ({
  id: `s${i}`,
  severity: "error",
  code: "file_download_failed",
  message: `The file in message ${i} couldn't be downloaded from Slack.`,
  slack_id: `F0${i}`,
  created_at: "2026-10-09T10:00:00Z",
})

afterEach(() => {
  cleanup()
  getSlackImportErrors.mockReset()
  toast.mockReset()
})

describe("a Slack import's error log", () => {
  // A failed load raised a toast and then said "No matching entries.", so the
  // dialog claimed a clean import behind the toast that contradicted it.
  it("says the log couldn't load, in the dialog, and tries again", async () => {
    getSlackImportErrors.mockRejectedValueOnce(new Error("Network Error")).mockResolvedValueOnce([row(1)])
    render(<SlackImportErrorsDialog jobId="j1" open onOpenChange={() => {}} />)
    fireEvent.click(await screen.findByRole("button", { name: "Try again" }))
    expect(await screen.findByText("The file in message 1 couldn't be downloaded from Slack.")).toBeTruthy()
    expect(toast).not.toHaveBeenCalled()
    expect(screen.queryByText(/No matching entries/)).toBeNull()
  })

  it("filters by how serious, as a choice of one", async () => {
    getSlackImportErrors.mockResolvedValue([row(1)])
    render(<SlackImportErrorsDialog jobId="j1" open onOpenChange={() => {}} />)
    await screen.findByText("The file in message 1 couldn't be downloaded from Slack.")
    expect(screen.getByRole("radiogroup", { name: "Show" })).toBeTruthy()
    fireEvent.click(screen.getByRole("radio", { name: "Fatal" }))
    expect(screen.getByRole("radio", { name: "Fatal" }).getAttribute("aria-checked")).toBe("true")
  })
})

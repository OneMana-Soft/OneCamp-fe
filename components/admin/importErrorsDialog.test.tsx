import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"

const getImportErrors = vi.fn()
vi.mock("@/services/importService", async (orig) => ({
  ...(await orig<typeof import("@/services/importService")>()),
  getImportErrors: (...a: unknown[]) => getImportErrors(...a),
}))

const { ImportErrorsDialog } = await import("./ImportErrorsDialog")

const row = (i: number, severity = "warning") => ({
  id: `e${i}`,
  severity,
  code: "attachment_too_large",
  message: `File ${i} was over the size cap and was left out.`,
  source_id: `T-${i}`,
  created_at: "2026-10-09T10:00:00Z",
})

afterEach(() => {
  cleanup()
  getImportErrors.mockReset()
})

describe("an import's error log", () => {
  // A log that failed to load said "No errors recorded.", which is the one
  // thing an admin checking a failed import must not be told by mistake.
  it("says the log couldn't load, and tries again", async () => {
    getImportErrors.mockRejectedValueOnce(new Error("Network Error")).mockResolvedValueOnce([row(1)])
    render(<ImportErrorsDialog jobId="j1" open onOpenChange={() => {}} />)
    fireEvent.click(await screen.findByRole("button", { name: "Try again" }))
    expect(await screen.findByText("File 1 was over the size cap and was left out.")).toBeTruthy()
    expect(screen.queryByText(/No errors recorded/)).toBeNull()
  })

  // It read the first 200 and stopped, with no sign there were more.
  it("shows more than one page", async () => {
    getImportErrors
      .mockResolvedValueOnce(Array.from({ length: 100 }, (_, i) => row(i)))
      .mockResolvedValueOnce([row(100), row(101)])
    render(<ImportErrorsDialog jobId="j1" open onOpenChange={() => {}} />)
    fireEvent.click(await screen.findByRole("button", { name: "Show more" }))
    expect(await screen.findByText("File 101 was over the size cap and was left out.")).toBeTruthy()
    expect(getImportErrors).toHaveBeenLastCalledWith("j1", undefined, 100, 100)
    expect(screen.queryByRole("button", { name: "Show more" })).toBeNull()
  })

  it("filters by how serious, as a choice of one", async () => {
    getImportErrors.mockResolvedValue([row(1)])
    render(<ImportErrorsDialog jobId="j1" open onOpenChange={() => {}} />)
    await screen.findByText("File 1 was over the size cap and was left out.")
    const warnings = screen.getByRole("radio", { name: "Warnings" })
    expect(warnings.getAttribute("aria-checked")).toBe("false")
    fireEvent.click(warnings)
    await waitFor(() => expect(getImportErrors).toHaveBeenLastCalledWith("j1", "warning", 100, 0))
    expect(screen.getByRole("radio", { name: "Warnings" }).getAttribute("aria-checked")).toBe("true")
  })
})

// The log reads as the rest of the import tab: the shared segmented control,
// severities as a dot and a word, an empty log as an empty state, and Show
// more in the footer beside Close, as the Slack import's log has it.
describe("how an import's error log reads", () => {
  it("filters with the shared segmented control and says severity as a dot and a word", async () => {
    getImportErrors.mockResolvedValue([row(1, "fatal")])
    render(<ImportErrorsDialog jobId="j1" open onOpenChange={() => {}} />)
    await screen.findByText("File 1 was over the size cap and was left out.")
    expect(screen.getByRole("radio", { name: "All" }).className).toContain("data-[state=checked]:bg-card")
    const fatal = screen.getByText("Fatal", { selector: "[data-status-word]" })
    expect(fatal.getAttribute("data-status-word")).toBe("danger")
    expect(fatal.className).not.toMatch(/border|bg-destructive/)
  })

  it("says an empty log with the workspace's tile, not a line in a box", async () => {
    getImportErrors.mockResolvedValue([])
    render(<ImportErrorsDialog jobId="j1" open onOpenChange={() => {}} />)
    expect(await screen.findByText("Nothing was logged")).toBeTruthy()
    expect(document.querySelector(".hue-sun")).toBeTruthy()
    expect(document.querySelector("p.rounded-md")).toBeNull()
  })

  it("keeps Show more in the footer, beside Close", async () => {
    getImportErrors.mockResolvedValue(Array.from({ length: 100 }, (_, i) => row(i)))
    render(<ImportErrorsDialog jobId="j1" open onOpenChange={() => {}} />)
    const more = await screen.findByRole("button", { name: "Show more" })
    // The dialog's corner X is named Close too; this is the footer's.
    const close = screen.getAllByRole("button", { name: "Close" }).find((b) => b.textContent?.trim() === "Close")!
    expect(more.closest("[class*='justify-between']")).toBe(close.closest("[class*='justify-between']"))
  })
})

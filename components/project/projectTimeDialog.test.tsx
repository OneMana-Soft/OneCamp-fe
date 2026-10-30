import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { pinTestClock } from "@/lib/testing/testClock"

// The time report's Download CSV, when it fails: said once, in a toast, in the
// server's own words when it has some. Asked for as a file, a refusal comes
// back as one too, so its words are read back from the file
// (lib/utils/downloadRefusal) before they are said. jsdom's Blob has no
// text(), so an answer here is one by its shape.

const { toast, downloadFrom, report } = vi.hoisted(() => ({
  toast: vi.fn(),
  downloadFrom: vi.fn(),
  report: {
    from: "2026-10-01T00:00:00Z",
    to: "2026-11-01T00:00:00Z",
    seconds: 5400,
    billable_seconds: 0,
    entries: 2,
    running: 0,
    by_person: [{ id: "maya", name: "Maya Chen", seconds: 5400, billable_seconds: 0 }],
    by_task: [{ id: "t1", name: "Book the venue", seconds: 5400, billable_seconds: 0 }],
    truncated: false,
  },
}))
vi.mock("@/lib/axiosInstance", async () => (await import("@/lib/testing/axiosInstance")).axiosInstanceModule({}))
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast }) }))
vi.mock("@/hooks/useFetch", () => ({ useFetch: () => ({ data: { data: report }, isLoading: false, isError: false, mutate: vi.fn() }) }))
vi.mock("@/lib/utils/download", () => ({ downloadFrom: (...a: unknown[]) => downloadFrom(...a) }))
vi.mock("@/components/project/ProjectRatesDialog", () => ({ ProjectRatesDialog: () => null }))
vi.mock("@/components/project/ProjectInvoices", () => ({ ProjectInvoices: () => null }))

import { ProjectTimeDialog } from "./ProjectTimeDialog"

// The dialog reads its range from today.
pinTestClock()

afterEach(() => {
  cleanup()
  toast.mockReset()
  downloadFrom.mockReset()
})

const refused = (status: number, file: { type: string; text: () => Promise<string> }) =>
  Object.assign(new Error(`Request failed with status code ${status}`), { response: { status, data: file } })

async function downloadAndFail(error: Error) {
  downloadFrom.mockRejectedValueOnce(error)
  render(<ProjectTimeDialog projectId="p1" projectName="Spring fair" open onOpenChange={() => {}} />)
  fireEvent.click(screen.getByRole("button", { name: "Download CSV" }))
  await waitFor(() => expect(toast).toHaveBeenCalledTimes(1))
  return toast.mock.calls[0][0] as { title: string; description: string; variant: string }
}

describe("the time report's download, refused", () => {
  it("says the refusal in the server's own words, read back from the file it came as", async () => {
    const why = "A report covers a year at most."
    const said = await downloadAndFail(refused(400, { type: "application/json", text: async () => JSON.stringify({ msg: why }) }))
    expect(said).toMatchObject({ title: "Couldn't download the report", description: why, variant: "destructive" })
  })

  it("says its own words when the answer holds none of the server's (a proxy's page)", async () => {
    const said = await downloadAndFail(refused(502, { type: "text/html", text: async () => "<html>Bad gateway</html>" }))
    expect(said).toMatchObject({ title: "Couldn't download the report", description: "Try again in a moment.", variant: "destructive" })
  })
})

import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"

const uploadSlackExport = vi.fn()
vi.mock("@/services/slackImportService", async (orig) => ({
  ...(await orig<typeof import("@/services/slackImportService")>()),
  uploadSlackExport: (...a: unknown[]) => uploadSlackExport(...a),
}))
vi.mock("@/hooks/useFetch", () => ({ useFetch: () => ({ data: { max_bytes: 5 * 1024 ** 3 } }) }))
const toast = vi.fn()
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast }), toast: (...a: unknown[]) => toast(...a) }))

const { SlackImportUploadDialog } = await import("./SlackImportUploadDialog")

const zip = () => new File([new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2, 3])], "acme-slack-export.zip", { type: "application/zip" })
const pdf = () => new File(["%PDF-1.7"], "brief.pdf", { type: "application/pdf" })

afterEach(() => {
  cleanup()
  uploadSlackExport.mockReset()
  toast.mockReset()
})

const pick = (file: File) => fireEvent.change(screen.getByLabelText("Export file"), { target: { files: [file] } })

const ready = async (props: Partial<React.ComponentProps<typeof SlackImportUploadDialog>> = {}) => {
  const onUploaded = vi.fn()
  const onShowExisting = vi.fn()
  render(<SlackImportUploadDialog open onOpenChange={() => {}} onUploaded={onUploaded} onShowExisting={onShowExisting} {...props} />)
  pick(zip())
  await screen.findByText(/acme-slack-export\.zip/)
  return { onUploaded, onShowExisting }
}

describe("uploading a Slack export", () => {
  // A wrong file was a red toast, and the file picked before it stayed
  // chosen, so Upload sent a file the admin had just tried to replace.
  it("says a file that isn't a ZIP under the field, and lets it go", async () => {
    await ready()
    pick(pdf())
    expect(await screen.findByText(/Slack exports come as a \.zip file/)).toBeTruthy()
    expect(screen.getByLabelText("Export file").getAttribute("aria-invalid")).toBe("true")
    expect(screen.queryByText(/acme-slack-export\.zip/)).toBeNull()
    expect((screen.getByRole("button", { name: "Upload and plan" }) as HTMLButtonElement).disabled).toBe(true)
    expect(toast).not.toHaveBeenCalled()
  })

  // A multi-GB upload could not be stopped: the dialog refused to close and
  // had no Stop.
  it("can stop an upload, and says it stopped", async () => {
    uploadSlackExport.mockImplementation(
      (_f: File, _n: string, _s: string, _p: unknown, signal: AbortSignal) =>
        new Promise((_, reject) =>
          signal.addEventListener("abort", () => reject(Object.assign(new Error("canceled"), { name: "CanceledError", code: "ERR_CANCELED" }))),
        ),
    )
    const { onUploaded } = await ready()
    fireEvent.click(screen.getByRole("button", { name: "Upload and plan" }))
    fireEvent.click(await screen.findByRole("button", { name: "Stop upload" }))
    expect(await screen.findByText(/Upload stopped/)).toBeTruthy()
    expect(onUploaded).not.toHaveBeenCalled()
    expect(screen.getByRole("button", { name: "Upload and plan" })).toBeTruthy()
    expect(toast).not.toHaveBeenCalled()
  })

  // The same export again was a red "Already imported" toast, and then the
  // plan dialog opened on the import that had already finished.
  it("says it has seen this export before, and offers to show that import", async () => {
    uploadSlackExport.mockRejectedValue({ response: { status: 409, data: { code: "duplicate_upload", existing_job_id: "old-1", error: "duplicate" } } })
    const { onUploaded, onShowExisting } = await ready()
    fireEvent.click(screen.getByRole("button", { name: "Upload and plan" }))
    await waitFor(() => expect(screen.getByRole("alert").textContent).toMatch(/You've uploaded this export before/))
    fireEvent.click(screen.getByRole("button", { name: "Show that import" }))
    expect(onShowExisting).toHaveBeenCalledWith("old-1")
    expect(onUploaded).not.toHaveBeenCalled()
    expect(toast).not.toHaveBeenCalled()
  })

  it("says a workspace already importing, in the dialog", async () => {
    uploadSlackExport.mockRejectedValue({ response: { status: 409, data: { code: "active_job", error: "busy" } } })
    await ready()
    fireEvent.click(screen.getByRole("button", { name: "Upload and plan" }))
    await waitFor(() => expect(screen.getByRole("alert").textContent).toMatch(/Another import of this workspace is waiting or running/))
    expect(toast).not.toHaveBeenCalled()
  })
})

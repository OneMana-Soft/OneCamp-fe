import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"

// Replace with a new version (docs F1b). Closing the dialog while the new
// version uploads (Cancel, Escape, the scrim) stops the upload: it went on,
// and later said "is now version 4" to someone who had cancelled (code
// review of F1b).

const sent = vi.hoisted(() => ({ signal: undefined as AbortSignal | undefined, answer: undefined as ((v: unknown) => void) | undefined }))
vi.mock("@/lib/axiosInstance", async () => (await import("@/lib/testing/axiosInstance")).axiosInstanceModule({
  default: {
    post: (_url: string, _form: unknown, config: { signal?: AbortSignal }) =>
      new Promise((resolve) => {
        sent.signal = config.signal
        sent.answer = resolve
      }),
  },
}))
const toast = vi.hoisted(() => vi.fn())
vi.mock("@/hooks/use-toast", () => ({ toast }))

import { ReplaceVersionDialog } from "./ReplaceVersionDialog"

afterEach(() => {
  cleanup()
  toast.mockClear()
})

describe("a new version", () => {
  it("stops uploading when the dialog is cancelled, and never says it became a version", async () => {
    const onClose = vi.fn()
    render(<ReplaceVersionDialog file={{ id: "file-1", title: "brief.pdf" }} onClose={onClose} />)
    const input = document.querySelector<HTMLInputElement>('input[type="file"]')!
    fireEvent.change(input, { target: { files: [new File(["v4"], "brief.pdf", { type: "application/pdf" })] } })
    fireEvent.click(screen.getByRole("button", { name: "Upload new version" }))
    expect(sent.signal?.aborted).toBe(false)
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }))
    expect(onClose).toHaveBeenCalled()
    expect(sent.signal?.aborted).toBe(true)
    // The server's answer, had it come anyway, says nothing.
    await act(async () => sent.answer?.({ data: { msg: "ok", data: { n: 4, attachment_id: "att-4", name: "brief.pdf", size_bytes: 2, mime: "application/pdf" } } }))
    expect(toast).not.toHaveBeenCalled()
  })
})

import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"

const toast = vi.fn()
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast }), toast: (...a: unknown[]) => toast(...a) }))

const ArchiveRunJobDialog = (await import("./ArchiveRunJobDialog")).default

afterEach(() => {
  cleanup()
  toast.mockReset()
})

describe("archiving now", () => {
  // The dialog closed the moment its button was pressed, so its own
  // "Running…" never showed and a refusal had nowhere to be said.
  it("stays open and says it is archiving until the server answers", async () => {
    let finish: () => void = () => {}
    const onConfirm = vi.fn(() => new Promise<void>((r) => (finish = r)))
    const onOpenChange = vi.fn()
    render(<ArchiveRunJobDialog open onOpenChange={onOpenChange} onConfirm={onConfirm} entityLabel="Channel Posts" entityType="posts" />)
    expect(screen.getByRole("alertdialog", { name: "Archive old channel posts now?" })).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Archive now" }))
    expect(await screen.findByRole("button", { name: "Archiving…" })).toBeTruthy()
    expect(onOpenChange).not.toHaveBeenCalled()
    finish()
    await waitFor(() => expect(screen.getByRole("button", { name: "Archive now" })).toBeTruthy())
  })

  it("says a refusal in the dialog, in plain words", async () => {
    const onConfirm = vi.fn(async () => {
      throw { response: { status: 409, data: { code: "already_running", error: "archive job already running for posts" } } }
    })
    render(<ArchiveRunJobDialog open onOpenChange={() => {}} onConfirm={onConfirm} entityLabel="Channel Posts" entityType="posts" />)
    fireEvent.click(screen.getByRole("button", { name: "Archive now" }))
    await waitFor(() => expect(screen.getByRole("alert").textContent).toBe("This is being archived right now. Wait for that run to finish."))
    expect(toast).not.toHaveBeenCalled()
  })

  // Its description put paragraphs inside the description's own paragraph.
  it("draws no paragraph inside a paragraph", () => {
    render(<ArchiveRunJobDialog open onOpenChange={() => {}} onConfirm={async () => {}} entityLabel="Channel Posts" entityType="posts" />)
    expect(document.querySelector("p p")).toBeNull()
  })
})

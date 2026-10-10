import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"

const put = vi.fn()
vi.mock("@/lib/axiosInstance", () => ({
  default: { put: (...a: unknown[]) => put(...a) },
  OWN_ERRORS: { suppressErrorToast: true },
}))
const toast = vi.fn()
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast }), toast: (...a: unknown[]) => toast(...a) }))

const ArchiveEditPolicyDialog = (await import("./ArchiveEditPolicyDialog")).default

const policy = (entity_type: string, over: Record<string, unknown> = {}) => ({
  id: "p1",
  entity_type,
  retention_days: 365,
  auto_archive: false,
  archive_completed_tasks: true,
  archive_inactive_channels_days: 90,
  compress_attachments: false,
  purge_after_days: 0,
  ...over,
})

afterEach(() => {
  cleanup()
  put.mockReset()
  toast.mockReset()
})

const open = (p: ReturnType<typeof policy>, onSuccess = vi.fn(), onOpenChange = vi.fn()) =>
  render(<ArchiveEditPolicyDialog open onOpenChange={onOpenChange} onSuccess={onSuccess} policy={p} />)

describe("editing an archive rule", () => {
  // "Validation Error: Retention days must be between 7 and 3650" was a toast.
  it("says a number of days out of range under its field, and saves nothing", () => {
    open(policy("posts"))
    const days = screen.getByLabelText("Archive items older than (days)")
    fireEvent.change(days, { target: { value: "3" } })
    fireEvent.click(screen.getByRole("button", { name: "Save" }))
    expect(screen.getByText("Enter a number of days from 7 to 3,650.")).toBeTruthy()
    expect(days.getAttribute("aria-invalid")).toBe("true")
    expect(document.activeElement).toBe(days)
    expect(put).not.toHaveBeenCalled()
    expect(toast).not.toHaveBeenCalled()
  })

  // Every rule offered "Archive completed tasks", "Inactive channel days" and
  // "Compress attachments". Only the first does anything, and only for tasks:
  // the server stores the other two and never reads them.
  it("offers only the settings that do something for its kind", () => {
    open(policy("posts"))
    expect(screen.getByRole("switch", { name: "Archive automatically" })).toBeTruthy()
    expect(screen.queryByText(/finished tasks/)).toBeNull()
    expect(screen.queryByText(/Inactive/i)).toBeNull()
    expect(screen.queryByText(/Compress/i)).toBeNull()
    cleanup()
    open(policy("tasks"))
    expect(screen.getByRole("switch", { name: "Only archive finished tasks" })).toBeTruthy()
    cleanup()
    open(policy("attachments"))
    expect(screen.getByLabelText("Delete from storage after (days)")).toBeTruthy()
  })

  it("saves what it shows, and leaves the rest as it was", async () => {
    put.mockResolvedValue({ data: { msg: "Policy updated successfully" } })
    const onSuccess = vi.fn()
    const onOpenChange = vi.fn()
    open(policy("posts"), onSuccess, onOpenChange)
    fireEvent.change(screen.getByLabelText("Archive items older than (days)"), { target: { value: "400" } })
    fireEvent.click(screen.getByRole("switch", { name: "Archive automatically" }))
    fireEvent.click(screen.getByRole("button", { name: "Save" }))
    await waitFor(() => expect(onSuccess).toHaveBeenCalledOnce())
    const [url, payload] = put.mock.calls[0]
    expect(url).toBe("/admin/archive/policies/posts")
    expect(payload).toEqual({ retention_days: 400, auto_archive: true })
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Archive rules saved" }))
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it("says why a save failed, in the dialog, and stays open", async () => {
    put.mockRejectedValue(new Error("Network Error"))
    const onOpenChange = vi.fn()
    open(policy("posts"), vi.fn(), onOpenChange)
    fireEvent.click(screen.getByRole("button", { name: "Save" }))
    await waitFor(() => expect(screen.getByRole("alert").textContent).toBe("Couldn't reach the server. Check your connection and try again."))
    expect(onOpenChange).not.toHaveBeenCalledWith(false)
  })
})

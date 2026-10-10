import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"

// The list of recently archived items, and the restore request.
const get = vi.fn()
const post = vi.fn()
vi.mock("@/lib/axiosInstance", () => ({
  default: { get: (...a: unknown[]) => get(...a), post: (...a: unknown[]) => post(...a) },
  OWN_ERRORS: { suppressErrorToast: true },
}))
const toast = vi.fn()
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast }), toast: (...a: unknown[]) => toast(...a) }))

const ArchiveRestoreDialog = (await import("./ArchiveRestoreDialog")).default

const items = [
  { id: "p1", name: "Kickoff notes for the Northwind rebrand", archived_at: "2026-10-05T02:01:00Z" },
  { id: "p2", name: "Q3 retro: what we'd change", archived_at: "2026-10-05T02:01:00Z" },
]

afterEach(() => {
  cleanup()
  get.mockReset()
  post.mockReset()
  toast.mockReset()
})

const open = (onSuccess = vi.fn(), onOpenChange = vi.fn()) =>
  render(<ArchiveRestoreDialog open onOpenChange={onOpenChange} onSuccess={onSuccess} />)

describe("restoring archived items", () => {
  // The row and its checkbox both toggled, so a click on the box ticked it and
  // unticked it in the same moment: only a click on the words worked.
  it("ticks an item once when its box is clicked", async () => {
    get.mockResolvedValue({ data: { items, total: 2 } })
    open()
    const box = await screen.findByRole("checkbox", { name: "Kickoff notes for the Northwind rebrand" })
    fireEvent.click(box)
    expect(box.getAttribute("aria-checked")).toBe("true")
    expect(screen.getByText("1 selected")).toBeTruthy()
  })

  it("ticks an item when its name is clicked", async () => {
    get.mockResolvedValue({ data: { items, total: 2 } })
    open()
    fireEvent.click(await screen.findByText("Q3 retro: what we'd change"))
    expect(screen.getByRole("checkbox", { name: "Q3 retro: what we'd change" }).getAttribute("aria-checked")).toBe("true")
  })

  // A failed load said "No recently archived channel posts found", which is a
  // claim about the workspace, and offered nothing to do.
  it("says the list couldn't load, and tries again", async () => {
    get.mockRejectedValueOnce(new Error("Network Error")).mockResolvedValueOnce({ data: { items, total: 2 } })
    open()
    fireEvent.click(await screen.findByRole("button", { name: "Try again" }))
    expect(await screen.findByText("Kickoff notes for the Northwind rebrand")).toBeTruthy()
    expect(screen.queryByText(/No recently archived/)).toBeNull()
  })

  it("names its search box", async () => {
    get.mockResolvedValue({ data: { items, total: 2 } })
    open()
    expect(await screen.findByRole("searchbox", { name: "Search archived items" })).toBeTruthy()
  })

  it("says why a restore was refused, in the dialog, and stays open", async () => {
    get.mockResolvedValue({ data: { items, total: 2 } })
    post.mockRejectedValue({ response: { status: 409, data: { code: "archive_running", error: "an archive job is already running" } } })
    const onOpenChange = vi.fn()
    open(vi.fn(), onOpenChange)
    fireEvent.click(await screen.findByRole("checkbox", { name: "Kickoff notes for the Northwind rebrand" }))
    fireEvent.click(screen.getByRole("button", { name: "Restore 1 item" }))
    await waitFor(() => expect(screen.getByRole("alert").textContent).toBe("Archiving is running right now. Try again when it finishes."))
    expect(onOpenChange).not.toHaveBeenCalledWith(false)
  })

  it("says how many came back, and closes", async () => {
    get.mockResolvedValue({ data: { items, total: 2 } })
    post.mockResolvedValue({ data: { msg: "Items restored", count: 2 } })
    const onSuccess = vi.fn()
    const onOpenChange = vi.fn()
    open(onSuccess, onOpenChange)
    fireEvent.click(await screen.findByRole("checkbox", { name: "Select all" }))
    fireEvent.click(screen.getByRole("button", { name: "Restore 2 items" }))
    await waitFor(() => expect(onSuccess).toHaveBeenCalledOnce())
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Restored 2 items" }))
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })
})

describe("how the restore list reads", () => {
  // The generic skeleton rows stood in for rows of another shape.
  it("loads in its rows' own shape: a box, a name and when it was archived", () => {
    get.mockReturnValue(new Promise(() => {}))
    open()
    const status = screen.getByRole("status", { name: /Loading archived/ })
    const rows = status.querySelectorAll("li")
    expect(rows.length).toBe(4)
    expect(rows[0].className).toContain("px-3 py-2")
    expect(rows[0].querySelector(".size-4")).toBeTruthy()
  })

  // On a phone the search field is 44px; Refresh beside it was 32px.
  it("keeps Refresh at the search field's height on a phone", () => {
    get.mockReturnValue(new Promise(() => {}))
    open()
    const refresh = screen.getByRole("button", { name: "Refresh" })
    expect(refresh.className).toContain("h-11")
    expect(refresh.className).toContain("md:h-8")
  })
})

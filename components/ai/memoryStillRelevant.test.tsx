import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { Provider } from "react-redux"
import { configureStore } from "@reduxjs/toolkit"
import type { MemoryItem } from "@/services/memoryService"
import { pinTestClock } from "@/lib/testing/testClock"

// C11 (V-581): a commitment overdue past needing its person now (over 14
// days) leaves Home and the nudges, and the memory page asks of it instead:
// the API marks it `stale` (commitmentIsStale). "Still relevant?" offers Done
// (the row's Resolve), New date (the row's own due-date picker: a date ahead
// is no longer stale, by the server's word) and Drop (its Delete: a soft
// delete on the server), with the page's own Undo. No new route.

pinTestClock(new Date(2026, 10, 6, 10, 0))

const listWorkspaceMemory = vi.hoisted(() => vi.fn())
const updateMemoryStatus = vi.hoisted(() => vi.fn<(id: string, status: string) => Promise<void>>(async () => {}))
const deleteMemoryItem = vi.hoisted(() => vi.fn<(id: string) => Promise<void>>(async () => {}))
const updateMemoryDue = vi.hoisted(() => vi.fn<(id: string, due: string) => Promise<void>>(async () => {}))
vi.mock("@/services/memoryService", async (orig) => ({ ...(await orig<object>()), listWorkspaceMemory, updateMemoryStatus, deleteMemoryItem, updateMemoryDue }))
// The kind's mark comes from the one kind -> mark map (DESIGN-BUILD-118 F1): a stand-in proves the row takes it from there.
const KindMark = vi.hoisted(() => (p: { className?: string }) => <svg data-kind-mark="" className={p.className} />)
vi.mock("@/lib/ui/memoryKindIcon", async (orig) => {
  const m = await orig<{ MEMORY_KIND_ICON: object }>()
  return { ...m, MEMORY_KIND_ICON: { ...m.MEMORY_KIND_ICON, commitment: KindMark } }
})
vi.mock("@/components/common/withFeature", async (orig) => ({ ...(await orig<object>()), withAI: <P,>(C: P) => C }))
vi.mock("@/hooks/useFetch", async (orig) => ({ ...(await orig<object>()), useFetchOnlyOnce: () => ({ data: undefined }) }))
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }), useSearchParams: () => new URLSearchParams(), usePathname: () => "/app/ai/memory" }))
type Toasted = { title?: string; action?: { props: { onClick: () => void } } }
const toast = vi.hoisted(() => vi.fn<(t: Toasted) => void>())
vi.mock("@/hooks/use-toast", async (orig) => ({ ...(await orig<object>()), useToast: () => ({ toast }) }))

const { default: WorkspaceMemoryPanel } = await import("@/components/ai/WorkspaceMemoryPanel")
const { default: userSlice } = await import("@/store/slice/userSlice")

const item = (id: string, content: string, extra: Partial<MemoryItem> = {}): MemoryItem => ({
  id,
  kind: "commitment",
  content,
  status: "open",
  source_type: "channel",
  confidence: 0.9,
  created_at: "2026-06-01T09:00:00Z",
  updated_at: "2026-06-01T09:00:00Z",
  ...extra,
})
const stale = item("m-old", "Send the June board pack", { due_at: "2026-06-08", stale: true })
const recent = item("m-new", "Send the vendor shortlist", { due_at: "2026-11-02" })

function page() {
  const store = configureStore({ reducer: { [userSlice.name]: userSlice.reducer }, middleware: (d) => d({ serializableCheck: false }) })
  return render(
    <Provider store={store}>
      <WorkspaceMemoryPanel />
    </Provider>,
  )
}

const rowOf = (text: string) => screen.getByText(text).closest("li") as HTMLElement

afterEach(() => {
  cleanup()
  listWorkspaceMemory.mockReset()
  // Cleared, not reset: a reset vi.fn returns undefined, and the page's flush chains .catch on a commit.
  updateMemoryStatus.mockClear()
  deleteMemoryItem.mockClear()
  updateMemoryDue.mockReset()
  updateMemoryDue.mockImplementation(async () => {})
  toast.mockReset()
})

describe("a stale commitment on the memory page", () => {
  it("asks Still relevant? of a stale one only", async () => {
    listWorkspaceMemory.mockResolvedValue({ items: [stale, recent], counts: {} })
    page()
    await screen.findByText("Send the June board pack")
    const old = within(rowOf("Send the June board pack"))
    expect(old.getByText("Still relevant?")).toBeTruthy()
    expect(old.getByRole("button", { name: "Done" })).toBeTruthy()
    expect(old.getByRole("button", { name: "Drop" })).toBeTruthy()
    expect(within(rowOf("Send the vendor shortlist")).queryByText("Still relevant?")).toBeNull()
  })

  it("answers Done, New date and Drop together, Done the one secondary", async () => {
    listWorkspaceMemory.mockResolvedValue({ items: [stale], counts: {} })
    page()
    await screen.findByText("Send the June board pack")
    const old = within(rowOf("Send the June board pack"))
    const answers = [old.getByRole("button", { name: "Done" }), old.getByRole("button", { name: "New date" }), old.getByRole("button", { name: "Drop" })]
    // One group, so the three wrap together under the question on a phone, never apart.
    expect(new Set(answers.map((b) => b.parentElement)).size).toBe(1)
    expect(answers.map((b) => b.textContent)).toEqual(["Done", "New date", "Drop"])
  })

  it("New date opens the row's own due-date picker, writes the day picked and stops asking", { timeout: 20000 }, async () => {
    listWorkspaceMemory.mockResolvedValue({ items: [stale], counts: {} })
    page()
    await screen.findByText("Send the June board pack")
    const old = within(rowOf("Send the June board pack"))
    fireEvent.click(old.getByRole("button", { name: "New date" }))
    // The row's one DateProperty (the shared picker, a sheet on a phone), not a second one.
    await waitFor(() => expect(old.getByRole("button", { name: /^Due: / }).getAttribute("aria-expanded")).toBe("true"), { timeout: 8000 })
    fireEvent.click(await screen.findByRole("button", { name: "Tomorrow" }, { timeout: 8000 }))
    await waitFor(() => expect(updateMemoryDue).toHaveBeenCalledWith("m-old", "2026-11-07"))
    await waitFor(() => expect(old.queryByText("Still relevant?")).toBeNull())
    expect(screen.getByText("Send the June board pack")).toBeTruthy()
    expect(updateMemoryStatus).not.toHaveBeenCalled()
    expect(deleteMemoryItem).not.toHaveBeenCalled()
  })

  it("asks again when the new date can't be written", { timeout: 20000 }, async () => {
    updateMemoryDue.mockRejectedValue(new Error("down"))
    listWorkspaceMemory.mockResolvedValue({ items: [stale], counts: {} })
    page()
    await screen.findByText("Send the June board pack")
    const old = within(rowOf("Send the June board pack"))
    fireEvent.click(old.getByRole("button", { name: "New date" }))
    fireEvent.click(await screen.findByRole("button", { name: "Tomorrow" }, { timeout: 8000 }))
    await waitFor(() => expect(toast.mock.calls.at(-1)![0].title).toBe("Couldn't update due date"))
    expect(old.getByText("Still relevant?")).toBeTruthy()
  })

  it("marks a commitment with the kind map's mark", async () => {
    listWorkspaceMemory.mockResolvedValue({ items: [recent], counts: {} })
    page()
    await screen.findByText("Send the vendor shortlist")
    expect(rowOf("Send the vendor shortlist").querySelector("[data-kind-mark]")).toBeTruthy()
  })

  it("Done resolves it, as Resolve does, after the Undo's while", async () => {
    listWorkspaceMemory.mockResolvedValue({ items: [stale], counts: {} })
    const { unmount } = page()
    await screen.findByText("Send the June board pack")
    act(() => fireEvent.click(within(rowOf("Send the June board pack")).getByRole("button", { name: "Done" })))
    expect(screen.queryByText("Send the June board pack")).toBeNull()
    expect(toast.mock.calls.at(-1)![0].title).toBe("Marked resolved")
    expect(updateMemoryStatus).not.toHaveBeenCalled()
    unmount()
    expect(updateMemoryStatus).toHaveBeenCalledWith("m-old", "resolved")
    expect(deleteMemoryItem).not.toHaveBeenCalled()
  })

  it("Drop deletes it (soft, on the server), and Undo keeps it", async () => {
    listWorkspaceMemory.mockResolvedValue({ items: [stale], counts: {} })
    const { unmount } = page()
    await screen.findByText("Send the June board pack")
    act(() => fireEvent.click(within(rowOf("Send the June board pack")).getByRole("button", { name: "Drop" })))
    expect(screen.queryByText("Send the June board pack")).toBeNull()
    act(() => toast.mock.calls.at(-1)![0].action!.props.onClick())
    expect(screen.getByText("Send the June board pack")).toBeTruthy()
    act(() => fireEvent.click(within(rowOf("Send the June board pack")).getByRole("button", { name: "Drop" })))
    unmount()
    expect(deleteMemoryItem).toHaveBeenCalledTimes(1)
    expect(deleteMemoryItem).toHaveBeenCalledWith("m-old")
    expect(updateMemoryStatus).not.toHaveBeenCalled()
  })

  it("asks nothing in the Resolved view", async () => {
    listWorkspaceMemory.mockResolvedValue({ items: [stale], counts: {} })
    page()
    await screen.findByText("Send the June board pack")
    listWorkspaceMemory.mockResolvedValue({ items: [{ ...stale, status: "resolved" }], counts: {} })
    await act(async () => fireEvent.click(screen.getByRole("tab", { name: /Resolved/ })))
    await screen.findByText("Send the June board pack")
    expect(screen.queryByText("Still relevant?")).toBeNull()
  })
})

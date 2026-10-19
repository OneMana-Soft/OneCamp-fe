import * as React from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react"
import { configureStore } from "@reduxjs/toolkit"
import { Provider } from "react-redux"
import type { Editor } from "@tiptap/core"
import { TooltipProvider } from "@/components/ui/tooltip"
import threadsSlice from "@/store/slice/threadsSlice"
import userSlice from "@/store/slice/userSlice"
import type { ThreadView } from "@/components/threads/types"
import type { TableField } from "@/services/tableService"
import { pinTestClock } from "@/lib/testing/testClock"

// A row's comments in its record (tables A8): the threads on the row and its
// cells, each a docs thread card that says where it is; every state said; a
// comment started on the row, or on the cell its column's button named.

vi.mock("@/context/MediaQueryContext", () => ({ useMedia: () => ({ isMobile: false, isDesktop: true, isTablet: false }) }))
vi.mock("@/hooks/useClientConfig", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/hooks/useClientConfig")>()),
  useClientConfig: () => ({ upload_limit_mb: 10, upload_limit_bytes: 10 * 1024 * 1024 }),
}))
// The thread cards read the people and files they show: every fetching hook
// answers nothing, and nothing reaches the network (SWR would outlive jsdom).
vi.mock("@/hooks/useFetch", async (importOriginal) => {
  const real = await importOriginal<Record<string, unknown>>()
  const quiet = () => ({ data: undefined, isLoading: false, isError: undefined, mutate: vi.fn() })
  const me = () => ({ data: { data: { user_uuid: "me", user_name: "Maya" } }, isLoading: false, isError: undefined, mutate: vi.fn() })
  return Object.fromEntries(Object.entries(real).map(([k, v]) => [k, typeof v === "function" ? (k === "useFetchOnlyOnce" ? me : quiet) : v]))
})
vi.mock("@/components/threads/threadsApi", () => ({
  listThreads: vi.fn(),
  getThread: vi.fn(),
  createThread: vi.fn(),
  replyToThread: vi.fn(),
  resolveThread: vi.fn(),
  reopenThread: vi.fn(),
  reanchorThread: vi.fn(),
  markThreadRead: vi.fn(),
  editThreadComment: vi.fn(),
  removeThreadComment: vi.fn(),
  reactToThreadComment: vi.fn(),
  unreactToThreadComment: vi.fn(),
}))
const api = await import("@/components/threads/threadsApi")
const { default: RowComments } = await import("./RowComments")
const { rowCommentsChanged } = await import("@/lib/tables/rowComments")

const fields: TableField[] = [
  { id: "name", table_id: "t", name: "Name", type: "text", config: "{}", position: 0 },
  { id: "status", table_id: "t", name: "Status", type: "text", config: "{}", position: 1 },
]
const thread = (id: string, over: Partial<ThreadView> = {}): ThreadView => ({
  id,
  resource_kind: "table_row",
  resource_uuid: "r1",
  anchor: { kind: "none" },
  status: "open",
  created_by: "me",
  created_at: "2026-10-17T09:00:00Z",
  updated_at: "2026-10-17T09:00:00Z",
  comments: [{ comment_uuid: `${id}-c`, thread_id: id, comment_text: `<p>${id} words</p>`, comment_by: { user_uuid: "me", user_name: "Maya" } as never, comment_created_at: "2026-10-17T09:00:00Z" }],
  participants: [],
  unread: false,
  can_reply: true,
  can_resolve: true,
  ...over,
})

function show(props: Partial<React.ComponentProps<typeof RowComments>> = {}) {
  const store = configureStore({ reducer: { threads: threadsSlice.reducer, users: userSlice.reducer } })
  const onTargetDone = vi.fn()
  const onCellCounts = vi.fn()
  render(
    <Provider store={store}>
      <TooltipProvider>
        <RowComments rowId="r1" fields={fields} target={null} onTargetDone={onTargetDone} onCellCounts={onCellCounts} {...props} />
      </TooltipProvider>
    </Provider>,
  )
  return { onTargetDone, onCellCounts }
}

async function editor(): Promise<Editor> {
  let ed: Editor | undefined
  await waitFor(() => {
    ed = (document.querySelector("[data-row-comment-box] .ProseMirror") as unknown as { editor?: Editor } | null)?.editor
    expect(ed).toBeTruthy()
  })
  return ed!
}

pinTestClock()
beforeEach(() => vi.clearAllMocks())
afterEach(() => cleanup())

describe("a row's comments", () => {
  it("says there are none yet, and offers a box for the row that takes no files", async () => {
    vi.mocked(api.listThreads).mockResolvedValue([])
    show()
    await waitFor(() => expect(screen.getByText(/No comments yet/)).toBeTruthy())
    expect(screen.getByRole("textbox", { name: "Comment on this row" })).toBeTruthy()
    expect(screen.queryByRole("button", { name: "Attach files" })).toBeNull()
    expect(vi.mocked(api.listThreads).mock.calls[0][0]).toEqual({ kind: "table_row", uuid: "r1" })
  })

  it("says an error is an error, and reads again on Try again", async () => {
    vi.mocked(api.listThreads).mockRejectedValueOnce({ response: { data: { msg: "That thread or page no longer exists." } } })
    show()
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("no longer exists"))
    vi.mocked(api.listThreads).mockResolvedValueOnce([thread("t1")])
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Try again" })))
    await waitFor(() => expect(screen.getByText("t1 words")).toBeTruthy())
  })

  it("shows each thread where it is, counts the open ones, and folds the resolved", async () => {
    vi.mocked(api.listThreads).mockResolvedValue([
      thread("t1"),
      thread("t2", { anchor: { kind: "cell", meta: { field: "status" } } }),
      thread("t3", { status: "resolved", resolved_at: "2026-10-17T10:00:00Z" }),
    ])
    const { onCellCounts } = show()
    await waitFor(() => expect(screen.getByText("t2 words")).toBeTruthy())
    expect(screen.getByText("On this row")).toBeTruthy()
    expect(screen.getByText("On Status")).toBeTruthy()
    expect(screen.getByText("· 2")).toBeTruthy()
    expect(onCellCounts).toHaveBeenLastCalledWith({ status: 1 })
    expect(screen.queryByText("t3 words")).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: "Show 1 resolved thread" }))
    expect(screen.getByText("t3 words")).toBeTruthy()
  })

  it("starts a thread on the row, and one on the cell its column named", async () => {
    vi.mocked(api.listThreads).mockResolvedValue([])
    vi.mocked(api.createThread).mockImplementation(async (_res, anchor) => thread("new", { anchor }))
    const { onTargetDone } = show({ target: "status" })
    expect(screen.getByText("On Status")).toBeTruthy()
    const ed = await editor()
    act(() => {
      ed.commands.insertContent("Is this still blocked?")
    })
    fireEvent.keyDown(document.querySelector("[data-row-comment-box] .ProseMirror")!, { key: "Enter", metaKey: true })
    await waitFor(() => expect(api.createThread).toHaveBeenCalledTimes(1))
    expect(vi.mocked(api.createThread).mock.calls[0][0]).toEqual({ kind: "table_row", uuid: "r1" })
    expect(vi.mocked(api.createThread).mock.calls[0][1]).toEqual({ kind: "cell", meta: { field: "status" } })
    await waitFor(() => expect(onTargetDone).toHaveBeenCalled())
  })

  it("lets go of the cell for the whole row", () => {
    vi.mocked(api.listThreads).mockResolvedValue([])
    const { onTargetDone } = show({ target: "status" })
    fireEvent.click(screen.getByRole("button", { name: "Comment on the whole row instead" }))
    expect(onTargetDone).toHaveBeenCalled()
  })

  it("reads the row's threads again when the table's topic says they changed", async () => {
    vi.mocked(api.listThreads).mockResolvedValue([])
    show()
    await waitFor(() => expect(api.listThreads).toHaveBeenCalledTimes(1))
    vi.mocked(api.listThreads).mockResolvedValue([thread("t9")])
    await act(async () => rowCommentsChanged("r1"))
    await waitFor(() => expect(screen.getByText("t9 words")).toBeTruthy())
  })

  it("edits, reacts to and removes a comment through the thread it is in", async () => {
    vi.mocked(api.listThreads).mockResolvedValue([thread("t1"), thread("t2")])
    vi.mocked(api.editThreadComment).mockResolvedValue({ comment_uuid: "t2-c", thread_id: "t2", comment_text: "<p>fixed</p>", comment_updated_at: "2026-10-17T11:00:00Z" } as never)
    vi.mocked(api.reactToThreadComment).mockResolvedValue("reaction-1")
    vi.mocked(api.removeThreadComment).mockResolvedValue()
    const store = configureStore({ reducer: { threads: threadsSlice.reducer } })
    const wrapper = ({ children }: { children: React.ReactNode }) => <Provider store={store}>{children}</Provider>
    const { useRowThreads } = await import("./useRowThreads")
    const { result } = renderHook(() => useRowThreads("r1", { user_uuid: "me", user_name: "Maya", user_profile_object_key: "" }), { wrapper })
    await waitFor(() => expect(result.current.threads).toHaveLength(2))
    await act(() => result.current.actions.edit("t2-c", "<p>fixed</p>"))
    expect(api.editThreadComment).toHaveBeenCalledWith("t2", "t2-c", "<p>fixed</p>")
    await act(() => result.current.actions.react("t2-c", "thumbs_up"))
    expect(api.reactToThreadComment).toHaveBeenCalledWith("t2", "t2-c", "thumbs_up")
    await act(() => result.current.actions.remove("t2-c"))
    expect(api.removeThreadComment).toHaveBeenCalledWith("t2", "t2-c")
    // A comment that isn't there any more is said so, without a request.
    await expect(result.current.actions.edit("gone", "<p>x</p>")).rejects.toThrow("That comment isn't here any more.")
  })
})

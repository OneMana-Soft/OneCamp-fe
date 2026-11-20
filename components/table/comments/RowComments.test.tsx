import * as React from "react"
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
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

// Each commit of the row's comments with the editor on the page, seen IN the commit: a Profiler's onRender runs after
// its tree's layout effects and before any passive one, so an effect a moment late has not run yet (V-1225 N1).
const commits: { caretInEditor: boolean; text: string }[] = []
const onCommit = () => {
  const pm = document.querySelector("[data-row-comment-box] .ProseMirror") as (HTMLElement & { editor?: Editor }) | null
  if (pm) commits.push({ caretInEditor: !!document.activeElement?.closest(".ProseMirror"), text: pm.editor?.getText() ?? "" })
}
beforeEach(() => {
  commits.length = 0
})

function show(props: Partial<React.ComponentProps<typeof RowComments>> = {}) {
  const store = configureStore({ reducer: { threads: threadsSlice.reducer, users: userSlice.reducer } })
  const onTargetDone = vi.fn()
  const onCellCounts = vi.fn()
  render(
    <Provider store={store}>
      <TooltipProvider>
        <React.Profiler id="row-comments" onRender={onCommit}>
          <RowComments rowId="r1" fields={fields} target={null} onTargetDone={onTargetDone} onCellCounts={onCellCounts} {...props} />
        </React.Profiler>
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

// The row's box at rest: no editor yet, its line by its name (V-1042: the editor waits for the box to be asked for).
const rested = () => waitFor(() => expect(screen.getByRole("textbox", { name: "Comment on this row" }).closest(".ProseMirror")).toBeNull())

pinTestClock()
beforeAll(() => {
  // jsdom lays nothing out: ProseMirror measures ranges as it scrolls the caret into view (a box with text in it, focused).
  if (!Range.prototype.getClientRects) {
    Range.prototype.getClientRects = () => ({ length: 0, item: () => null, [Symbol.iterator]: [][Symbol.iterator] })
    Range.prototype.getBoundingClientRect = () => new DOMRect()
  }
})
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

  // V-1042: an editor made for every record opened or stepped to (a phone sheet's open, Next row and close each paid
  // for its making, its first state and its teardown) when most of them are only read: the box is the composer's
  // resting card until it is asked for, and the editor comes in with the caret in it.
  it("makes no editor until the box is asked for, and focus on the box brings it in with the caret", async () => {
    vi.mocked(api.listThreads).mockResolvedValue([])
    show()
    await waitFor(() => expect(screen.getByText(/No comments yet/)).toBeTruthy())
    expect(document.querySelector("[data-row-comment-box] .ProseMirror"), "no editor before the box is asked for").toBeNull()
    act(() => screen.getByRole("textbox", { name: "Comment on this row" }).focus())
    const ed = await editor()
    await waitFor(() => expect(document.activeElement?.closest(".ProseMirror")).toBeTruthy())
    expect(ed.isDestroyed).toBe(false)
    expect(screen.getAllByRole("textbox", { name: "Comment on this row" })).toHaveLength(1)
  })

  // The editor comes in a moment after the box is asked for: a key typed on the resting line in that moment is the
  // comment's first character, so the line hands it over as it goes (the line's node is gone from the page by then).
  it("hands what was typed on the resting line to the editor as it comes in", async () => {
    vi.mocked(api.listThreads).mockResolvedValue([])
    show()
    await waitFor(() => expect(screen.getByText(/No comments yet/)).toBeTruthy())
    const line = screen.getByRole("textbox", { name: "Comment on this row" })
    act(() => {
      line.focus()
      line.textContent = "h"
    })
    const ed = await editor()
    await waitFor(() => expect(ed.getText()).toBe("h"))
    // The caret is in the editor in the commit it comes in, with what was typed: no frame with the focus nowhere, for
    // a key to be lost in. Seen in that commit, not after it, when an effect a moment late would have done the same.
    expect(commits[0]).toEqual({ caretInEditor: true, text: "h" })
    expect(document.activeElement?.closest(".ProseMirror")).toBeTruthy()
  })

  // The resting line keeps no wrap (white-space: nowrap), so a space typed on it can be a no-break one (U+00A0): the
  // comment gets a plain space, as the editor would have made (V-1225 N2).
  it("hands a no-break space typed on the resting line over as a plain one", async () => {
    vi.mocked(api.listThreads).mockResolvedValue([])
    show()
    await waitFor(() => expect(screen.getByText(/No comments yet/)).toBeTruthy())
    const line = screen.getByRole("textbox", { name: "Comment on this row" })
    act(() => {
      line.focus()
      line.textContent = "hi there "
    })
    const ed = await editor()
    await waitFor(() => expect(ed.getText()).toBe("hi there "))
    expect(ed.getHTML()).not.toMatch(/ |&nbsp;/)
  })

  // MAIN ruling (V-1225 N3): every composer with an editor looks the same at rest, so the row's box shows @ beside send
  // before its editor is made; a press of it makes the editor and starts a mention there, the caret after the "@".
  it("shows @ beside send at rest, and a press of it brings the editor in with a mention started", async () => {
    vi.mocked(api.listThreads).mockResolvedValue([])
    show()
    await rested()
    const at = screen.getByRole("button", { name: "Mention someone" })
    const send = screen.getByRole("button", { name: "Comment" })
    expect(at.compareDocumentPosition(send) & Node.DOCUMENT_POSITION_FOLLOWING, "@ comes before send").toBeTruthy()
    expect(document.querySelector("[data-row-comment-box] .ProseMirror"), "no editor for the @ alone").toBeNull()
    fireEvent.mouseDown(at)
    fireEvent.click(at)
    const ed = await editor()
    await waitFor(() => expect(ed.getText()).toBe("@"))
    expect(ed.state.selection.from).toBe(ed.state.doc.content.size - 1)
    expect(document.activeElement?.closest(".ProseMirror")).toBeTruthy()
    expect(screen.getAllByRole("button", { name: "Mention someone" })).toHaveLength(1)
  })

  it('hands it over as typed: a "<" is a character, never the start of a tag', async () => {
    vi.mocked(api.listThreads).mockResolvedValue([])
    show()
    await waitFor(() => expect(screen.getByText(/No comments yet/)).toBeTruthy())
    const line = screen.getByRole("textbox", { name: "Comment on this row" })
    act(() => {
      line.focus()
      line.textContent = "1<2 <b>ok</b>"
    })
    const ed = await editor()
    await waitFor(() => expect(ed.getText()).toBe("1<2 <b>ok</b>"))
  })

  it("brings the editor in at once for a press of Comment, and for a cell's comment", async () => {
    vi.mocked(api.listThreads).mockResolvedValue([])
    show({ compose: 1 })
    await editor()
    cleanup()
    show({ target: "status" })
    await editor()
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

  // The record's phone sheet pins Comment in its footer (TABLES-BOARDS-25): each press brings the row's box up, with the caret in it.
  describe("at a press of a Comment outside (the record's phone sheet)", () => {
    const box = () => document.querySelector("[data-row-comment-box] .ProseMirror")
    // Each scroll asked of the comment box (jsdom lays nothing out).
    let scrolls = 0
    const scrollIntoView = Element.prototype.scrollIntoView
    beforeEach(() => {
      scrolls = 0
      vi.mocked(api.listThreads).mockResolvedValue([])
      Element.prototype.scrollIntoView = function (this: Element) {
        if (this.matches("[data-row-comment-box]")) scrolls++
      }
    })
    afterEach(() => {
      Element.prototype.scrollIntoView = scrollIntoView
    })
    // The record's body mounts again for each row (key={row.id}); the record counts the presses.
    const shown = () => {
      const store = configureStore({ reducer: { threads: threadsSlice.reducer, users: userSlice.reducer } })
      const at = (rowId: string, compose: number, target: string | null = null) => (
        <Provider store={store}>
          <TooltipProvider>
            <RowComments key={rowId} rowId={rowId} fields={fields} target={target} onTargetDone={vi.fn()} compose={compose} />
          </TooltipProvider>
        </Provider>
      )
      const { rerender } = render(at("r1", 0))
      return (rowId: string, compose: number, target: string | null = null) => rerender(at(rowId, compose, target))
    }
    const settled = () => new Promise((r) => setTimeout(r, 100))

    it("brings its box into view and focus at each press, and neither as it mounts", async () => {
      const at = shown()
      await rested()
      await settled()
      expect(scrolls, "its box scrolled to as it mounted").toBe(0)
      expect(document.activeElement === box(), "no focus before a press").toBe(false)
      at("r1", 1)
      await waitFor(() => expect(document.activeElement).toBe(box()))
      // The focus takes no scroll of its own (preventScroll): the press brings the box into view.
      expect(scrolls, "the box brought into view").toBe(1)
      ;(document.activeElement as HTMLElement).blur()
      at("r1", 2)
      await waitFor(() => expect(document.activeElement).toBe(box()))
      expect(scrolls).toBe(2)
    })

    // The record hands its comments only its own row's presses (RecordPanel); they come in their own chunk, after the
    // sheet and its Comment: a press made before they were in is theirs as they mount (CR-260).
    it("brings its box into view as it mounts with a press counted before it came in", async () => {
      const at = shown()
      await rested()
      at("r2", 1)
      await editor()
      await settled()
      expect(scrolls, "the box brought into view as it mounted").toBe(1)
      // CR-261 F4: the caret too, though the editor comes in after the mount (immediatelyRender: false).
      expect(document.activeElement, "the caret in the box it mounted with a press for").toBe(box())
    })

    it("lets a cell chosen since take over the caret it took as it mounted with a press", async () => {
      const at = shown()
      await rested()
      at("r2", 1)
      await editor()
      await waitFor(() => expect(document.activeElement).toBe(box()))
      at("r2", 1, "status")
      await editor()
      // The cell let go of: the row's box is back, and takes no caret of its own.
      at("r2", 1)
      await rested()
      await settled()
      expect(document.activeElement === box(), "the row's box, back after a cell, took the caret").toBe(false)
    })
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

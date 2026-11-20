import * as React from "react"
import * as Y from "yjs"
import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"

// Can comment (miro-32 head B): a commenter's pin, reply and delete go to
// the server (POST /board/comment), which writes them on the live board as
// theirs; the live board stays read-only for them, so nothing is written to
// it here. Resolve and reactions stay with editors; a commenter deletes only
// their own messages. An editor writes the live board, as before.

const hoisted = vi.hoisted(() => ({ post: vi.fn(), toast: vi.fn(), sheet: { current: false } }))
vi.mock("@/hooks/usePost", () => ({ usePost: () => ({ makeRequest: hoisted.post, isSubmitting: false }) }))
vi.mock("@/hooks/use-toast", async (actual) => ({ ...(await actual<typeof import("@/hooks/use-toast")>()), toast: hoisted.toast }))
vi.mock("@/components/ui/overlayMode", () => ({ useSheetMode: () => hoisted.sheet.current }))
vi.mock("@/components/board/boardMentionInput", () => ({
  // Worded as the real box is: "(use @ to mention)" only where "@" finds people (its caller's search).
  BoardMentionInput: ({ value, onChange, placeholder, inputRef, findPeople }: { value: string; onChange: (v: string) => void; placeholder?: string; inputRef?: React.Ref<HTMLTextAreaElement>; findPeople?: unknown }) => (
    <textarea ref={inputRef} aria-label={findPeople ? `${placeholder} (use @ to mention)` : placeholder} value={value} onChange={(e) => onChange(e.target.value)} />
  ),
}))

import BoardComments from "./boardComments"
import { MemberBoardComments } from "./boardCommentWrites"

const ANN = { id: "u-ann", name: "Ann Lee" }
const CAL = { id: "u-cal", name: "Cal Moss" }
const msg = (id: string, who: { id: string; name: string }, body: string) => ({ id, authorId: who.id, authorName: who.name, body, createdAt: 1 })

function board(messages = [msg("m1", ANN, "Ship it")]) {
  const doc = new Y.Doc()
  doc.getMap("comments").set("p1", { id: "p1", x: 40, y: 50, resolved: false, createdAt: 1, authorId: ANN.id, authorName: ANN.name, messages })
  const api = {
    getAppState: () => ({ scrollX: 0, scrollY: 0, zoom: { value: 1 }, width: 800, height: 600, offsetLeft: 0, offsetTop: 0 }),
    onScrollChange: () => () => {},
    onChange: () => () => {},
  }
  return { doc, provider: { document: doc } as never, api: api as never }
}
const thread = (doc: Y.Doc) => (doc.getMap("comments").get("p1") as { messages: unknown[] }).messages

// The board page's comments (miro-33): MemberBoardComments hands BoardComments the member writes (the mirror, the
// server's ask, the people search), as the guest's piece hands it the link's ask.
function show(b: ReturnType<typeof board>, who: { id: string; name: string }, role: { editable: boolean; commenter?: boolean }, commentMode = false) {
  return render(<MemberBoardComments provider={b.provider} api={b.api} boardId="b1" user={who} commentMode={commentMode} onCommentModeChange={() => {}} {...role} />)
}

const settle = () => act(() => new Promise<void>((done) => setTimeout(done, 0)))

describe("a board's comments, for a commenter", () => {
  afterEach(() => {
    cleanup()
    hoisted.post.mockReset()
    hoisted.toast.mockReset()
  })

  it("replies through the server and writes nothing on the live board", async () => {
    const b = board()
    hoisted.post.mockResolvedValue({ comment: { id: "p1" } })
    show(b, CAL, { editable: false, commenter: true })
    fireEvent.click(await screen.findByRole("button", { name: "Comment by Ann Lee" }))
    await screen.findByText("Ship it") // the thread is a piece of its own
    expect(screen.queryByRole("button", { name: "Resolve this comment" })).toBeNull()
    expect(screen.queryByRole("button", { name: "Add reaction" })).toBeNull()
    fireEvent.change(screen.getByLabelText("Reply… (use @ to mention)"), { target: { value: "Looks good" } })
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Reply" })))
    await waitFor(() => expect(hoisted.post).toHaveBeenCalled())
    expect(hoisted.post).toHaveBeenCalledWith(
      expect.objectContaining({
        apiEndpoint: "/board/comment",
        payload: { board_uuid: "b1", action: "reply", board_comment_id: "p1", comment_text: "Looks good", mentioned_user_uuids: [] },
        showErrorToast: true,
      }),
    )
    // Never the editors' mirror route, never the live map.
    expect(hoisted.post.mock.calls.map(([o]) => o.apiEndpoint)).toEqual(["/board/comment"])
    expect(thread(b.doc)).toHaveLength(1)
  })

  it("places a pin through the server where they click, and opens it as it comes back", async () => {
    const b = board()
    hoisted.post.mockResolvedValue({ comment: { id: "p2" } })
    const { container } = show(b, CAL, { editable: false, commenter: true }, true)
    fireEvent.click(container.firstElementChild as HTMLElement, { clientX: 120, clientY: 80 })
    fireEvent.change(await screen.findByLabelText("Add a comment… (use @ to mention)"), { target: { value: "Why this colour?" } })
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Comment" })))
    await waitFor(() => expect(hoisted.post).toHaveBeenCalled())
    expect(hoisted.post.mock.calls[0][0]).toMatchObject({
      apiEndpoint: "/board/comment",
      payload: { board_uuid: "b1", action: "add", x: 120, y: 80, comment_text: "Why this colour?", mentioned_user_uuids: [] },
    })
    expect(Array.from(b.doc.getMap("comments").keys())).toEqual(["p1"])
    // The server's pin arrives over the board's socket, and opens.
    act(() => b.doc.getMap("comments").set("p2", { id: "p2", x: 120, y: 80, resolved: false, createdAt: 2, authorId: CAL.id, authorName: CAL.name, messages: [msg("m9", CAL, "Why this colour?")] }))
    expect(await screen.findByText("Why this colour?")).toBeTruthy()
  })

  it("deletes only their own messages, through the server", async () => {
    const b = board([msg("m1", ANN, "Ship it"), msg("m2", CAL, "Why?")])
    hoisted.post.mockResolvedValue({ comment: { id: "p1" } })
    show(b, CAL, { editable: false, commenter: true })
    fireEvent.click(await screen.findByRole("button", { name: "Comment by Ann Lee" }))
    await screen.findByText("Ship it") // the thread is a piece of its own
    expect(screen.queryByRole("button", { name: "Delete this comment" })).toBeNull()
    const deletes = screen.getAllByRole("button", { name: "Delete your message" })
    expect(deletes).toHaveLength(1)
    await act(async () => fireEvent.click(deletes[0]))
    await waitFor(() => expect(hoisted.post).toHaveBeenCalled())
    expect(hoisted.post.mock.calls[0][0]).toMatchObject({ apiEndpoint: "/board/comment", payload: { board_uuid: "b1", action: "delete", board_comment_id: "p1", message_id: "m2" } })
    expect(thread(b.doc)).toHaveLength(2)
  })

  it("keeps what they typed, and the focus, until the server takes it; busy meanwhile, sent once", async () => {
    // Their role taken away meanwhile: the post's own toast says why (askComment), and the words wait for another try.
    const held = () => {
      let refuse: (why: Error) => void = () => {}
      hoisted.post.mockReturnValueOnce(new Promise((_, no) => (refuse = no)))
      return (why: string) => act(async () => refuse(new Error(why)))
    }
    // A reply: Reply busy while the ask is under way, a second press asks nothing; refused, the words and the focus stay.
    let refuse = held()
    show(board(), CAL, { editable: false, commenter: true })
    fireEvent.click(await screen.findByRole("button", { name: "Comment by Ann Lee" }))
    const reply = (await screen.findByLabelText("Reply… (use @ to mention)")) as HTMLTextAreaElement
    fireEvent.change(reply, { target: { value: "And the title?" } })
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Reply" })))
    await waitFor(() => expect(hoisted.post).toHaveBeenCalledTimes(1))
    expect(screen.getByRole("button", { name: "Reply" }).getAttribute("aria-busy")).toBe("true")
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Reply" })))
    await settle()
    expect(hoisted.post).toHaveBeenCalledTimes(1)
    await refuse("Only the board's owners, editors and commenters can comment on it.")
    await settle()
    expect(reply.value).toBe("And the title?")
    expect(document.activeElement).toBe(reply)
    expect(screen.getByRole("button", { name: "Reply" }).getAttribute("aria-busy")).toBeNull()
    // Taken: the box empties.
    hoisted.post.mockResolvedValueOnce({ comment: { id: "p1" } })
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Reply" })))
    await waitFor(() => expect(reply.value).toBe(""))
    cleanup()

    // A new pin: refused, its box stays open with the words and the focus; taken, it closes.
    hoisted.post.mockRejectedValueOnce(new Error("This comment is full."))
    const { container } = show(board(), CAL, { editable: false, commenter: true }, true)
    fireEvent.click(container.firstElementChild as HTMLElement, { clientX: 120, clientY: 80 })
    fireEvent.change(await screen.findByLabelText("Add a comment… (use @ to mention)"), { target: { value: "Why this colour?" } })
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Comment" })))
    await waitFor(() => expect(hoisted.post).toHaveBeenCalledTimes(3))
    await settle()
    const box = screen.queryByLabelText("Add a comment… (use @ to mention)") as HTMLTextAreaElement | null
    expect(box?.value).toBe("Why this colour?")
    expect(document.activeElement).toBe(box)
    hoisted.post.mockResolvedValueOnce({ comment: { id: "p2" } })
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Comment" })))
    await waitFor(() => expect(screen.queryByLabelText("Add a comment… (use @ to mention)")).toBeNull())
    cleanup()

    // Their own message's trash: busy while the delete is asked, and a second press asks nothing.
    refuse = held()
    show(board([msg("m1", ANN, "Ship it"), msg("m2", CAL, "Why?")]), CAL, { editable: false, commenter: true })
    fireEvent.click(await screen.findByRole("button", { name: "Comment by Ann Lee" }))
    const trash = await screen.findByRole("button", { name: "Delete your message" })
    await act(async () => fireEvent.click(trash))
    await waitFor(() => expect(hoisted.post).toHaveBeenCalledTimes(5))
    expect(trash.getAttribute("aria-busy")).toBe("true")
    await act(async () => fireEvent.click(trash))
    await settle()
    expect(hoisted.post).toHaveBeenCalledTimes(5)
    await refuse("There's no such comment.")
  })

  it("says so when the comment's code can't come, and keeps the words", async () => {
    // A fresh copy of the board's comments whose server part (lib/board/commentServer, a chunk) can't load: offline when
    // comment mode opened, and still on Comment. Not a deploy, so lib/loadChunk hands it to the board to say.
    vi.resetModules()
    vi.doMock("@/lib/board/commentServer", async () => {
      throw new TypeError("Failed to fetch dynamically imported module")
    })
    try {
      const { MemberBoardComments: Offline } = await import("./boardCommentWrites")
      const b = board()
      const { container } = render(
        <Offline provider={b.provider} api={b.api} boardId="b1" user={CAL} commentMode onCommentModeChange={() => {}} editable={false} commenter />,
      )
      fireEvent.click(container.firstElementChild as HTMLElement, { clientX: 120, clientY: 80 })
      fireEvent.change(await screen.findByLabelText("Add a comment… (use @ to mention)"), { target: { value: "Why this colour?" } })
      await act(async () => fireEvent.click(screen.getByRole("button", { name: "Comment" })))
      await waitFor(() =>
        expect(hoisted.toast).toHaveBeenCalledWith({ variant: "destructive", title: "Your comment wasn't posted", description: "Check your connection and try again." }),
      )
      expect(hoisted.post).not.toHaveBeenCalled()
      expect((screen.queryByLabelText("Add a comment… (use @ to mention)") as HTMLTextAreaElement | null)?.value).toBe("Why this colour?")
    } finally {
      vi.doUnmock("@/lib/board/commentServer")
    }
  })
})

describe("a board's comments, for everyone else", () => {
  afterEach(() => {
    cleanup()
    hoisted.post.mockReset()
  })

  it("leaves a viewer reading, with no box", async () => {
    show(board(), CAL, { editable: false })
    fireEvent.click(await screen.findByRole("button", { name: "Comment by Ann Lee" }))
    expect(await screen.findByText("Ship it")).toBeTruthy() // the thread is a piece of its own
    expect(screen.queryByLabelText("Reply… (use @ to mention)")).toBeNull()
    expect(screen.queryByRole("button", { name: "Delete your message" })).toBeNull()
  })

  it("lets an editor write the live board and mirror it, as before", async () => {
    const b = board()
    hoisted.post.mockResolvedValue({})
    show(b, CAL, { editable: true })
    fireEvent.click(await screen.findByRole("button", { name: "Comment by Ann Lee" }))
    await screen.findByText("Ship it") // the thread is a piece of its own
    expect(screen.getByRole("button", { name: "Resolve this comment" })).toBeTruthy()
    fireEvent.change(screen.getByLabelText("Reply… (use @ to mention)"), { target: { value: "On it" } })
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Reply" })))
    expect(thread(b.doc)).toHaveLength(2)
    expect(hoisted.post.mock.calls.map(([o]) => o.apiEndpoint)).toEqual(["/board/commentMention"])
  })
})

describe("a board's comments, for a board link's guest (miro-33)", () => {
  afterEach(() => {
    cleanup()
    hoisted.post.mockReset()
  })

  it("words the new comment and the reply without mentions, since a guest has no people", async () => {
    const b = board()
    const ask = vi.fn().mockResolvedValue({ id: "p2" })
    const { container } = render(
      <BoardComments provider={b.provider} api={b.api} user={CAL} editable={false} commenter commentMode onCommentModeChange={() => {}} writes={{ ask }} />,
    )
    fireEvent.click(container.firstElementChild as HTMLElement, { clientX: 120, clientY: 80 })
    expect(await screen.findByLabelText("Add a comment…")).toBeTruthy()
    expect(screen.queryByLabelText("Add a comment… (use @ to mention)")).toBeNull()
    fireEvent.click(await screen.findByRole("button", { name: "Comment by Ann Lee" }))
    expect(await screen.findByLabelText("Reply…")).toBeTruthy()
    expect(screen.queryByLabelText("Reply… (use @ to mention)")).toBeNull()
    expect(hoisted.post).not.toHaveBeenCalled()
  })
})

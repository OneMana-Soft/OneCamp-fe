import { afterEach, describe, expect, it } from "vitest"
import { act, cleanup, render } from "@testing-library/react"
import { configureStore } from "@reduxjs/toolkit"
import { Provider, useDispatch, useSelector } from "react-redux"
import { addChatComments, chatCommentSlice, createChatComment, removeChatComment } from "@/store/slice/chatCommentSlice"
import { useThreadReplies } from "./useThreadReplies"
import type { CommentInfoInterface } from "@/types/comment"

// The six thread views each brought the server's replies in with a rule of
// their own, and three rules lost replies: a group thread opened fresh showed
// none (it took the answer only when it already held replies), a reply sent on
// the phone vanished (the answer was taken again whenever the counts
// differed), and deleting a thread's last reply brought it back (the same
// answer was taken again once the thread was empty). The views now share
// useThreadReplies; this drives it the way they do.

afterEach(cleanup)

const by = { user_uuid: "u1", user_name: "Maya Chen", user_profile_object_key: "" }
const reply = (id: string, at: string): CommentInfoInterface => ({
    comment_uuid: id,
    comment_text: id,
    comment_created_at: at,
    comment_by: by,
})
const NONE: CommentInfoInterface[] = []

function Thread({ answer, askedAt }: { answer?: CommentInfoInterface[]; askedAt?: number }) {
    const dispatch = useDispatch()
    const stored = useSelector((s: { chatComments: { chatComments: Record<string, CommentInfoInterface[]> } }) => s.chatComments.chatComments.m1 ?? NONE)
    useThreadReplies(answer, askedAt, stored, (comments) => dispatch(addChatComments({ chatId: "m1", comments })))
    return <ol>{stored.map((r) => <li key={r.comment_uuid}>{r.comment_text}</li>)}</ol>
}

function setup() {
    const store = configureStore({ reducer: { [chatCommentSlice.name]: chatCommentSlice.reducer } })
    const shown = (view: ReturnType<typeof render>) => [...view.container.querySelectorAll("li")].map((li) => li.textContent)
    return { store, shown }
}

const first = reply("r1", "2026-10-10T09:00:00Z")
const second = reply("r2", "2026-10-10T09:01:00Z")

describe("a thread's replies", () => {
    it("show when a thread is opened fresh", () => {
        const { store, shown } = setup()
        const view = render(<Provider store={store}><Thread answer={[first, second]} /></Provider>)
        expect(shown(view)).toEqual(["r1", "r2"])
    })

    it("keep a reply just sent, though the answer is older", () => {
        const { store, shown } = setup()
        const answer = [first]
        const view = render(<Provider store={store}><Thread answer={answer} /></Provider>)
        act(() => {
            store.dispatch(createChatComment({
                chatId: "m1", commentId: "r2", commentText: "r2", commentCreatedAt: "2026-10-10T09:01:00Z", commentBy: by,
            } as never))
        })
        view.rerender(<Provider store={store}><Thread answer={answer} /></Provider>)
        expect(shown(view)).toEqual(["r1", "r2"])
    })

    it("stay deleted when the last one is deleted", () => {
        const { store, shown } = setup()
        const answer = [first]
        const view = render(<Provider store={store}><Thread answer={answer} /></Provider>)
        expect(shown(view)).toEqual(["r1"])
        act(() => {
            store.dispatch(removeChatComment({ chatId: "m1", commentIndex: 0 }))
        })
        view.rerender(<Provider store={store}><Thread answer={answer} /></Provider>)
        expect(shown(view)).toEqual([])
    })

    it("follow a new answer: a reply deleted elsewhere goes, one that arrived live stays", () => {
        const { store, shown } = setup()
        const view = render(<Provider store={store}><Thread answer={[first, second]} /></Provider>)
        act(() => {
            store.dispatch(createChatComment({
                chatId: "m1", commentId: "r3", commentText: "r3", commentCreatedAt: "2026-10-10T09:10:00Z", commentBy: by,
            } as never))
        })
        // Asked at 09:05, before r3 arrived: r2 is gone on the server.
        view.rerender(<Provider store={store}><Thread answer={[first]} askedAt={Date.parse("2026-10-10T09:05:00Z")} /></Provider>)
        expect(shown(view)).toEqual(["r1", "r3"])
    })
})

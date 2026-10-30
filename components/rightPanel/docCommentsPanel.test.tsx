import * as React from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor, within } from "@testing-library/react"
import { Provider } from "react-redux"
import { configureStore } from "@reduxjs/toolkit"
import type { ThreadView } from "@/components/threads/types"

// A doc's comments beside it (docs programme B7; collaboration.md P1-A, D16):
// threads as cards with the words they are on, Open and Resolved, a person
// filter, a thread being started on the doc's words, and errors said as
// errors (N46).

// A doc of its own for each test: the threads store and its reads outlive one.
let DOC = "d-panel-0"
let docs = 0
const ME = { user_uuid: "u-sam", user_name: "Sam Rivera", user_profile_object_key: "" }
const MAYA = { user_uuid: "u-maya", user_name: "Maya Chen", user_profile_object_key: "" }

const info = {
    doc_title: "Launch plan",
    doc_comment_access: 1,
    doc_edit_access: 1,
    doc_public_comment: false,
    doc_created_by: ME,
    doc_mqtt_topic: "doc/topic",
}
// The doc's guests' conversation, when a test gives one; every other read is the doc.
const guests = vi.hoisted(() => ({ thread: undefined as unknown }))
vi.mock("@/hooks/useFetch", () => ({
    useFetch: (url: string) => ({ data: url.startsWith("/doc/guest-thread") && guests.thread ? guests.thread : { data: info }, isError: undefined, mutate: vi.fn() }),
    useFetchOnlyOnce: () => ({ data: { data: ME } }),
}))
vi.mock("@/hooks/useMqttTopic", () => ({ useMqttTopic: () => undefined }))
vi.mock("@/context/MediaQueryContext", () => ({ useMedia: () => ({ isDesktop: true, isMobile: false, isTablet: false }) }))
vi.mock("@/components/rightPanel/rightPanelHeader", () => ({ RightPanelHeader: () => <h2>Comments</h2> }))
// The rows and the composer have tests of their own: here, what the panel does with them.
vi.mock("@/components/rightPanel/messageContent", () => ({
    MessageContent: ({ content, isAdmin }: { content: string; isAdmin?: boolean }) => (
        <div data-testid="comment" data-moderator={isAdmin || undefined}>
            {content}
        </div>
    ),
}))
vi.mock("@/components/docComments/CommentComposer", () => ({
    CommentComposer: ({ label, onSend }: { label: string; onSend(b: { body: string; attachments: [] }): Promise<unknown> }) => (
        <button type="button" onClick={() => void onSend({ body: "<p>Agreed</p>", attachments: [] }).catch(() => undefined)}>
            {`Send: ${label}`}
        </button>
    ),
}))
vi.mock("@/components/threads/threadsApi", () => ({
    listThreads: vi.fn(),
    getThread: vi.fn(),
    createThread: vi.fn(),
    replyToThread: vi.fn(),
    resolveThread: vi.fn(),
    reopenThread: vi.fn(),
    reanchorThread: vi.fn(),
    markThreadRead: vi.fn(),
}))

const api = await import("@/components/threads/threadsApi")
const { default: store, RESET_STORE_ACTION } = await import("@/store/store")
const { DocCommentList } = await import("./docCommentList")
const { setUi, uiOf } = await import("@/components/docComments/commentsUi")
const { TooltipProvider } = await import("@/components/ui/tooltip")

const AT = "2026-10-12T09:00:00Z"
const comment = (id: string, thread: string, by = ME, text = `<p>${id}</p>`, at = AT) => ({
    comment_uuid: id,
    thread_id: thread,
    comment_text: text,
    comment_by: by,
    comment_created_at: at,
})

const thread = (id: string, over: Partial<ThreadView> = {}): ThreadView => ({
    id,
    resource_kind: "doc",
    resource_uuid: DOC,
    anchor: { kind: "yrange", start: "AQ==", end: "Ag==", quote: "Ship on Thursday" },
    status: "open",
    created_by: ME.user_uuid,
    created_at: "2026-10-12T09:00:00Z",
    updated_at: "2026-10-12T09:00:00Z",
    comments: [comment(`${id}-c`, id)],
    participants: [],
    unread: false,
    can_reply: true,
    can_resolve: true,
    ...over,
})

function show() {
    return render(
        <Provider store={store}>
            <TooltipProvider>
                <DocCommentList docId={DOC} />
            </TooltipProvider>
        </Provider>,
    )
}

beforeEach(() => {
    vi.clearAllMocks()
    // Every test its own doc, and a store holding none of another test's threads.
    store.dispatch({ type: RESET_STORE_ACTION })
    DOC = `d-panel-${++docs}`
})
afterEach(cleanup)

describe("a doc's comments beside it", () => {
    it("shows each thread as a card with the words it is on, and the page's own as the page's", async () => {
        vi.mocked(api.listThreads).mockResolvedValue([thread("t1"), thread("t2", { anchor: { kind: "none" }, comments: [comment("p1", "t2", MAYA, "<p>Looks good</p>")] })])
        show()
        const card = await screen.findByRole("article", { name: /Comment on “Ship on Thursday”, 1 comment/ })
        expect(within(card).getByText("Ship on Thursday")).toBeTruthy()
        const page = screen.getByRole("article", { name: /Comment on the page, 1 comment/ })
        expect(within(page).getByText("On the page")).toBeTruthy()
        // The page's own first, as a conversation at the top of a page reads.
        expect(screen.getAllByRole("article").map((a) => a.getAttribute("data-thread-id"))).toEqual(["t2", "t1"])
    })

    it("moves a resolved thread to Resolved, where it can be reopened", async () => {
        vi.mocked(api.listThreads).mockResolvedValue([thread("t1")])
        vi.mocked(api.resolveThread).mockResolvedValueOnce({ ...thread("t1"), status: "resolved", resolved_by: ME.user_uuid, updated_at: "2026-10-12T09:30:00Z" })
        show()
        const card = await screen.findByRole("article", { name: /Ship on Thursday/ })
        fireEvent.click(within(card).getByRole("button", { name: "Resolve" }))
        await waitFor(() => expect(screen.queryByRole("article", { name: /Ship on Thursday/ })).toBeNull())
        expect(screen.getByText("No comments yet")).toBeTruthy()
        // QA DSA-18 (14 Oct 2026): the v3 spot, not a lone outline icon.
        expect(document.querySelector('[data-hub-spot="comment"]')).toBeTruthy()

        fireEvent.click(screen.getByRole("radio", { name: /Resolved 1/ }))
        const resolved = await screen.findByRole("article", { name: /Ship on Thursday.*resolved/ })
        vi.mocked(api.reopenThread).mockResolvedValueOnce({ ...thread("t1"), updated_at: "2026-10-12T09:40:00Z" })
        fireEvent.click(within(resolved).getByRole("button", { name: "Reopen" }))
        await waitFor(() => expect(screen.getByText("Nothing resolved yet")).toBeTruthy())
    })

    it("says no comments yet only when the whole panel is empty, never over the guests' comments", async () => {
        vi.mocked(api.listThreads).mockResolvedValue([])
        guests.thread = { data: { comments: [{ id: "c1", guest_name: "Dana", body: "Is section 2 final?", created_at: AT, author_id: "guest-a" }], can_reply: false, can_moderate: false } }
        try {
            show()
            expect(await screen.findByText("Is section 2 final?")).toBeTruthy()
            expect(screen.queryByText("No comments yet")).toBeNull()
        } finally {
            guests.thread = undefined
        }
    })

    it("says a failed read is an error, with Try again, and never that there are no comments", async () => {
        vi.mocked(api.listThreads).mockRejectedValueOnce({ response: { data: { msg: "The server didn't answer. Try again in a moment." } } })
        show()
        expect(await screen.findByText(/Couldn.t load the comments/)).toBeTruthy()
        // The server's own reason, in place of the guess about the connection.
        expect(screen.getByText("The server didn't answer. Try again in a moment.")).toBeTruthy()
        expect(screen.queryByText("No comments yet")).toBeNull()
        vi.mocked(api.listThreads).mockResolvedValueOnce([thread("t1")])
        fireEvent.click(screen.getByRole("button", { name: /Try again/ }))
        expect(await screen.findByRole("article", { name: /Ship on Thursday/ })).toBeTruthy()
    })

    it("shows one person's threads, and says so when they have none here", async () => {
        vi.mocked(api.listThreads).mockResolvedValue([
            thread("t1"),
            thread("t2", { anchor: { kind: "yrange", start: "AQ==", end: "Ag==", quote: "Budget" }, comments: [comment("m1", "t2", MAYA)] }),
        ])
        show()
        await screen.findAllByRole("article")
        fireEvent.keyDown(screen.getByRole("button", { name: "Whose threads: Anyone" }), { key: "Enter" })
        fireEvent.click(await screen.findByRole("menuitem", { name: "Maya Chen" }))
        await waitFor(() => expect(screen.getAllByRole("article").map((a) => a.getAttribute("data-thread-id"))).toEqual(["t2"]))

        fireEvent.click(screen.getByRole("radio", { name: /Resolved/ }))
        expect(await screen.findByText("Nothing resolved from Maya Chen")).toBeTruthy()
        fireEvent.click(screen.getByRole("button", { name: "Show everyone's" }))
        expect(screen.getByRole("button", { name: "Whose threads: Anyone" })).toBeTruthy()
    })

    it("writes a thread started on the doc's words at the top, and sending starts it there", async () => {
        vi.mocked(api.listThreads).mockResolvedValue([])
        const anchor = { kind: "yrange" as const, start: "Aw==", end: "BA==", quote: "the launch date" }
        act(() => setUi(DOC, { pending: anchor }))
        show()
        const draft = await screen.findByRole("article", { name: "New comment" })
        expect(within(draft).getByText("the launch date")).toBeTruthy()
        vi.mocked(api.createThread).mockResolvedValueOnce(thread("t9", { anchor }))
        fireEvent.click(within(draft).getByRole("button", { name: "Send: Comment on the selected text" }))
        await waitFor(() => expect(api.createThread).toHaveBeenCalledWith({ kind: "doc", uuid: DOC }, anchor, { body: "<p>Agreed</p>", attachments: [] }))
        expect(await screen.findByRole("article", { name: /the launch date/ })).toBeTruthy()
        expect(screen.queryByRole("article", { name: "New comment" })).toBeNull()
        expect(uiOf(DOC).active).toBe("t9")
    })

    it("lets a moderator remove anyone's comment (the server says who is one)", async () => {
        vi.mocked(api.listThreads).mockResolvedValue([thread("t1", { comments: [comment("m1", "t1", MAYA)], can_moderate: true })])
        show()
        const row = await screen.findByTestId("comment")
        expect(row.getAttribute("data-moderator")).toBe("true")
    })
})

describe("a comment event", () => {
    it("moves the doc's count once, however many times it arrives", async () => {
        const { createDocCommentSlice } = await import("@/store/slice/createDocCommentSlice")
        const { useDocMessageHandlers } = await import("@/hooks/useDocMessageHandlers")
        const local = configureStore({ reducer: { createDocComment: createDocCommentSlice.reducer } })
        const wrapper = ({ children }: { children: React.ReactNode }) => <Provider store={local}>{children}</Provider>
        const { result } = renderHook(() => useDocMessageHandlers(), { wrapper })
        const event = (type: number, id: string) =>
            JSON.stringify({ type: 13, data: { type, doc_id: "d", comment_uuid: id, body_text: "<p>hi</p>", user_uuid: "u-x", user_name: "X", created_at: "2026-10-12T00:00:00Z" } })
        act(() => {
            result.current.handleDocCommentMessage(event(0, "c1"))
            result.current.handleDocCommentMessage(event(0, "c1"))
        })
        expect(local.getState().createDocComment.docCommentCount.d).toBe(1)
        act(() => {
            result.current.handleDocCommentMessage(event(2, "c1"))
            result.current.handleDocCommentMessage(event(2, "c1"))
        })
        expect(local.getState().createDocComment.docCommentCount.d).toBe(0)
    })

    it("is handled by the global router alone: the doc page only subscribes", async () => {
        const { readFileSync } = await import("node:fs")
        const view = readFileSync("components/views/DocView.tsx", "utf8")
        expect(view).not.toMatch(/useDocMessageHandlers|handleDocComment/)
    })
})

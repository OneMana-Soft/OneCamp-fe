import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { Provider } from "react-redux"

// MC-BUG-1: a thread's unsent reply was kept by the conversation, not by the
// thread. Open thread A in #engineering, type "Ship it Friday", open thread B:
// B's box held A's words (and A's file), and Enter posted them under B, to B's
// people. The same in a DM's threads and a group's. These drive the three
// thread panels the way a person does: type, open another thread, attach, send.

// The thread's own read, one answer per thread, kept as SWR keeps it.
const answers: Record<string, unknown> = {}
vi.mock("@/hooks/useFetch", () => ({
    useFetch: (url: string) => ({ isLoading: false, isError: undefined, mutate: () => {}, lastRequestStartedAt: 1, ...(answers[url.split("/").pop() || ""] as object) }),
    useFetchOnlyOnce: () => ({ data: { data: { user_uuid: "me", user_name: "Sam Rivera" } } }),
}))

// Each send waits for the test to answer it.
const sends: { apiEndpoint: string; payload: Record<string, unknown>; answer: (v: unknown) => void }[] = []
vi.mock("@/hooks/usePost", () => ({
    usePost: () => ({
        isSubmitting: false,
        makeRequest: (o: { apiEndpoint: string; payload: Record<string, unknown> }) => new Promise((answer) => sends.push({ ...o, answer })),
    }),
}))

// Uploads go out through axios and wait for the test to finish them.
const uploads: ((v: unknown) => void)[] = []
vi.mock("@/lib/axiosInstance", () => ({
    default: { post: () => new Promise((resolve) => uploads.push(resolve)), get: () => new Promise(() => {}) },
    OWN_ERRORS: { suppressErrorToast: true },
}))
vi.mock("@/hooks/useClientConfig", () => ({ useClientConfig: () => ({}) }))

// The composer, as its parent sees it: what it shows is the draft it's given.
vi.mock("@/components/textInput/textInput", () => ({
    default: ({ content, onChange, buttonOnclick, onActionFiles, hasAttachments, children }: {
        content?: string | null
        onChange?: (v: string) => void
        buttonOnclick?: (latest?: string) => void
        onActionFiles?: (files: File[]) => void
        hasAttachments?: boolean
        children?: React.ReactNode
    }) => (
        <div data-has-attachments={hasAttachments ? "yes" : "no"} data-testid="composer">
            <textarea aria-label="Reply" value={content ?? ""} onChange={(e) => onChange?.(e.target.value)} />
            <button type="button" onClick={() => buttonOnclick?.(content ?? undefined)}>Send</button>
            <button type="button" onClick={() => onActionFiles?.([new File(["%PDF"], "plan.pdf", { type: "application/pdf" })])}>Attach</button>
            {children}
        </div>
    ),
}))
vi.mock("@/components/attachmentIcon/uploadingAttachmentIcon", () => ({
    default: ({ fileName }: { fileName: string }) => <span data-testid="attachment">{fileName}</span>,
}))
vi.mock("@/components/rightPanel/messageContent", () => ({ MessageContent: () => <div data-testid="root-message" /> }))
vi.mock("@/components/rightPanel/commentsList", () => ({ CommentsList: () => null }))
vi.mock("@/components/rightPanel/rightPanelHeader", () => ({ RightPanelHeader: () => <header>Thread</header> }))

const { default: store, RESET_STORE_ACTION } = await import("@/store/store")
const { openRightPanel } = await import("@/store/slice/desktopRightPanelSlice")
const { updateChannelPosts, updateChannelInputText } = await import("@/store/slice/channelSlice")
const { updateChats } = await import("@/store/slice/chatSlice")
const { updateGroupChats } = await import("@/store/slice/groupChatSlice")
const { ChannelComments } = await import("@/components/rightPanel/channelComments")
const { ChatComments } = await import("@/components/rightPanel/chatComments")
const { GroupChatComments } = await import("@/components/rightPanel/groupChatComments")

const CH = "c0ffee00-0000-4000-8000-000000000001"
const MAYA = "a11ce000-0000-4000-8000-00000000000a"
const GRP = "9a0b0000-0000-4000-8000-0000000000aa"
const A = "aaaa0000-0000-4000-8000-00000000000a"
const B = "bbbb0000-0000-4000-8000-00000000000b"
const by = { user_uuid: MAYA, user_name: "Maya Chen" }

const box = () => screen.getByLabelText("Reply") as HTMLTextAreaElement
const type = (text: string) => fireEvent.change(box(), { target: { value: text } })
const press = (name: string) => fireEvent.click(screen.getByRole("button", { name }))
const open = (thread: Record<string, string>) => act(() => void store.dispatch(openRightPanel(thread)))
const attachments = () => screen.queryAllByTestId("attachment").map((a) => a.textContent)
const settle = () => act(async () => { for (let i = 0; i < 5; i++) await Promise.resolve() })

beforeEach(() => {
    store.dispatch({ type: RESET_STORE_ACTION })
    sends.length = 0
    uploads.length = 0
    for (const id of [A, B]) answers[id] = { data: { data: { post_uuid: id, chat_uuid: id, post_comments: [], chat_comments: [] } } }
})
afterEach(cleanup)

const surfaces = [
    {
        name: "a channel",
        view: <ChannelComments />,
        thread: (id: string) => ({ channelUUID: CH, postUUID: id }),
        seed: () => store.dispatch(updateChannelPosts({ channelId: CH, posts: [A, B].map((id) => ({ post_uuid: id, post_text: id, post_by: by, post_created_at: "2026-10-13T09:00:00Z" })) } as never)),
        target: "post_id",
    },
    {
        name: "a DM",
        view: <ChatComments />,
        thread: (id: string) => ({ chatUUID: MAYA, chatMessageUUID: id }),
        seed: () => store.dispatch(updateChats({ chatId: MAYA, chats: [A, B].map((id) => ({ chat_uuid: id, chat_body_text: id, chat_from: by, chat_created_at: "2026-10-13T09:00:00Z" })) } as never)),
        target: "chat_id",
    },
    {
        name: "a group",
        view: <GroupChatComments />,
        thread: (id: string) => ({ groupUUID: GRP, chatMessageUUID: id }),
        seed: () => store.dispatch(updateGroupChats({ grpId: GRP, chats: [A, B].map((id) => ({ chat_uuid: id, chat_body_text: id, chat_from: by, chat_created_at: "2026-10-13T09:00:00Z" })) } as never)),
        target: "chat_id",
    },
]

describe.each(surfaces)("a thread's unsent reply in $name", ({ view, thread, seed, target }) => {
    function show() {
        seed()
        store.dispatch(openRightPanel(thread(A)))
        return render(<Provider store={store}>{view}</Provider>)
    }

    it("stays in its thread: another thread opens with its own", () => {
        show()
        type("<p>Ship it Friday</p>")
        open(thread(B))
        expect(box().value).toBe("")
        type("<p>Looks good</p>")
        open(thread(A))
        expect(box().value).toBe("<p>Ship it Friday</p>")
        open(thread(B))
        expect(box().value).toBe("<p>Looks good</p>")
    })

    it("is never posted under another thread", () => {
        show()
        type("<p>Ship it Friday</p>")
        open(thread(B))
        press("Send")
        expect(sends).toHaveLength(0)
        type("<p>Looks good</p>")
        press("Send")
        expect(sends).toHaveLength(1)
        expect(sends[0].payload[target]).toBe(B)
        expect(sends[0].payload.comment_text_html).toBe("<p>Looks good</p>")
    })

    it("is emptied by its own send only, even once another thread is open", async () => {
        show()
        type("<p>Ship it Friday</p>")
        open(thread(B))
        type("<p>Looks good</p>")
        open(thread(A))
        press("Send")
        expect(sends[0].payload[target]).toBe(A)
        // The answer comes back while B is open.
        open(thread(B))
        await act(async () => sends[0].answer({ comment_id: "r1", comment_created_at: "2026-10-13T09:05:00Z" }))
        expect(box().value).toBe("<p>Looks good</p>")
        open(thread(A))
        expect(box().value).toBe("")
    })

    it("keeps a file being uploaded in the thread it was attached in", async () => {
        show()
        press("Attach")
        await settle()
        expect(attachments()).toEqual(["plan.pdf"])
        // Another thread opens while it uploads.
        open(thread(B))
        expect(attachments()).toEqual([])
        await act(async () => uploads[0]({ data: { object_uuid: "obj-1" } }))
        await settle()
        expect(attachments()).toEqual([])
        expect(screen.getByTestId("composer").dataset.hasAttachments).toBe("no")
        open(thread(A))
        expect(attachments()).toEqual(["plan.pdf"])
        expect(screen.getByTestId("composer").dataset.hasAttachments).toBe("yes")
        // And goes with A's reply, not B's.
        open(thread(B))
        type("<p>Looks good</p>")
        press("Send")
        expect(sends[0].payload.comment_attachments).toEqual([])
    })
})

describe("Also send to #channel", () => {
    it("is ticked for the thread it was ticked in, and its send unticks it", async () => {
        surfaces[0].seed()
        store.dispatch(openRightPanel({ channelUUID: CH, postUUID: A }))
        render(<Provider store={store}><ChannelComments /></Provider>)
        const ticked = () => screen.getByRole("checkbox").getAttribute("aria-checked")
        fireEvent.click(screen.getByRole("checkbox"))
        expect(ticked()).toBe("true")
        open({ channelUUID: CH, postUUID: B })
        expect(ticked()).toBe("false")
        open({ channelUUID: CH, postUUID: A })
        expect(ticked()).toBe("true")
        type("<p>Ship it Friday</p>")
        press("Send")
        expect(sends[0].payload.also_send_to_channel).toBe(true)
        await act(async () => sends[0].answer({ comment_id: "r1" }))
        expect(ticked()).toBe("false")
    })
})

describe("a channel's own message box", () => {
    it("keeps its draft whatever its threads do", async () => {
        surfaces[0].seed()
        store.dispatch(updateChannelInputText({ channelId: CH, inputTextHTML: "<p>Top-level draft</p>" }))
        store.dispatch(openRightPanel({ channelUUID: CH, postUUID: A }))
        render(<Provider store={store}><ChannelComments /></Provider>)
        type("<p>Ship it Friday</p>")
        press("Send")
        await act(async () => sends[0].answer({ comment_id: "r1" }))
        expect(store.getState().channel.channelInputState[CH].inputTextHTML).toBe("<p>Top-level draft</p>")
    })
})

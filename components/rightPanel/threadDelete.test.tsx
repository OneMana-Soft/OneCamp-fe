import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { Provider } from "react-redux"
import { pinTestClock } from "@/lib/testing/testClock"

pinTestClock()

// SD-5: deleting in a thread asked twice. The message's More menu asks in
// place ("Delete for everyone?"), and then the thread opened a dialog half a
// second later and toasted when it was done. Now the menu's answer deletes:
// at once, with a toast only when it fails.

type Request = { apiEndpoint: string; showToast?: boolean; showErrorToast?: boolean }
const makeRequest = vi.fn<(request: Request) => Promise<object>>(async () => ({}))
const answers: Record<string, unknown> = {}
// The box reads its conversation's command catalog as it draws (LazyCommandSurface).
vi.mock("@/services/commandService", () => ({ fetchCommandCatalog: async () => ({ commands: [] }) }))
vi.mock("@/hooks/useFetch", () => ({
    useFetch: (url: string) => ({ isLoading: false, isError: undefined, mutate: () => {}, lastRequestStartedAt: 1, ...(answers[url.split("/").pop() || ""] as object) }),
    useFetchOnlyOnce: () => ({ data: { data: { user_uuid: "me", user_name: "Sam Rivera" } } }),
}))
vi.mock("@/hooks/usePost", () => ({ usePost: () => ({ isSubmitting: false, makeRequest }) }))
vi.mock("@/hooks/useUploadFile", () => ({ useUploadFile: () => ({}) }))
vi.mock("@/components/textInput/textInput", () => ({ default: () => <div data-testid="composer" /> }))
// The rows as their menus answer: Delete, once the menu has asked in place.
vi.mock("@/components/rightPanel/messageContent", () => ({
    MessageContent: ({ deleteMessage }: { deleteMessage: (id: string) => void }) => (
        <button type="button" onClick={() => deleteMessage(ROOT)}>Delete the message</button>
    ),
}))
vi.mock("@/components/rightPanel/commentsList", () => ({
    CommentsList: ({ removeComment }: { removeComment: (id: string, index: number) => void }) => (
        <button type="button" onClick={() => removeComment(REPLY, 0)}>Delete the reply</button>
    ),
}))
vi.mock("@/components/rightPanel/rightPanelHeader", () => ({ RightPanelHeader: () => <header>Thread</header> }))
vi.mock("@/components/ai/ThreadSummaryButton", () => ({ ThreadSummaryButton: () => null }))
vi.mock("@/components/ai/AgentWorkStrip", () => ({ AgentWorkStrip: () => null }))

const { default: store, RESET_STORE_ACTION } = await import("@/store/store")
const { openRightPanel } = await import("@/store/slice/desktopRightPanelSlice")
const { ChannelComments } = await import("@/components/rightPanel/channelComments")
const { ChatComments } = await import("@/components/rightPanel/chatComments")
const { GroupChatComments } = await import("@/components/rightPanel/groupChatComments")
const { PostEndpointUrl } = await import("@/services/endPoints")

const CH = "c0ffee00-0000-4000-8000-000000000001"
const MAYA = "a11ce000-0000-4000-8000-00000000000a"
const GRP = "9a0b0000-0000-4000-8000-0000000000aa"
const ROOT = "5007a000-0000-4000-8000-00000000000a"
const REPLY = "5007a000-0000-4000-8000-00000000000b"
const by = { user_uuid: MAYA, user_name: "Maya Chen" }
const reply = { comment_uuid: REPLY, comment_text: "<p>Done</p>", comment_by: by, comment_created_at: "2026-10-13T09:05:00Z" }

beforeEach(() => {
    store.dispatch({ type: RESET_STORE_ACTION })
    makeRequest.mockClear()
})
afterEach(cleanup)

describe.each([
    {
        name: "a channel's thread",
        view: <ChannelComments />,
        panel: { channelUUID: CH, postUUID: ROOT },
        root: { post_uuid: ROOT, post_text: "<p>Plan</p>", post_by: by, post_created_at: "2026-10-13T09:00:00Z", post_comments: [reply] },
        endpoints: [PostEndpointUrl.DeleteChannelPost, PostEndpointUrl.RemovePostComment],
    },
    {
        name: "a DM's thread",
        view: <ChatComments />,
        panel: { chatUUID: MAYA, chatMessageUUID: ROOT },
        root: { chat_uuid: ROOT, chat_body_text: "<p>Plan</p>", chat_from: by, chat_created_at: "2026-10-13T09:00:00Z", chat_comments: [reply] },
        endpoints: [PostEndpointUrl.DeleteChatMessage, PostEndpointUrl.RemoveChatComment],
    },
    {
        name: "a group's thread",
        view: <GroupChatComments />,
        panel: { groupUUID: GRP, chatMessageUUID: ROOT },
        root: { chat_uuid: ROOT, chat_body_text: "<p>Plan</p>", chat_from: by, chat_created_at: "2026-10-13T09:00:00Z", chat_comments: [reply] },
        endpoints: [PostEndpointUrl.DeleteChatMessage, PostEndpointUrl.RemoveChatComment],
    },
])("deleting in $name", ({ view, panel, root, endpoints }) => {
    it("deletes the message and a reply once their menu has asked, with no dialog and no toast for success", async () => {
        answers[ROOT] = { data: { data: root } }
        store.dispatch(openRightPanel(panel))
        render(<Provider store={store}>{view}</Provider>)

        await act(async () => fireEvent.click(screen.getByRole("button", { name: "Delete the message" })))
        await act(async () => fireEvent.click(screen.getByRole("button", { name: "Delete the reply" })))

        expect(makeRequest.mock.calls.map(([o]) => o.apiEndpoint)).toEqual(endpoints)
        for (const [o] of makeRequest.mock.calls) {
            expect(o.showToast).toBeFalsy()
            expect(o.showErrorToast).toBe(true)
        }
        expect((store.getState().ui as unknown as { confirmAlert: { isOpen: boolean } }).confirmAlert.isOpen).toBe(false)
    })

    it("keeps the message and a reply when the server refuses, with nothing left unhandled", async () => {
        answers[ROOT] = { data: { data: root } }
        store.dispatch(openRightPanel(panel))
        render(<Provider store={store}>{view}</Provider>)
        // usePost says the refusal itself, then throws it on to its caller.
        makeRequest.mockRejectedValue(new Error("403"))
        const unhandled: unknown[] = []
        const note = (e: unknown) => unhandled.push(e)
        process.on("unhandledRejection", note)
        try {
            await act(async () => fireEvent.click(screen.getByRole("button", { name: "Delete the message" })))
            await act(async () => fireEvent.click(screen.getByRole("button", { name: "Delete the reply" })))
            await act(() => new Promise((r) => setTimeout(r, 0)))
        } finally {
            process.off("unhandledRejection", note)
            makeRequest.mockImplementation(async () => ({}))
        }
        expect(unhandled).toEqual([])
        expect(makeRequest.mock.calls.map(([o]) => o.apiEndpoint)).toEqual(endpoints)
        // Nothing was taken away: no tombstone keeps the message out.
        const { channel, chat, groupChat } = store.getState()
        for (const map of [channel.deletedPosts, chat.deletedChats, groupChat.deletedChats]) {
            expect(Object.values(map ?? {}).some((bucket) => ROOT in (bucket as object))).toBe(false)
        }
    })
})

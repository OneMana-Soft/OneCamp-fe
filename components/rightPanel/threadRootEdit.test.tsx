import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { Provider } from "react-redux"
import { pinTestClock } from "@/lib/testing/testClock"

pinTestClock()

// Editing a thread's own message on a computer never saved: the row hands
// over the message's id and then its words, and the thread took them the
// other way round, so it sent the words as the id and the server refused.
// A reply's edit, and the phone's threads, had them the right way round.

type Request = { apiEndpoint: string; payload: Record<string, unknown> }
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
// The rows as they save a correction: the message's id, then its words.
vi.mock("@/components/rightPanel/messageContent", () => ({
    MessageContent: ({ updateMessage }: { updateMessage: (id: string, body: string) => unknown }) => (
        <button type="button" onClick={() => updateMessage(ROOT, "<p>Plan B</p>")}>Save the message</button>
    ),
}))
vi.mock("@/components/rightPanel/commentsList", () => ({
    CommentsList: ({ updateComment }: { updateComment: (id: string, body: string, index: number) => unknown }) => (
        <button type="button" onClick={() => updateComment(REPLY, "<p>Done, shipped</p>", 0)}>Save the reply</button>
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
        message: { apiEndpoint: PostEndpointUrl.UpdateChannelPost, payload: { post_id: ROOT, post_text_html: "<p>Plan B</p>" } },
        reply: { apiEndpoint: PostEndpointUrl.UpdatePostComment, payload: { post_id: ROOT, comment_id: REPLY, comment_text_html: "<p>Done, shipped</p>" } },
    },
    {
        name: "a DM's thread",
        view: <ChatComments />,
        panel: { chatUUID: MAYA, chatMessageUUID: ROOT },
        root: { chat_uuid: ROOT, chat_body_text: "<p>Plan</p>", chat_from: by, chat_created_at: "2026-10-13T09:00:00Z", chat_comments: [reply] },
        message: { apiEndpoint: PostEndpointUrl.UpdateChatMessage, payload: { chat_id: ROOT, text_html: "<p>Plan B</p>" } },
        reply: { apiEndpoint: PostEndpointUrl.UpdateChatComment, payload: { chat_id: ROOT, comment_id: REPLY, comment_text_html: "<p>Done, shipped</p>" } },
    },
    {
        name: "a group's thread",
        view: <GroupChatComments />,
        panel: { groupUUID: GRP, chatMessageUUID: ROOT },
        root: { chat_uuid: ROOT, chat_body_text: "<p>Plan</p>", chat_from: by, chat_created_at: "2026-10-13T09:00:00Z", chat_comments: [reply] },
        message: { apiEndpoint: PostEndpointUrl.UpdateGroupChatMessage, payload: { chat_id: ROOT, text_html: "<p>Plan B</p>", grp_id: GRP } },
        reply: { apiEndpoint: PostEndpointUrl.UpdateChatComment, payload: { chat_id: ROOT, comment_id: REPLY, comment_text_html: "<p>Done, shipped</p>" } },
    },
])("a correction in $name", ({ view, panel, root, message, reply: replyEdit }) => {
    it("saves the message by its id, and a reply by its", async () => {
        answers[ROOT] = { data: { data: root } }
        store.dispatch(openRightPanel(panel))
        render(<Provider store={store}>{view}</Provider>)

        await act(async () => fireEvent.click(screen.getByRole("button", { name: "Save the message" })))
        await act(async () => fireEvent.click(screen.getByRole("button", { name: "Save the reply" })))

        expect(makeRequest.mock.calls.map(([o]) => ({ apiEndpoint: o.apiEndpoint, payload: o.payload }))).toEqual([message, replyEdit])
    })
})

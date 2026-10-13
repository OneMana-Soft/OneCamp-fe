import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"
import { Provider } from "react-redux"

// FE-BUG-8: a link to an older message (from Activity, search, Later) in a
// conversation already in memory opened a thread that spun for ever. The
// thread panels drew the root only from the conversation's loaded messages,
// and the list never loaded the page around an older one; the thread's own
// answer, which carries the root, went unused.

const answers: Record<string, unknown> = {}
vi.mock("@/hooks/useFetch", () => ({
    useFetch: (url: string) => ({ isLoading: false, isError: undefined, mutate: () => {}, lastRequestStartedAt: 1, ...(answers[url.split("/").pop() || ""] as object) }),
    useFetchOnlyOnce: () => ({ data: { data: { user_uuid: "me", user_name: "Sam Rivera" } } }),
}))
vi.mock("@/hooks/usePost", () => ({ usePost: () => ({ isSubmitting: false, makeRequest: () => new Promise(() => {}) }) }))
vi.mock("@/hooks/useUploadFile", () => ({ useUploadFile: () => ({}) }))
vi.mock("@/components/textInput/textInput", () => ({ default: () => <div data-testid="composer" /> }))
vi.mock("@/components/rightPanel/messageContent", () => ({
    MessageContent: ({ content }: { content?: string }) => <div data-testid="root-message">{content}</div>,
}))
vi.mock("@/components/rightPanel/commentsList", () => ({ CommentsList: () => null }))
vi.mock("@/components/rightPanel/rightPanelHeader", () => ({ RightPanelHeader: () => <header>Thread</header> }))

const { default: store, RESET_STORE_ACTION } = await import("@/store/store")
const { openRightPanel } = await import("@/store/slice/desktopRightPanelSlice")
const { updateChannelPosts } = await import("@/store/slice/channelSlice")
const { ChannelComments } = await import("@/components/rightPanel/channelComments")
const { ChatComments } = await import("@/components/rightPanel/chatComments")
const { GroupChatComments } = await import("@/components/rightPanel/groupChatComments")

const CH = "c0ffee00-0000-4000-8000-000000000001"
const MAYA = "a11ce000-0000-4000-8000-00000000000a"
const GRP = "9a0b0000-0000-4000-8000-0000000000aa"
const OLD = "0ld00000-0000-4000-8000-00000000000a"
const by = { user_uuid: MAYA, user_name: "Maya Chen" }

beforeEach(() => store.dispatch({ type: RESET_STORE_ACTION }))
afterEach(cleanup)

describe.each([
    {
        name: "a channel's thread",
        view: <ChannelComments />,
        panel: { channelUUID: CH, postUUID: OLD },
        root: { post_uuid: OLD, post_text: "<p>Last week's plan</p>", post_by: by, post_created_at: "2026-10-06T09:00:00Z", post_comments: [] },
    },
    {
        name: "a DM's thread",
        view: <ChatComments />,
        panel: { chatUUID: MAYA, chatMessageUUID: OLD },
        root: { chat_uuid: OLD, chat_body_text: "<p>Last week's plan</p>", chat_from: by, chat_created_at: "2026-10-06T09:00:00Z", chat_comments: [] },
    },
    {
        name: "a group's thread",
        view: <GroupChatComments />,
        panel: { groupUUID: GRP, chatMessageUUID: OLD },
        root: { chat_uuid: OLD, chat_body_text: "<p>Last week's plan</p>", chat_from: by, chat_created_at: "2026-10-06T09:00:00Z", chat_comments: [] },
    },
])("$name opened from a link to an older message", ({ view, panel, root }) => {
    it("draws its root from the thread's own answer when the list doesn't hold it", () => {
        // The conversation's latest page is in memory; the linked message isn't on it.
        store.dispatch(updateChannelPosts({ channelId: CH, posts: [{ post_uuid: "new-1", post_text: "<p>Today</p>", post_by: by, post_created_at: "2026-10-13T09:00:00Z" }] } as never))
        answers[OLD] = { data: { data: root } }
        store.dispatch(openRightPanel(panel))
        render(<Provider store={store}>{view}</Provider>)
        expect(screen.getByTestId("root-message")).toHaveTextContent("Last week's plan")
        expect(screen.getByTestId("composer")).toBeInTheDocument()
    })
})

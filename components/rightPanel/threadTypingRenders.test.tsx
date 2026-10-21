import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { Provider } from "react-redux"
import { pinTestClock } from "@/lib/testing/testClock"

pinTestClock()

// Typing a reply redraws the reply box and nothing above it. Each thread panel
// read the reply's draft itself, so every keystroke (every 300 ms of one)
// redrew the thread's message and every reply: a long thread drew 11,484
// components a key (scripts/fluidity's chat scenario, 17 Oct). The draft is
// read by the reply box alone now (components/conversation/ThreadReplyBox).

vi.mock("@/hooks/useFetch", () => ({
    useFetch: (url: string) => ({
        isLoading: false, isError: undefined, mutate: () => {}, lastRequestStartedAt: 1,
        data: url ? { data: { post_uuid: A, chat_uuid: A, post_comments: [], chat_comments: [] } } : undefined,
    }),
    useFetchOnlyOnce: () => ({ data: { data: { user_uuid: "me", user_name: "Sam Rivera" } } }),
}))
vi.mock("@/hooks/usePost", () => ({ usePost: () => ({ isSubmitting: false, makeRequest: () => new Promise(() => {}) }) }))
vi.mock("@/lib/axiosInstance", () => ({
    default: { post: () => new Promise(() => {}), get: () => new Promise(() => {}) },
    OWN_ERRORS: { suppressErrorToast: true },
}))
vi.mock("@/hooks/useClientConfig", () => ({ useClientConfig: () => ({}) }))
vi.mock("@/components/textInput/textInput", () => ({
    default: ({ content, onChange }: { content?: string | null; onChange?: (v: string) => void }) => (
        <textarea aria-label="Reply" value={content ?? ""} onChange={(e) => onChange?.(e.target.value)} />
    ),
}))

// What typing must leave alone: the thread's message and its replies.
const draws = { root: 0, replies: 0 }
vi.mock("@/components/rightPanel/messageContent", () => ({
    MessageContent: () => {
        draws.root++
        return <div data-testid="root-message" />
    },
}))
vi.mock("@/components/rightPanel/commentsList", () => ({
    CommentsList: () => {
        draws.replies++
        return <div data-testid="replies" />
    },
}))
vi.mock("@/components/rightPanel/rightPanelHeader", () => ({ RightPanelHeader: () => <header>Thread</header> }))
vi.mock("@/components/ai/ThreadSummaryButton", () => ({ ThreadSummaryButton: () => null }))
vi.mock("@/components/ai/AgentWorkStrip", () => ({ AgentWorkStrip: () => null }))

const A = "aaaa0000-0000-4000-8000-00000000000a"
const CH = "c0ffee00-0000-4000-8000-000000000001"
const MAYA = "a11ce000-0000-4000-8000-00000000000a"
const GRP = "9a0b0000-0000-4000-8000-0000000000aa"
const by = { user_uuid: MAYA, user_name: "Maya Chen" }

const { default: store, RESET_STORE_ACTION } = await import("@/store/store")
const { openRightPanel } = await import("@/store/slice/desktopRightPanelSlice")
const { updateChannelPosts } = await import("@/store/slice/channelSlice")
const { updateChats } = await import("@/store/slice/chatSlice")
const { updateGroupChats } = await import("@/store/slice/groupChatSlice")
const { ChannelComments } = await import("@/components/rightPanel/channelComments")
const { ChatComments } = await import("@/components/rightPanel/chatComments")
const { GroupChatComments } = await import("@/components/rightPanel/groupChatComments")

beforeEach(() => {
    store.dispatch({ type: RESET_STORE_ACTION })
    draws.root = 0
    draws.replies = 0
})
afterEach(cleanup)

const surfaces = [
    {
        name: "a channel's thread",
        view: <ChannelComments />,
        open: () => {
            store.dispatch(updateChannelPosts({ channelId: CH, posts: [{ post_uuid: A, post_text: "plan", post_by: by, post_created_at: "2026-10-13T09:00:00Z" }] } as never))
            store.dispatch(openRightPanel({ channelUUID: CH, postUUID: A }))
        },
    },
    {
        name: "a DM's thread",
        view: <ChatComments />,
        open: () => {
            store.dispatch(updateChats({ chatId: MAYA, chats: [{ chat_uuid: A, chat_body_text: "plan", chat_from: by, chat_created_at: "2026-10-13T09:00:00Z" }] } as never))
            store.dispatch(openRightPanel({ chatUUID: MAYA, chatMessageUUID: A }))
        },
    },
    {
        name: "a group's thread",
        view: <GroupChatComments />,
        open: () => {
            store.dispatch(updateGroupChats({ grpId: GRP, chats: [{ chat_uuid: A, chat_body_text: "plan", chat_from: by, chat_created_at: "2026-10-13T09:00:00Z" }] } as never))
            store.dispatch(openRightPanel({ groupUUID: GRP, chatMessageUUID: A }))
        },
    },
]

describe.each(surfaces)("typing a reply in $name", ({ view, open }) => {
    it("redraws neither the thread's message nor its replies", () => {
        open()
        render(<Provider store={store}>{view}</Provider>)
        expect(screen.getByTestId("root-message")).toBeTruthy()
        const before = { ...draws }
        const box = screen.getByLabelText("Reply") as HTMLTextAreaElement
        let text = ""
        for (const ch of "Shipping it on Friday") {
            text += ch
            act(() => void fireEvent.change(box, { target: { value: `<p>${text}</p>` } }))
        }
        // The box holds what was typed: the draft went where it belongs.
        expect(box.value).toBe("<p>Shipping it on Friday</p>")
        expect(draws).toEqual(before)
    })
})

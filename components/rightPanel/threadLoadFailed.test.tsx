import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { Provider } from "react-redux"

// TN-BUG-4: a thread whose read failed spun for ever. The views drew "loading"
// whenever there was no data, before they looked at the error, and a failed
// read has no data; the error state under it was never reached (and its Retry
// reloaded the whole window). These open each thread view on a failed read.

const answers: Record<string, unknown> = {}
const mutate = vi.fn()
vi.mock("@/hooks/useFetch", () => ({
    useFetch: (url: string) => ({ isLoading: false, isError: undefined, mutate, lastRequestStartedAt: 1, ...(answers[url.split("/").pop() || ""] as object) }),
    useFetchOnlyOnce: () => ({ data: { data: { user_uuid: "me", user_name: "Sam Rivera" } } }),
}))
vi.mock("@/hooks/usePost", () => ({ usePost: () => ({ isSubmitting: false, makeRequest: () => new Promise(() => {}) }) }))
vi.mock("@/hooks/useUploadFile", () => ({ useUploadFile: () => ({}) }))
vi.mock("next/navigation", () => ({
    useRouter: () => ({ push: () => {}, replace: () => {} }),
    usePathname: () => "/app",
    useSearchParams: () => new URLSearchParams(),
}))
vi.mock("@/components/textInput/textInput", () => ({ default: () => <div data-testid="composer" /> }))
vi.mock("@/components/rightPanel/messageContent", () => ({ MessageContent: () => <div data-testid="root-message" /> }))
vi.mock("@/components/rightPanel/commentsList", () => ({ CommentsList: () => null }))
vi.mock("@/components/rightPanel/rightPanelHeader", () => ({ RightPanelHeader: () => <header>Thread</header> }))
vi.mock("@/components/mobileMessage/mobileMessage", () => ({ MobileMessage: () => <div data-testid="root-message" /> }))
vi.mock("@/components/mobileMessage/mobileMessageCommentList", () => ({ MobileMessageCommentList: () => null }))

const { default: store, RESET_STORE_ACTION } = await import("@/store/store")
const { openRightPanel } = await import("@/store/slice/desktopRightPanelSlice")
const { updateChannelPosts } = await import("@/store/slice/channelSlice")
const { updateChats } = await import("@/store/slice/chatSlice")
const { updateGroupChats } = await import("@/store/slice/groupChatSlice")
const { ChannelComments } = await import("@/components/rightPanel/channelComments")
const { ChatComments } = await import("@/components/rightPanel/chatComments")
const { GroupChatComments } = await import("@/components/rightPanel/groupChatComments")
const { MobilePost } = await import("@/components/mobilePost/mobilePost")
const { MobileChat } = await import("@/components/mobileChatMessage/mobileChat")
const { MobileGroupChat } = await import("@/components/mobileChatMessage/mobileGroupChat")

const CH = "c0ffee00-0000-4000-8000-000000000001"
const MAYA = "a11ce000-0000-4000-8000-00000000000a"
const GRP = "9a0b0000-0000-4000-8000-0000000000aa"
const A = "aaaa0000-0000-4000-8000-00000000000a"
const by = { user_uuid: MAYA, user_name: "Maya Chen" }
const post = { post_uuid: A, post_text: "Ship it", post_by: by, post_created_at: "2026-10-13T09:00:00Z" }
const message = { chat_uuid: A, chat_body_text: "Ship it", chat_from: by, chat_created_at: "2026-10-13T09:00:00Z" }

const failed = (status: number | undefined) => ({ data: undefined, isError: status ? { response: { status } } : new Error("Network Error") })

beforeEach(() => {
    store.dispatch({ type: RESET_STORE_ACTION })
    mutate.mockClear()
    store.dispatch(updateChannelPosts({ channelId: CH, posts: [post] } as never))
    store.dispatch(updateChats({ chatId: MAYA, chats: [message] } as never))
    store.dispatch(updateGroupChats({ grpId: GRP, chats: [message] } as never))
})
afterEach(cleanup)

const views = [
    { name: "a channel's thread panel", view: <ChannelComments />, panel: { channelUUID: CH, postUUID: A } },
    { name: "a DM's thread panel", view: <ChatComments />, panel: { chatUUID: MAYA, chatMessageUUID: A } },
    { name: "a group's thread panel", view: <GroupChatComments />, panel: { groupUUID: GRP, chatMessageUUID: A } },
    { name: "a channel's thread on a phone", view: <MobilePost channelId={CH} postUUID={A} /> },
    { name: "a DM's thread on a phone", view: <MobileChat chatId={MAYA} chatMessageUUID={A} /> },
    { name: "a group's thread on a phone", view: <MobileGroupChat grpId={GRP} chatMessageUUID={A} /> },
]

describe.each(views)("$name", ({ view, panel }) => {
    function show() {
        if (panel) store.dispatch(openRightPanel(panel))
        return render(<Provider store={store}>{view}</Provider>)
    }

    it("says a failed read failed, and Try again reads the thread again", () => {
        answers[A] = failed(500)
        show()
        expect(screen.getByText("Couldn't load this thread")).toBeInTheDocument()
        expect(screen.queryByRole("status", { name: /loading/i })).toBeNull()
        fireEvent.click(screen.getByRole("button", { name: "Try again" }))
        expect(mutate).toHaveBeenCalledTimes(1)
    })

    it("says the same when the connection dropped", () => {
        answers[A] = failed(undefined)
        show()
        expect(screen.getByText("Couldn't load this thread")).toBeInTheDocument()
    })

    it("shows Try again working while it reads again", () => {
        answers[A] = { ...failed(503), isLoading: true }
        show()
        expect(screen.getByRole("button", { name: /Retrying/ })).toBeDisabled()
    })

    it("says a thread that is gone is gone", () => {
        answers[A] = failed(404)
        show()
        expect(screen.getByText("This thread isn't available")).toBeInTheDocument()
        const close = screen.queryByRole("button", { name: "Close" })
        if (!panel) {
            // The phone's page has its own way back.
            expect(close).toBeNull()
            return
        }
        expect(store.getState().rightPanel.rightPanelState.isOpen).toBe(true)
        fireEvent.click(close!)
        expect(store.getState().rightPanel.rightPanelState.isOpen).toBe(false)
    })

    it("keeps a thread on screen when a later read fails", () => {
        answers[A] = { data: { data: { post_uuid: A, chat_uuid: A, post_comments: [], chat_comments: [] } }, isError: { response: { status: 500 } } }
        show()
        expect(screen.getByTestId("root-message")).toBeInTheDocument()
        expect(screen.queryByText("Couldn't load this thread")).toBeNull()
    })
})

describe("a thread panel that is opened again after a failure", () => {
    it("shows the thread once its read answers", () => {
        answers[A] = failed(500)
        store.dispatch(openRightPanel({ channelUUID: CH, postUUID: A }))
        const view = render(<Provider store={store}><ChannelComments /></Provider>)
        expect(screen.getByText("Couldn't load this thread")).toBeInTheDocument()
        answers[A] = { data: { data: { post_uuid: A, post_comments: [] } } }
        act(() => view.rerender(<Provider store={store}><ChannelComments /></Provider>))
        expect(screen.getByTestId("root-message")).toBeInTheDocument()
    })
})

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { Provider } from "react-redux"
import { pinTestClock } from "@/lib/testing/testClock"

pinTestClock()

// A reply's reaction, reacted, changed and taken back, as the thread panel
// does it in a channel, a DM and a group: the take-back names the reaction the
// server made. A change answered with no id in a channel's thread, and the
// take-back that followed was refused (404, There's no such reaction).

type Request = { apiEndpoint: string; payload?: Record<string, string> }
const makeRequest = vi.fn<(request: Request) => Promise<object>>(async () => ({}))
const answers: Record<string, unknown> = {}
// The box reads its conversation's command catalog as it draws (LazyCommandSurface).
vi.mock("@/services/commandService", () => ({ fetchCommandCatalog: async () => ({ commands: [] }) }))
vi.mock("@/hooks/useFetch", () => ({
    useFetch: (url: string) => ({ isLoading: false, isError: undefined, mutate: () => {}, lastRequestStartedAt: 1, ...(answers[url.split("/").pop() || ""] as object) }),
    useFetchOnlyOnce: () => ({ data: { data: { user_uuid: ME, user_name: "Sam Rivera" } } }),
}))
vi.mock("@/hooks/usePost", () => ({ usePost: () => ({ isSubmitting: false, makeRequest }) }))
vi.mock("@/hooks/useUploadFile", () => ({ useUploadFile: () => ({}) }))
vi.mock("@/components/textInput/textInput", () => ({ default: () => <div data-testid="composer" /> }))
vi.mock("@/components/rightPanel/messageContent", () => ({ MessageContent: () => null }))
// The reply's reaction row: React, Change and Take back, each with the
// reaction as the panel holds it now.
type Reaction = { uid: string; reaction_emoji_id: string; reaction_added_by?: { user_uuid: string } }
vi.mock("@/components/rightPanel/commentsList", () => ({
    CommentsList: ({ comments, addOrUpdateReaction, removeReaction }: {
        comments: { comment_uuid: string; comment_reactions?: Reaction[] }[]
        addOrUpdateReaction: (emoji: string, reactionId: string, comment: string, idx: number) => void
        removeReaction: (reactionId: string, comment: string, idx: number) => void
    }) => {
        const c = comments[0]
        const mine = c?.comment_reactions?.find((r) => r.reaction_added_by?.user_uuid === ME)
        return (
            <div>
                <span data-testid="mine">{mine?.uid ?? ""}</span>
                <button type="button" onClick={() => addOrUpdateReaction("thumbs-up", "", c.comment_uuid, 0)}>React</button>
                <button type="button" onClick={() => addOrUpdateReaction("party", mine?.uid ?? "", c.comment_uuid, 0)}>Change</button>
                <button type="button" onClick={() => removeReaction(mine?.uid ?? "", c.comment_uuid, 0)}>Take back</button>
            </div>
        )
    },
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

const ME = "5a000000-0000-4000-8000-0000000000aa"
const CH = "c0ffee00-0000-4000-8000-000000000001"
const MAYA = "a11ce000-0000-4000-8000-00000000000a"
const GRP = "9a0b0000-0000-4000-8000-0000000000aa"
const ROOT = "5007a000-0000-4000-8000-00000000000a"
const REPLY = "5007a000-0000-4000-8000-00000000000b"
const by = { user_uuid: MAYA, user_name: "Maya Chen" }
const reply = { comment_uuid: REPLY, comment_text: "<p>Done</p>", comment_by: by, comment_created_at: "2026-10-13T09:05:00Z" }

beforeEach(() => {
    store.dispatch({ type: RESET_STORE_ACTION })
    makeRequest.mockReset()
})
afterEach(cleanup)

describe.each([
    {
        name: "a channel's thread",
        view: <ChannelComments />,
        panel: { channelUUID: CH, postUUID: ROOT },
        root: { post_uuid: ROOT, post_text: "<p>Plan</p>", post_by: by, post_created_at: "2026-10-13T09:00:00Z", post_comments: [reply] },
        react: PostEndpointUrl.CreateOrUpdatePostCommentReaction,
        takeBack: PostEndpointUrl.RemovePostCommentReaction,
    },
    {
        name: "a DM's thread",
        view: <ChatComments />,
        panel: { chatUUID: MAYA, chatMessageUUID: ROOT },
        root: { chat_uuid: ROOT, chat_body_text: "<p>Plan</p>", chat_from: by, chat_created_at: "2026-10-13T09:00:00Z", chat_comments: [reply] },
        react: PostEndpointUrl.CreateOrUpdateChatCommentReaction,
        takeBack: PostEndpointUrl.RemoveChatCommentReaction,
    },
    {
        name: "a group's thread",
        view: <GroupChatComments />,
        panel: { groupUUID: GRP, chatMessageUUID: ROOT },
        root: { chat_uuid: ROOT, chat_body_text: "<p>Plan</p>", chat_from: by, chat_created_at: "2026-10-13T09:00:00Z", chat_comments: [reply] },
        react: PostEndpointUrl.CreateOrUpdateChatCommentReaction,
        takeBack: PostEndpointUrl.RemoveChatCommentReaction,
    },
])("a reply's reaction in $name", ({ view, panel, root, react, takeBack }) => {
    it("reacts, changes the emoji and takes it back, the take-back naming the reaction the server made", async () => {
        answers[ROOT] = { data: { data: root } }
        // The server: a new reaction answers its uid, a change names its own.
        makeRequest.mockImplementation(async (r: Request) =>
            r.apiEndpoint === react ? { comment_id: REPLY, reaction_dgraph_id: r.payload?.reaction_dgraph_id || "0x51" } : {})
        store.dispatch(openRightPanel(panel))
        render(<Provider store={store}>{view}</Provider>)

        await act(async () => fireEvent.click(screen.getByRole("button", { name: "React" })))
        expect(screen.getByTestId("mine").textContent).toBe("0x51")
        await act(async () => fireEvent.click(screen.getByRole("button", { name: "Change" })))
        expect(screen.getByTestId("mine").textContent).toBe("0x51")
        await act(async () => fireEvent.click(screen.getByRole("button", { name: "Take back" })))

        const calls = makeRequest.mock.calls.map(([r]) => [r.apiEndpoint, r.payload?.reaction_dgraph_id ?? ""])
        expect(calls).toEqual([[react, ""], [react, "0x51"], [takeBack, "0x51"]])
        expect(screen.getByTestId("mine").textContent).toBe("")
    })

    it("keeps the reaction's id when a change is answered without one, as the server did", async () => {
        answers[ROOT] = { data: { data: root } }
        makeRequest.mockImplementation(async (r: Request) =>
            r.apiEndpoint === react ? (r.payload?.reaction_dgraph_id ? { comment_id: REPLY } : { comment_id: REPLY, reaction_dgraph_id: "0x51" }) : {})
        store.dispatch(openRightPanel(panel))
        render(<Provider store={store}>{view}</Provider>)
        await act(async () => fireEvent.click(screen.getByRole("button", { name: "React" })))
        await act(async () => fireEvent.click(screen.getByRole("button", { name: "Change" })))
        await act(async () => fireEvent.click(screen.getByRole("button", { name: "Take back" })))
        expect(makeRequest.mock.calls.at(-1)?.[0]).toMatchObject({ apiEndpoint: takeBack, payload: { reaction_dgraph_id: "0x51" } })
    })
})

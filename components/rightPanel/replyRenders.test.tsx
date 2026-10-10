import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { Provider } from "react-redux"

// A thread's replies (MessageContent). Each one copied its reactions into
// state in an effect, so it drew twice as it mounted, and each built its own
// hidden toolbar of actions with a dozen tooltips: a thread of fifty replies
// built fifty toolbars nobody could see.

let draws = 0
vi.mock("@/hooks/useUserInfoState", () => ({
    useUserInfoState: () => {
        draws++
        return {}
    },
}))
// One answer, as SWR keeps it between renders.
const self = { data: { data: { user_uuid: "me" } } }
vi.mock("@/hooks/useFetch", () => ({
    useFetch: () => ({ data: undefined, isLoading: false, mutate: () => {} }),
    useFetchOnlyOnce: () => self,
}))
vi.mock("@/hooks/useRelayedAuthor", () => ({ useRelayedAuthor: () => null }))
vi.mock("@/hooks/useBotKinds", () => ({ useBotKind: () => undefined, useBotKindMap: () => ({}) }))
vi.mock("@/components/textInput/textInput", () => ({
    default: ({ content }: { content?: string }) => <div data-testid="body">{content}</div>,
}))
vi.mock("@/components/channel/channelMessageAvatar", () => ({ ChannelMessageAvatar: () => <span /> }))
vi.mock("@/components/ai/SaveToMemoryButton", () => ({ SaveToMemoryButton: () => null }))
vi.mock("@/components/message/AgentResultCards", () => ({ AgentResultCards: () => null }))
vi.mock("@/components/message/WorkLinkCards", () => ({ WorkLinkCards: () => null }))
vi.mock("@/components/message/bottomMenu", () => ({
    BottomMenu: ({ reactions, selectedEmojiId }: { reactions: Record<string, string[]>; selectedEmojiId?: string }) => (
        <ul aria-label="Reactions">
            {Object.entries(reactions).map(([emoji, people]) => (
                <li key={emoji} aria-current={emoji === selectedEmojiId || undefined}>{emoji}: {people.join(", ")}</li>
            ))}
        </ul>
    ),
}))
let toolbars = 0
vi.mock("@/components/MessageDesktopHover/MessageDesktopHoverOptionsForRightPanelChatAndChannel", () => ({
    MessageDesktopHoverOptionsForRightPanelChatAndChannel: () => {
        toolbars++
        return <div role="toolbar" aria-label="Reply actions"><button>React</button></div>
    },
}))

const { default: store } = await import("@/store/store")
const { MessageContent } = await import("@/components/rightPanel/messageContent")

const reactions = [
    { uid: "r1", reaction_emoji_id: "+1", reaction_added_by: { user_uuid: "me", user_name: "Sam Rivera" } },
    { uid: "r2", reaction_emoji_id: "+1", reaction_added_by: { user_uuid: "maya", user_name: "Maya Chen" } },
    { uid: "r3", reaction_emoji_id: "eyes", reaction_added_by: { user_uuid: "maya", user_name: "Maya Chen" } },
]

function reply() {
    return render(
        <Provider store={store}>
            <MessageContent
                userInfo={{ user_uuid: "maya", user_name: "Maya Chen" } as never}
                createdAt="2026-10-10T09:01:00Z"
                content="<p>Shipped.</p>"
                commentUUID="c1"
                channelUUID="ch1"
                rawReactions={reactions as never}
                removeReaction={() => {}}
                addReaction={() => {}}
                updateMessage={() => {}}
                deleteMessage={() => {}}
                getMediaUrl=""
            />
        </Provider>,
    )
}

describe("a reply in a thread", () => {
    afterEach(() => {
        cleanup()
        draws = 0
        toolbars = 0
    })

    it("draws once as it mounts, its reactions with it", () => {
        reply()
        expect(draws).toBe(1)
        const list = screen.getByRole("list", { name: "Reactions" })
        expect(list.textContent).toContain("+1: Sam Rivera, Maya Chen")
        expect(list.textContent).toContain("eyes: Maya Chen")
        expect(list.querySelector("[aria-current]")?.textContent).toContain("+1")
    })

    it("builds its actions only while pointed at or focused", () => {
        const { container } = reply()
        expect(toolbars).toBe(0)
        const row = container.firstElementChild as HTMLElement
        fireEvent.pointerEnter(row)
        expect(screen.getByRole("toolbar", { name: "Reply actions" })).toBeTruthy()
        fireEvent.pointerLeave(row)
        expect(screen.queryByRole("toolbar", { name: "Reply actions" })).toBeNull()

        // By keyboard: focus on the author brings them, after the reply in
        // the tab order; leaving the reply takes them away.
        const author = screen.getByRole("button", { name: "Maya Chen" })
        fireEvent.focus(author)
        const actions = screen.getByRole("toolbar", { name: "Reply actions" })
        expect(author.compareDocumentPosition(actions) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
        fireEvent.blur(author, { relatedTarget: document.body })
        expect(screen.queryByRole("toolbar", { name: "Reply actions" })).toBeNull()
    })
})

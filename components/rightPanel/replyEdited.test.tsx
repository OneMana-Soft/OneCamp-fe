import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"
import { Provider } from "react-redux"
import { pinTestClock } from "@/lib/testing/testClock"

pinTestClock()

// MC-25: an edited thread reply said nothing of it; a message in the list
// says "(edited)" with both times.

vi.mock("@/hooks/useUserInfoState", () => ({ useUserInfoState: () => ({}) }))
const self = { data: { data: { user_uuid: "me" } } }
vi.mock("@/hooks/useFetch", () => ({
    useFetch: () => ({ data: undefined, isLoading: false, mutate: () => {} }),
    useFetchOnlyOnce: () => self,
}))
vi.mock("@/hooks/useRelayedAuthor", () => ({ useRelayedAuthor: () => null }))
vi.mock("@/hooks/useBotKinds", () => ({ useBotKind: () => undefined, useBotKindMap: () => ({}) }))
vi.mock("@/components/textInput/textInput", () => ({
    default: ({ content, editedTitle }: { content?: string; editedTitle?: string }) => <div data-testid="body" data-edited={editedTitle}>{content}</div>,
}))
vi.mock("@/components/channel/channelMessageAvatar", () => ({ ChannelMessageAvatar: () => <span /> }))
vi.mock("@/components/message/AgentResultCards", () => ({ AgentResultCards: () => null }))
vi.mock("@/components/message/WorkLinkCards", () => ({ WorkLinkCards: () => null }))

const { default: store } = await import("@/store/store")
const { MessageContent } = await import("@/components/rightPanel/messageContent")

afterEach(cleanup)

const reply = (updatedAt?: string) =>
    render(
        <Provider store={store}>
            <MessageContent
                userInfo={{ user_uuid: "maya", user_name: "Maya Chen" } as never}
                createdAt="2026-10-10T09:01:00Z"
                updatedAt={updatedAt}
                content="<p>Shipped.</p>"
                commentUUID="c1"
                channelUUID="ch1"
                removeReaction={() => {}}
                addReaction={() => {}}
                updateMessage={() => {}}
                deleteMessage={() => {}}
                getMediaUrl=""
            />
        </Provider>,
    )

describe("a reply in a thread", () => {
    it("says (edited), with both times, when it was changed after it was sent", () => {
        reply("2026-10-10T09:20:00Z")
        expect(screen.getByTestId("body").dataset.edited).toMatch(/^Edited .+ · originally .+$/)
    })

    it("says nothing of an edit it never had", () => {
        reply()
        expect(screen.getByTestId("body").dataset.edited).toBeUndefined()
    })
})

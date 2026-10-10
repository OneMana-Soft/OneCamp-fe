import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render } from "@testing-library/react"

// The empty places in chat take the playful layer's spot illustrations through
// EmptyState's slot: no direct messages yet, no conversation open, a channel
// list with nothing in it, a search that found nothing and a thread with no
// replies. Each said so in grey text under a small icon, or said nothing.

const fakeState = { chat: { latestChatList: [], chatCallStatus: {} } }
vi.mock("react-redux", () => ({
    useSelector: (select: (s: unknown) => unknown) => select(fakeState),
    useDispatch: () => vi.fn(),
}))
vi.mock("@/hooks/useFetch", () => ({
    useFetch: () => ({ data: { data: { user_dms: [] } } }),
    useFetchOnlyOnce: () => ({ data: { data: { user_uuid: "me" } } }),
}))
vi.mock("@/hooks/usePost", () => ({ usePost: () => ({ makeRequest: vi.fn() }) }))
vi.mock("@/lib/swrMutate", () => ({ dataToSeed: () => undefined }))
vi.mock("@/components/search/searchField", () => ({ SearchField: () => <input aria-label="Search" /> }))
vi.mock("@/context/MediaQueryContext", () => ({ useMedia: () => ({ isDesktop: true, isMobile: false }) }))
let channels: { ch_uuid: string; ch_name: string }[] = []
vi.mock("@/hooks/useApi", () => ({ useApi: () => ({ data: { channels_list: channels }, isLoading: false }) }))

const { ChatUserList } = await import("@/components/chat/chatUserList")
const { default: ChatPage } = await import("@/app/app/chat/page")
const { ChannelListTabAllActive } = await import("@/components/channel/channelListTabAllActive")
const { CommentsList } = await import("@/components/rightPanel/commentsList")
const { ThreadEmpty } = await import("@/components/rightPanel/threadEmpty")

afterEach(() => {
    cleanup()
    channels = []
})

function spotUnder(container: HTMLElement, title: string) {
    const heading = [...container.querySelectorAll("h2,h3,h4")].find((h) => h.textContent === title)
    expect(heading, title).toBeTruthy()
    const state = heading!.closest("div.flex-col") as HTMLElement
    return state.querySelector("[data-empty-illustration] svg")
}

const noop = () => {}

describe("chat's empty places", () => {
    it("show a spot when there are no direct messages yet", () => {
        const { container } = render(<ChatUserList chatId="" />)
        expect(spotUnder(container, "No direct messages yet")).toBeTruthy()
    })

    it("show a spot when no conversation is open", () => {
        const { container } = render(<ChatPage />)
        expect(spotUnder(container, "No conversation open")).toBeTruthy()
    })

    it("show a spot in a channel list with nothing to join, and when a search finds nothing", () => {
        const view = render(<ChannelListTabAllActive searchQuery="" />)
        expect(spotUnder(view.container, "All caught up!")).toBeTruthy()
        cleanup()
        channels = [{ ch_uuid: "c1", ch_name: "general" }]
        const search = render(<ChannelListTabAllActive searchQuery="zzz" />)
        expect(spotUnder(search.container, "No channels match")).toBeTruthy()
        expect(search.container.textContent).toContain("“zzz”")
    })

    it("show a small spot in a thread with no replies, and nothing where no empty state is asked for", () => {
        const props = {
            comments: [],
            removeReaction: noop,
            addOrUpdateReaction: noop,
            removeComment: noop,
            updateComment: noop,
            getMediaURL: "",
        }
        const thread = render(<CommentsList {...props} empty={<ThreadEmpty />} />)
        expect(spotUnder(thread.container, "No replies yet")).toBeTruthy()
        cleanup()
        const task = render(<CommentsList {...props} />)
        expect(task.container.innerHTML).toBe("")
    })
})

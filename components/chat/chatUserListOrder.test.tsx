import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render } from "@testing-library/react"
import { pinTestClock } from "@/lib/testing/testClock"

pinTestClock()

// F-17, on the DM list page as in the sidebar: conversations follow their
// latest message, and a row moved under the pointer while the person aimed
// at it.

type Dm = { dm_grouping_id: string; dm_participants: { user_uuid: string; user_name: string }[]; dm_chats: { chat_created_at: string }[] }
const dm = (who: string, at: string): Dm => ({
    dm_grouping_id: `me ${who}`,
    dm_participants: [{ user_uuid: "me", user_name: "Me" }, { user_uuid: who, user_name: who }],
    dm_chats: [{ chat_created_at: at }],
})
const fakeState = { chat: { latestChatList: [] as Dm[], chatCallStatus: {} } }
vi.mock("react-redux", () => ({
    useSelector: (select: (s: unknown) => unknown) => select(fakeState),
    useDispatch: () => vi.fn(),
}))
vi.mock("@/hooks/useFetch", () => ({
    useFetch: () => ({ data: undefined, isLoading: false }),
    useFetchOnlyOnce: () => ({ data: { data: { user_uuid: "me" } } }),
}))
vi.mock("@/hooks/usePost", () => ({ usePost: () => ({ makeRequest: vi.fn() }) }))
vi.mock("@/lib/swrMutate", () => ({ dataToSeed: () => undefined }))
vi.mock("@/components/search/searchField", () => ({ SearchField: () => <input aria-label="Search" /> }))
vi.mock("@/hooks/useUserInfoState", () => ({ useUserInfoState: () => ({}) }))
vi.mock("@/components/chat/chatUserListUser", () => ({
    default: ({ dmParticipants }: { dmParticipants: { user_name: string }[] }) => <span>{dmParticipants[0].user_name}</span>,
}))

const { ChatUserList } = await import("@/components/chat/chatUserList")

afterEach(cleanup)

const order = (container: HTMLElement) => [...container.querySelectorAll("[data-list-frame] a")].map((a) => a.textContent)

describe("the DM list under the pointer", () => {
    it("never moves a conversation while the pointer is over the list, and does once it leaves", () => {
        fakeState.chat.latestChatList = [dm("maya", "2026-10-14T09:00:00Z"), dm("jonas", "2026-10-14T08:00:00Z")]
        const { container, rerender } = render(<ChatUserList chatId="" />)
        expect(order(container)).toEqual(["maya", "jonas"])

        const list = container.querySelector<HTMLElement>("[data-list-frame]")!
        fireEvent.pointerMove(list)
        // Jonas writes: his conversation is now the newest.
        fakeState.chat.latestChatList = [dm("maya", "2026-10-14T09:00:00Z"), dm("jonas", "2026-10-14T10:00:00Z")]
        rerender(<ChatUserList chatId="" />)
        expect(order(container)).toEqual(["maya", "jonas"])

        act(() => void fireEvent.pointerLeave(list))
        expect(order(container)).toEqual(["jonas", "maya"])
    })
})

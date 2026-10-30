import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"
import { Provider } from "react-redux"
import type { ChatInfo } from "@/types/chat"
import { pinTestClock } from "@/lib/testing/testClock"

pinTestClock()

// A DM's and a group's list on the conversation's list (chat A1 step 2b),
// where each had its own: never the empty state while what it shows is still
// coming (a group's people, a link's page), and a group's messages still shown
// when only its people failed to load. The requests are stand-ins: each key
// answers what answers holds for it, the same object on every render, as SWR
// gives; a key with no answer is on its way.

const answers = new Map<string, { data?: unknown; isError?: unknown }>()
const fetched = new Map<string, unknown>()
const fetchOf = (url: string) => {
  const a = url ? answers.get(url) : undefined
  const key = `${url}|${answers.has(url)}`
  if (!fetched.has(key)) fetched.set(key, { data: a?.data, isError: a?.isError, isLoading: !!url && !a, mutate: () => {}, lastRequestStartedAt: 0 })
  return fetched.get(key)
}
vi.mock("@/hooks/useFetch", () => ({ useFetch: fetchOf, useFetchOnlyOnce: fetchOf }))
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams() }))
vi.mock("@/context/MediaQueryContext", () => ({ useMedia: () => ({ isMobile: false, isDesktop: true }) }))
vi.mock("@/hooks/useMessageResync", () => ({ useMessageResync: () => {} }))
vi.mock("@/components/typingIndicator/typingIndicatorBar", () => ({ ChannelTypingBar: () => null, ChatTypingBar: () => null, GroupChatTypingBar: () => null }))
vi.mock("@/components/conversation/ConversationRows", () => ({ ConversationRows: ({ rows }: { rows: unknown[] }) => <p>{`${rows.length} messages`}</p> }))

const { default: store } = await import("@/store/store")
const { DmList, GroupList } = await import("@/lib/testing/conversationLists")
const { GetEndpointUrl } = await import("@/services/endPoints")
const { updateGroupChats } = await import("@/store/slice/groupChatSlice")

const people = (grpId: string) => `${GetEndpointUrl.GetDmGroupParticipants}/${grpId}`
const loading = () => screen.queryByRole("status", { name: "Loading messages" })
const chat = { chat_uuid: "m1", chat_body_text: "<p>hi</p>", chat_from: { user_uuid: "maya", user_name: "Maya" }, chat_created_at: "2026-10-22T09:00:00Z", chat_comment_count: 0 } as ChatInfo

afterEach(() => {
  cleanup()
  answers.clear()
  fetched.clear()
})

describe("a DM's and a group's list", () => {
  it("is loading while a group's people come, never the empty state", () => {
    render(<Provider store={store}><GroupList grpId="g-people" /></Provider>)
    expect(loading()).toBeTruthy()
    expect(screen.queryByText(/messages$/)).toBeNull()
  })

  it.each([
    ["a DM", () => <DmList other="u-link" link="m9" />],
    ["a group", () => <GroupList grpId="g-link" link="m9" />],
  ])("in %s, is loading while a link's page comes, never the empty state", (_, list) => {
    answers.set(people("g-link"), { data: { data: { dm_participants: [] } } })
    render(<Provider store={store}>{list()}</Provider>)
    expect(loading()).toBeTruthy()
    expect(screen.queryByText(/messages$/)).toBeNull()
  })

  it("in a group whose people failed to load, shows the messages it holds", () => {
    store.dispatch(updateGroupChats({ grpId: "g-held", chats: [chat] }))
    answers.set(people("g-held"), { isError: new Error("500") })
    render(<Provider store={store}><GroupList grpId="g-held" /></Provider>)
    expect(screen.getByText("1 messages")).toBeTruthy()
    expect(screen.queryByText("Couldn't load this conversation")).toBeNull()
  })
})

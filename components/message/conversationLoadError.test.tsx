import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { Provider } from "react-redux"

// A conversation whose messages failed to load says so, with Try again. It
// drew the empty conversation instead ("This is the start of #engineering",
// Say hello) over a history it had only failed to fetch.

const retried = vi.fn(async () => undefined)
const failing = { data: undefined, isLoading: false, isError: new Error("500"), mutate: retried, lastRequestStartedAt: 0 }
const idle = { data: undefined, isLoading: false, isError: undefined, mutate: () => {}, lastRequestStartedAt: 0 }
// A group whose people loaded ("grp-ok"): only its messages can fail.
const people = { data: { data: { dm_participants: [] } }, isLoading: false, isError: undefined, mutate: () => {}, lastRequestStartedAt: 0 }
vi.mock("@/hooks/useFetch", () => ({
  useFetch: (url: string) => (url ? failing : idle),
  useFetchOnlyOnce: (url: string) => (url.includes("grp-ok") ? people : url ? failing : idle),
}))
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams() }))
vi.mock("@/context/MediaQueryContext", () => ({ useMedia: () => ({ isMobile: false, isDesktop: true }) }))
vi.mock("@/hooks/useMessageResync", () => ({ useMessageResync: () => {} }))
vi.mock("@/components/typingIndicator/typingIndicatorBar", () => ({ TypingIndicatorBar: () => null, ChannelTypingBar: () => null, ChatTypingBar: () => null, GroupChatTypingBar: () => null }))
vi.mock("@/components/conversation/ConversationRows", () => ({ ConversationRows: () => <p>This is the start of the conversation</p> }))

const { default: store } = await import("@/store/store")
const { ChannelList, DmList, GroupList } = await import("@/lib/testing/conversationLists")

afterEach(() => {
  cleanup()
  retried.mockClear()
})

describe("a conversation that failed to load", () => {
  it.each([
    ["a channel", () => <ChannelList channelId="ch-fail" />, "Couldn't load this channel's messages"],
    ["a DM", () => <DmList other="dm-fail" />, "Couldn't load this conversation"],
  ])("in %s says so and offers Try again, not the empty state", (_, list, title) => {
    render(<Provider store={store}>{list()}</Provider>)
    expect(screen.getByText(title)).toBeTruthy()
    expect(screen.queryByText(/This is the start of/)).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: "Try again" }))
    expect(retried).toHaveBeenCalled()
  })

  // A link to a message (?postId=, ?messageId=: a notification, search, Later)
  // opens on the page around it and asks for no latest page: that page is the
  // read that failed. A DM and a group drew their empty conversation over it.
  it.each([
    ["a channel", () => <ChannelList channelId="ch-link" link="p1" />, "Couldn't load this channel's messages"],
    ["a DM", () => <DmList other="dm-link" link="m1" />, "Couldn't load this conversation"],
    ["a group", () => <GroupList grpId="grp-ok" link="m1" />, "Couldn't load this conversation"],
  ])("in %s opened at a message says so when that page fails, not the empty state", (_, list, title) => {
    render(<Provider store={store}>{list()}</Provider>)
    expect(screen.getByText(title)).toBeTruthy()
    expect(screen.queryByText(/This is the start of/)).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: "Try again" }))
    expect(retried).toHaveBeenCalled()
  })

  it("in a group says so too, when who is in it failed to load", () => {
    // A group asks for its people first and its messages after: either
    // failing is the conversation failing to load.
    render(<Provider store={store}><GroupList grpId="grp-fail" /></Provider>)
    expect(screen.getByText("Couldn't load this conversation")).toBeTruthy()
    expect(screen.queryByText(/This is the start of/)).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: "Try again" }))
    expect(retried).toHaveBeenCalled()
  })
})

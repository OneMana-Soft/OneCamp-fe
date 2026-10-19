import { afterEach, describe, expect, it, vi } from "vitest"
import type { ScopedMutator } from "swr"
import { applyConversationAccess, readConversationAccess } from "@/lib/mqtt/conversationAccess"
import { GetEndpointUrl } from "@/services/endPoints"

// A conversation started, joined or added to after the page loaded never
// streamed: the app held only the topics its settings named when it
// connected. Told on its own topic, the app fetches its settings again, and
// the lists that show conversations. A group never changes its id (chat A9):
// adding someone opens the group of the new set, which arrives like any new
// conversation.

const cached = [
  `${GetEndpointUrl.SelfProfileSideNav}`,
  `${GetEndpointUrl.GetUserActiveChannelList}`,
  `${GetEndpointUrl.GetAllActiveChannelList}`,
  `${GetEndpointUrl.ChannelBasicInfo}/ch-1`,
  `${GetEndpointUrl.ChannelBasicInfo}/ch-2`,
  `${GetEndpointUrl.GetUserLatestChatList}`,
  `${GetEndpointUrl.GetChannelLatestPost}/ch-1`,
]

function revalidated(mutate: ReturnType<typeof vi.fn>): string[] {
  const match = mutate.mock.calls[0][0] as (key: unknown) => boolean
  return cached.filter((key) => match(key))
}

afterEach(() => vi.restoreAllMocks())

describe("a conversation that became the member's", () => {
  it("fetches the settings again, and the lists the channel shows in", () => {
    const refreshTopics = vi.fn()
    const mutate = vi.fn()
    applyConversationAccess({ kind: "channel", id: "ch-1", change: "added" }, { refreshTopics, mutate: mutate as unknown as ScopedMutator })
    expect(refreshTopics).toHaveBeenCalledOnce()
    expect(revalidated(mutate)).toEqual([
      GetEndpointUrl.SelfProfileSideNav,
      GetEndpointUrl.GetUserActiveChannelList,
      GetEndpointUrl.GetAllActiveChannelList,
      `${GetEndpointUrl.ChannelBasicInfo}/ch-1`,
    ])
  })

  it("brings a first DM into the DM list", () => {
    const mutate = vi.fn()
    applyConversationAccess({ kind: "dm", id: "a b", change: "added" }, { refreshTopics: () => {}, mutate: mutate as unknown as ScopedMutator })
    expect(revalidated(mutate)).toEqual([GetEndpointUrl.SelfProfileSideNav, GetEndpointUrl.GetUserLatestChatList])
  })

  it("brings the group of a new set of people into the lists, and moves no view", () => {
    const mutate = vi.fn()
    const moved = vi.fn()
    window.addEventListener("conversation-moved", moved)
    applyConversationAccess({ kind: "group", id: "grp-new", change: "added" }, { refreshTopics: () => {}, mutate: mutate as unknown as ScopedMutator })
    window.removeEventListener("conversation-moved", moved)
    expect(revalidated(mutate)).toEqual([GetEndpointUrl.SelfProfileSideNav, GetEndpointUrl.GetUserLatestChatList])
    expect(moved).not.toHaveBeenCalled()
  })
})

describe("the event's data", () => {
  it("is read only when it's whole", () => {
    expect(readConversationAccess({ kind: "channel", id: "c", change: "dropped" })).toEqual({ kind: "channel", id: "c", change: "dropped" })
    // An older server's previous_id names a re-keyed group, which no longer happens: it isn't carried.
    expect(readConversationAccess({ kind: "group", id: "g2", change: "added", previous_id: "g1" })).toEqual({ kind: "group", id: "g2", change: "added" })
    for (const bad of [null, "x", {}, { kind: "doc", id: "d", change: "added" }, { kind: "dm", id: "", change: "added" }, { kind: "dm", id: "a", change: "joined" }]) {
      expect(readConversationAccess(bad)).toBeNull()
    }
  })
})

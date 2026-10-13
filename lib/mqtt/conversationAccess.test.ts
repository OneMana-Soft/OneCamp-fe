import { afterEach, describe, expect, it, vi } from "vitest"
import type { ScopedMutator } from "swr"
import {
  CONVERSATION_MOVED_EVENT,
  applyConversationAccess,
  readConversationAccess,
  type ConversationMoved,
} from "@/lib/mqtt/conversationAccess"
import { GetEndpointUrl } from "@/services/endPoints"

// A conversation started, joined or added to after the page loaded never
// streamed: the app held only the topics its settings named when it
// connected. Told on its own topic, the app fetches its settings again, and
// the lists that show conversations, and a group open on an id it no longer
// has moves to the new one.

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

  it("moves an open group to the id it has now that it took someone in", () => {
    const moved: ConversationMoved[] = []
    const listen = (e: Event) => moved.push((e as CustomEvent<ConversationMoved>).detail)
    window.addEventListener(CONVERSATION_MOVED_EVENT, listen)
    applyConversationAccess(
      { kind: "group", id: "grp-new", change: "added", previous_id: "grp-old" },
      { refreshTopics: () => {}, mutate: vi.fn() as unknown as ScopedMutator },
    )
    window.removeEventListener(CONVERSATION_MOVED_EVENT, listen)
    expect(moved).toEqual([{ kind: "group", from: "grp-old", to: "grp-new" }])
  })
})

describe("the event's data", () => {
  it("is read only when it's whole", () => {
    expect(readConversationAccess({ kind: "channel", id: "c", change: "dropped" })).toEqual({ kind: "channel", id: "c", change: "dropped" })
    expect(readConversationAccess({ kind: "group", id: "g2", change: "added", previous_id: "g1" })?.previous_id).toBe("g1")
    for (const bad of [null, "x", {}, { kind: "doc", id: "d", change: "added" }, { kind: "dm", id: "", change: "added" }, { kind: "dm", id: "a", change: "joined" }]) {
      expect(readConversationAccess(bad)).toBeNull()
    }
  })
})

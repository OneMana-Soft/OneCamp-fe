import { describe, expect, it } from "vitest"
import { adapterOf, channelAdapter, dmAdapter, groupAdapter } from "@/lib/conversation/adapters"
import { mapChatInfoToBaseMessage, mapPostsResToBaseMessage } from "@/components/message/baseMessageCard"
import { pinTestClock } from "@/lib/testing/testClock"
import type { ChatInfo } from "@/types/chat"
import type { PostsRes } from "@/types/post"

pinTestClock()

// Each kind is read through its adapter (chat A1): a thin map onto today's
// endpoints, asking for the same pages today's lists ask for, so the server
// contract doesn't change.

const EDGE = { at: "2026-10-16T09:00:00.5Z", id: "2b0e7f1a-1c2d-4e3f-8a9b-0c1d2e3f4a5b" }
const query = "?at=2026-10-16T09%3A00%3A00.5Z&id=2b0e7f1a-1c2d-4e3f-8a9b-0c1d2e3f4a5b"
const secs = 1792141200 // 2026-10-16T09:00:00Z

describe("the adapters' pages", () => {
  it("ask a channel's pages by its id, an exact cursor beside the edge", () => {
    const ref = { kind: "channel" as const, id: "c1" }
    expect(channelAdapter.latestKey(ref)).toBe("/po/latestPosts/c1")
    expect(channelAdapter.olderKey(ref, EDGE)).toBe(`/po/oldPosts/c1/${secs}${query}`)
    expect(channelAdapter.newerKey(ref, EDGE)).toBe(`/po/newPosts/c1/${secs + 1}${query}`)
    expect(channelAdapter.aroundKey(ref, "p9")).toBe("/po/newPostsIncludingCurrent/c1/p9")
  })

  it("ask a DM's by the other person, as its routes are", () => {
    const ref = { kind: "dm" as const, id: "maya sam", other: "maya" }
    expect(dmAdapter.latestKey(ref)).toBe("/dm/latestChat/maya")
    expect(dmAdapter.olderKey(ref, EDGE)).toBe(`/dm/oldChats/maya/${secs}${query}`)
    expect(dmAdapter.aroundKey(ref, "m9")).toBe("/dm/newChatsIncludingCurrentChat/maya/m9")
  })

  it("ask a group's by its grouping id", () => {
    const ref = { kind: "group" as const, id: "g1" }
    expect(groupAdapter.latestKey(ref)).toBe("/groupChat/latestChat/g1")
    expect(groupAdapter.newerKey(ref, EDGE)).toBe(`/groupChat/newChats/g1/${secs + 1}${query}`)
    expect(adapterOf(ref)).toBe(groupAdapter)
  })
})

describe("the adapters' rows", () => {
  it("come oldest first, each at its exact place, as the one message shape", () => {
    const p = (id: string, at: string) => ({ post_uuid: id, post_created_at: at, post_text: "", post_by: { user_uuid: "u", user_name: "U", user_profile_object_key: "" }, post_comment_count: 0 }) as PostsRes
    const rows = channelAdapter.rowsOf({ data: { posts: [p("b", "2026-10-16T09:01:00Z"), p("a", "2026-10-16T09:00:00Z")], has_more: false } })
    expect(rows.map((r) => r.post_uuid)).toEqual(["a", "b"])
    expect(channelAdapter.cursorOf(rows[0])).toEqual({ at: "2026-10-16T09:00:00Z", id: "a" })
    expect(channelAdapter.toMessage(rows[0])).toEqual(mapPostsResToBaseMessage(rows[0]))

    const c = { chat_uuid: "m1", chat_created_at: "2026-10-16T09:00:00Z", chat_body_text: "", chat_from: { user_uuid: "u", user_name: "U", user_profile_object_key: "" }, chat_attachments: [], chat_comment_count: 0 } as unknown as ChatInfo
    expect(groupAdapter.rowsOf({ data: { chats: [c], has_more: false } }).map(groupAdapter.toMessage)).toEqual([mapChatInfoToBaseMessage(c)])
    expect(dmAdapter.rowsOf(undefined)).toEqual([])
  })
})

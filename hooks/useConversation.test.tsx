import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, renderHook } from "@testing-library/react"
import type { PostsRes } from "@/types/post"
import type { ChatInfo } from "@/types/chat"

// Today's reads, stood in for: each key answers what answers holds for it,
// and the store holds what store holds.
const asked: string[] = []
const answers = new Map<string, { data?: unknown; isError?: unknown }>()
const mutate = vi.fn()
const fetchOf = (url: string) => {
  asked.push(url)
  const a = url ? answers.get(url) : undefined
  return { data: a?.data, isError: a?.isError, isLoading: !!url && !a, mutate }
}
vi.mock("@/hooks/useFetch", () => ({ useFetch: fetchOf, useFetchOnlyOnce: fetchOf }))
let store: Record<string, Record<string, Record<string, unknown[]>>> = {}
vi.mock("react-redux", () => ({ useSelector: (select: (s: unknown) => unknown) => select(store) }))

const { useConversation } = await import("@/hooks/useConversation")
const { mapPostsResToBaseMessage, mapChatInfoToBaseMessage } = await import("@/components/message/baseMessageCard")

const person = { user_uuid: "u-maya", user_name: "Maya", user_profile_object_key: "" }
const post = (id: string, at: string) => ({ post_uuid: id, post_text: `<p>${id}</p>`, post_by: person, post_created_at: at, post_comment_count: 0 }) as PostsRes
const chat = (id: string, at: string) => ({ chat_uuid: id, chat_body_text: `<p>${id}</p>`, chat_from: person, chat_to: person, chat_created_at: at, chat_attachments: [], chat_comment_count: 0 }) as ChatInfo
const emptyStore = () => ({ channel: { channelPosts: {} }, chat: { chatMessages: {} }, groupChat: { chatMessages: {} } })

afterEach(() => {
  cleanup()
  asked.length = 0
  answers.clear()
  mutate.mockClear()
  store = emptyStore()
})

// Day 0 is today's reads: the store's live list, or the latest page today's
// list asks for, on its key, read as today's rows are.
describe("useConversation, on day 0", () => {
  it("shows a channel's latest page, oldest first, before the store holds it", () => {
    store = emptyStore()
    const newest = post("p2", "2026-10-14T09:01:00Z")
    const older = post("p1", "2026-10-14T09:00:00Z")
    answers.set("/po/latestPosts/c1", { data: { data: { posts: [newest, older], has_more: false } } })
    const { result } = renderHook(() => useConversation({ kind: "channel", id: "c1" }))
    expect(asked).toContain("/po/latestPosts/c1")
    expect(result.current.status).toBe("ready")
    expect(result.current.messages).toEqual([mapPostsResToBaseMessage(older), mapPostsResToBaseMessage(newest)])
  })

  it("shows the store's list once it holds one: the live copy", () => {
    store = emptyStore()
    const live = post("p3", "2026-10-14T09:02:00Z")
    store.channel.channelPosts.c1 = [live]
    answers.set("/po/latestPosts/c1", { data: { data: { posts: [post("p1", "2026-10-14T09:00:00Z")], has_more: false } } })
    const { result } = renderHook(() => useConversation({ kind: "channel", id: "c1" }))
    expect(result.current.messages).toEqual([mapPostsResToBaseMessage(live)])
  })

  it("reads a DM by the person beside you, as its list and store do", () => {
    store = emptyStore()
    const m = chat("m1", "2026-10-14T09:00:00Z")
    store.chat.chatMessages["u-jonas"] = [m]
    const { result } = renderHook(() => useConversation({ kind: "dm", id: "u-jonas u-maya", other: "u-jonas" }))
    expect(asked).toContain("/dm/latestChat/u-jonas")
    expect(result.current.messages).toEqual([mapChatInfoToBaseMessage(m)])
  })

  it("asks for a group's page only once its people have answered", () => {
    store = emptyStore()
    const first = renderHook(() => useConversation({ kind: "group", id: "g1" }))
    expect(asked).toContain("/groupChat/getDmParticipants/g1")
    expect(asked.some((u) => u.startsWith("/groupChat/latestChat"))).toBe(false)
    expect(first.result.current.status).toBe("loading")
    first.result.current.retry()
    expect(mutate).toHaveBeenCalledTimes(1)

    answers.set("/groupChat/getDmParticipants/g1", { data: { data: { dm_grouping_id: "g1" } } })
    const m = chat("m1", "2026-10-14T09:00:00Z")
    answers.set("/groupChat/latestChat/g1", { data: { data: { chats: [m], has_more: false } } })
    const { result } = renderHook(() => useConversation({ kind: "group", id: "g1" }))
    expect(asked).toContain("/groupChat/latestChat/g1")
    expect(result.current.messages).toEqual([mapChatInfoToBaseMessage(m)])
  })

  it("says a conversation that couldn't be read failed, never that it's empty", () => {
    store = emptyStore()
    answers.set("/po/latestPosts/c1", { isError: new Error("503") })
    const { result } = renderHook(() => useConversation({ kind: "channel", id: "c1" }))
    expect(result.current.status).toBe("error")
    expect(result.current.messages).toEqual([])
    result.current.retry()
    expect(mutate).toHaveBeenCalledTimes(1)
  })
})

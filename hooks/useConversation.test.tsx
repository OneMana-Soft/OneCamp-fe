import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, renderHook } from "@testing-library/react"
import { Provider } from "react-redux"
import type { ReactNode } from "react"
import type { PostsRes } from "@/types/post"
import type { ChatInfo } from "@/types/chat"
import type { ConversationRef } from "@/lib/conversation/types"

// A conversation's list, paged (chat A1 step 2b), with the app's store and
// reducers; the requests are stand-ins: each key answers what answers holds
// for it, the same object on every render, as SWR gives.
const asked: string[] = []
const answers = new Map<string, { data?: unknown; isError?: unknown }>()
const mutate = vi.fn()
const fetched = new Map<string, unknown>()
const fetchOf = (url: string) => {
  asked.push(url)
  const a = url ? answers.get(url) : undefined
  const key = `${url}|${answers.has(url)}`
  if (!fetched.has(key)) fetched.set(key, { data: a?.data, isError: a?.isError, isLoading: !!url && !a, mutate, lastRequestStartedAt: 0 })
  return fetched.get(key)
}
vi.mock("@/hooks/useFetch", () => ({ useFetch: fetchOf, useFetchOnlyOnce: fetchOf }))
let address = new URLSearchParams()
vi.mock("next/navigation", () => ({ useSearchParams: () => address }))
vi.mock("@/hooks/useMessageResync", () => ({ useMessageResync: () => {} }))

const { default: store } = await import("@/store/store")
const { useConversation } = await import("@/hooks/useConversation")
const { channelAdapter } = await import("@/lib/conversation/adapters")
const { triggerMessageCatchUp } = await import("@/store/slice/messageResyncSlice")

const person = { user_uuid: "u-maya", user_name: "Maya", user_profile_object_key: "" }
const post = (id: string, at: string) => ({ post_uuid: id, post_text: `<p>${id}</p>`, post_by: person, post_created_at: at, post_comment_count: 0 }) as PostsRes
const chat = (id: string, at: string) => ({ chat_uuid: id, chat_body_text: `<p>${id}</p>`, chat_from: person, chat_to: person, chat_created_at: at, chat_attachments: [], chat_comment_count: 0 }) as ChatInfo
const at = (minute: number) => `2026-10-14T09:${String(minute).padStart(2, "0")}:00Z`
const ids = (rows: unknown[]) => rows.map((r) => (r as PostsRes).post_uuid ?? (r as ChatInfo).chat_uuid)
const wrapper = ({ children }: { children: ReactNode }) => <Provider store={store}>{children}</Provider>

afterEach(() => {
  cleanup()
  asked.length = 0
  answers.clear()
  fetched.clear()
  mutate.mockClear()
  address = new URLSearchParams()
})

describe("useConversation", () => {
  it("seeds a channel's latest page into the store, oldest first, loading until it's there", () => {
    answers.set("/po/latestPosts/seed", { data: { data: { posts: [post("p2", at(1)), post("p1", at(0))], has_more: false } } })
    const { result } = renderHook(() => useConversation({ kind: "channel", id: "seed" }), { wrapper })
    expect(asked).toContain("/po/latestPosts/seed")
    expect(ids(store.getState().channel.channelPosts.seed)).toEqual(["p1", "p2"])
    expect(result.current.status).toBe("ready")
    expect(ids(result.current.rows)).toEqual(["p1", "p2"])
    expect(result.current.older.has).toBe(false)
  })

  it("reads a DM by the person beside you, as its store does", () => {
    answers.set("/dm/latestChat/u-jonas", { data: { data: { chats: [chat("m1", at(0))], has_more: true } } })
    const { result } = renderHook(() => useConversation({ kind: "dm", id: "u-jonas u-maya", other: "u-jonas" }), { wrapper })
    expect(ids(store.getState().chat.chatMessages["u-jonas"])).toEqual(["m1"])
    expect(ids(result.current.rows)).toEqual(["m1"])
    expect(result.current.older.has).toBe(true)
  })

  it("asks for a group's page only once its people have answered", () => {
    const first = renderHook(() => useConversation({ kind: "group", id: "g-wait" }), { wrapper })
    expect(asked).toContain("/groupChat/getDmParticipants/g-wait")
    expect(asked.some((u) => u.startsWith("/groupChat/latestChat"))).toBe(false)
    expect(first.result.current.status).toBe("loading")
    first.unmount()

    answers.set("/groupChat/getDmParticipants/g-wait", { data: { data: { dm_grouping_id: "g-wait" } } })
    answers.set("/groupChat/latestChat/g-wait", { data: { data: { chats: [chat("m1", at(0))], has_more: false } } })
    const { result } = renderHook(() => useConversation({ kind: "group", id: "g-wait" }), { wrapper })
    expect(asked).toContain("/groupChat/latestChat/g-wait")
    expect(ids(result.current.rows)).toEqual(["m1"])
  })

  it("says a conversation that couldn't be read failed, never that it's empty", () => {
    answers.set("/po/latestPosts/fail", { isError: new Error("503") })
    const { result } = renderHook(() => useConversation({ kind: "channel", id: "fail" }), { wrapper })
    expect(result.current.status).toBe("error")
    expect(result.current.rows).toEqual([])
    result.current.retry()
    expect(mutate).toHaveBeenCalledTimes(1)
  })

  // The server writes a link's page and a newer page oldest first, and the
  // newest and an older page newest first (lib/conversation/adapters).
  it("opens at a link's page in the order it was written, and asks for newer ones below it", () => {
    address = new URLSearchParams("postId=p1")
    answers.set("/po/newPostsIncludingCurrent/linked/p1", { data: { data: { posts: [post("p1", at(0)), post("p2", at(1))], has_more: true } } })
    const { result } = renderHook(() => useConversation({ kind: "channel", id: "linked" }), { wrapper })
    expect(asked.some((u) => u.startsWith("/po/latestPosts"))).toBe(false)
    expect(result.current.anchor).toBe("p1")
    expect(ids(result.current.rows)).toEqual(["p1", "p2"])
    expect(result.current.newer.has).toBe(true)

    const newer = channelAdapter.newerKey({ kind: "channel", id: "linked" }, { at: at(1), id: "p2" })
    answers.set(newer, { data: { data: { posts: [post("p3", at(2)), post("p4", at(3))], has_more: false } } })
    act(() => result.current.newer.ask())
    expect(asked).toContain(newer)
    expect(ids(result.current.rows)).toEqual(["p1", "p2", "p3", "p4"])
    expect(result.current.newer.has).toBe(false)
  })

  it("is loading while a link's page is on its way to a list not held, never empty", () => {
    address = new URLSearchParams("postId=p9")
    const { result } = renderHook(() => useConversation({ kind: "channel", id: "on-its-way" }), { wrapper })
    expect(asked).toContain("/po/newPostsIncludingCurrent/on-its-way/p9")
    expect(result.current.status).toBe("loading")
  })

  it("pages afresh when it moves to another conversation, never from the last one's place", () => {
    answers.set("/po/newPostsIncludingCurrent/first/p1", { data: { data: { posts: [post("p1", at(0)), post("p2", at(1))], has_more: true } } })
    const { result, rerender } = renderHook(({ of, link }: { of: ConversationRef; link?: string }) => useConversation(of, link), {
      wrapper,
      initialProps: { of: { kind: "channel", id: "first" }, link: "p1" },
    })
    expect(result.current.newer.has).toBe(true)
    act(() => result.current.older.ask())
    expect(asked).toContain(channelAdapter.olderKey({ kind: "channel", id: "first" }, { at: at(0), id: "p1" }))

    answers.set("/po/latestPosts/second", { data: { data: { posts: [post("q1", at(5))], has_more: false } } })
    rerender({ of: { kind: "channel", id: "second" } })
    expect(ids(result.current.rows)).toEqual(["q1"])
    expect(result.current.newer.has).toBe(false)
    // The first one's older page isn't asked for from the second's.
    expect(result.current.older.loading).toBe(false)
  })

  it("puts an older page before what it holds, oldest first, without what is already there", () => {
    store.dispatch({ type: "channel/updateChannelPosts", payload: { channelId: "back", posts: [post("p3", at(2)), post("p4", at(3))] } })
    answers.set("/po/latestPosts/back", { data: { data: { posts: [post("p4", at(3)), post("p3", at(2))], has_more: true } } })
    const { result } = renderHook(() => useConversation({ kind: "channel", id: "back" }), { wrapper })
    const older = channelAdapter.olderKey({ kind: "channel", id: "back" }, { at: at(2), id: "p3" })
    answers.set(older, { data: { data: { posts: [post("p3", at(2)), post("p2", at(1)), post("p1", at(0))], has_more: false } } })
    act(() => result.current.older.ask())
    expect(asked).toContain(older)
    expect(ids(result.current.rows)).toEqual(["p1", "p2", "p3", "p4"])
    expect(result.current.older.has).toBe(false)
  })
})

// A message sent while a conversation opens, after its first read and before
// the live subscription is answered, was in neither: it was lost until the next
// reload, on every cold open (FLUIDITY-LEAD-8's rtGap, 22 Oct 2026).
describe("a message sent while a conversation opens", () => {
  it("is read once the subscription is answered, after the newest message", () => {
    answers.set("/po/latestPosts/gap", { data: { data: { posts: [post("p1", at(0))], has_more: false } } })
    const { result } = renderHook(() => useConversation({ kind: "channel", id: "gap" }), { wrapper })
    const newer = channelAdapter.newerKey({ kind: "channel", id: "gap" }, { at: at(0), id: "p1" })
    expect(asked).not.toContain(newer)

    answers.set(newer, { data: { data: { posts: [post("p2", at(1))], has_more: false } } })
    act(() => void store.dispatch(triggerMessageCatchUp()))
    expect(asked).toContain(newer)
    expect(ids(result.current.rows)).toEqual(["p1", "p2"])
  })

  it("reads the latest page again when the conversation held nothing", () => {
    answers.set("/po/latestPosts/quiet", { data: { data: { posts: [], has_more: false } } })
    renderHook(() => useConversation({ kind: "channel", id: "quiet" }), { wrapper })
    act(() => void store.dispatch(triggerMessageCatchUp()))
    expect(mutate).toHaveBeenCalled()
  })
})

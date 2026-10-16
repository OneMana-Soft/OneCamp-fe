import { readFileSync } from "node:fs"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { ReactNode } from "react"
import { Provider } from "react-redux"
import { act, cleanup, renderHook } from "@testing-library/react"
import { configureStore } from "@reduxjs/toolkit"
import channelSlice, { createPost, updateChannelPosts } from "@/store/slice/channelSlice"
import chatSlice, { CreateUserChatList, updateChats } from "@/store/slice/chatSlice"
import groupChatSlice, { updateGroupChats } from "@/store/slice/groupChatSlice"
import { isTombstoned } from "@/lib/utils/deletionTombstone"
import { getGroupingId } from "@/lib/utils/getGroupingId"
import type { ChatInfo } from "@/types/chat"
import type { PostsRes } from "@/types/post"
import type { UserDMInterface } from "@/types/user"

// QA F-01 and F-02: a delete the server refused took the message away for
// good. The channel's reducer tombstoned it, so no later page brought it back,
// and the person believed it was gone for everyone when it wasn't.

const makeRequest = vi.fn()
vi.mock("@/hooks/usePost", () => ({ usePost: () => ({ makeRequest, isSubmitting: false }) }))
// The reader: a DM's sidebar row is keyed by both people.
vi.mock("@/hooks/useFetch", () => ({ useFetchOnlyOnce: () => ({ data: { data: { user_uuid: "me" } } }) }))

import { useDeleteMessage } from "./useDeleteMessage"
import { pinTestClock } from "@/lib/testing/testClock"

pinTestClock()

const post = (uuid: string, at: string): PostsRes =>
  ({ post_uuid: uuid, post_created_at: at, post_text: `<p>${uuid}</p>`, post_by: {} as never, post_comment_count: 0 }) as PostsRes
const chat = (uuid: string, at: string): ChatInfo =>
  ({ chat_uuid: uuid, chat_created_at: at, chat_body_text: `<p>${uuid}</p>`, chat_from: {} as never, chat_to: {} as never, chat_attachments: [], chat_comment_count: 0 }) as ChatInfo

const refused = () => Object.assign(new Error("Request failed with status code 500"), { response: { status: 500 } })

function setup() {
  const store = configureStore({
    reducer: {
      [channelSlice.name]: channelSlice.reducer,
      [chatSlice.name]: chatSlice.reducer,
      [groupChatSlice.name]: groupChatSlice.reducer,
    },
    middleware: (d) => d({ serializableCheck: false }),
  })
  const wrapper = ({ children }: { children: ReactNode }) => <Provider store={store}>{children}</Provider>
  const { result } = renderHook(() => useDeleteMessage(), { wrapper })
  return { store, remove: result.current }
}

beforeEach(() => {
  makeRequest.mockReset()
})
afterEach(cleanup)

describe("deleting a message", () => {
  it("puts a channel's post back where it was when the server refuses (F-01)", async () => {
    const { store, remove } = setup()
    store.dispatch(updateChannelPosts({ channelId: "ch", posts: [post("a", "2026-10-14T09:00:00Z"), post("b", "2026-10-14T09:01:00Z"), post("c", "2026-10-14T09:02:00Z")] }))
    let answer!: (e: unknown) => void
    makeRequest.mockReturnValue(new Promise((_, reject) => (answer = reject)))

    let done!: Promise<unknown>
    act(() => void (done = remove({ kind: "post", channelId: "ch", id: "b" })))
    // It leaves at once.
    expect(store.getState().channel.channelPosts.ch.map((p) => p.post_uuid)).toEqual(["a", "c"])

    await act(async () => {
      answer(refused())
      await done
    })
    expect(store.getState().channel.channelPosts.ch.map((p) => p.post_uuid)).toEqual(["a", "b", "c"])
    // Nothing keeps it out any more: a live event or a page carries it as usual.
    expect(isTombstoned(store.getState().channel.deletedPosts, "ch", "b")).toBe(false)
    expect(makeRequest).toHaveBeenCalledWith(expect.objectContaining({ payload: { post_id: "b" }, showErrorToast: true }))
  })

  it("keeps a post gone when the server takes the delete", async () => {
    const { store, remove } = setup()
    store.dispatch(updateChannelPosts({ channelId: "ch", posts: [post("a", "2026-10-14T09:00:00Z"), post("b", "2026-10-14T09:01:00Z")] }))
    makeRequest.mockResolvedValue({})
    await act(async () => {
      await remove({ kind: "post", channelId: "ch", id: "b" })
    })
    expect(store.getState().channel.channelPosts.ch.map((p) => p.post_uuid)).toEqual(["a"])
    // A late echo of its create can't bring it back.
    store.dispatch(createPost({ postId: "b", postText: "<p>b</p>", postCreatedAt: "2026-10-14T09:01:00Z", postBy: {} as never, channelId: "ch", attachments: [] }))
    expect(store.getState().channel.channelPosts.ch.map((p) => p.post_uuid)).toEqual(["a"])
  })

  it("never throws for a refused delete: the request said it", async () => {
    const { store, remove } = setup()
    store.dispatch(updateChannelPosts({ channelId: "ch", posts: [post("a", "2026-10-14T09:00:00Z")] }))
    makeRequest.mockRejectedValue(refused())
    let result: unknown
    await act(async () => {
      result = await remove({ kind: "post", channelId: "ch", id: "a" })
    })
    expect(result).toMatchObject({ ok: false })
  })

  it("puts a DM back, and its sidebar preview, when the server refuses (F-02)", async () => {
    const { store, remove } = setup()
    const me = "me"
    const them = "them-uuid"
    const row = getGroupingId(them, me)
    store.dispatch(updateChats({ chatId: them, chats: [chat("x", "2026-10-14T09:00:00Z"), chat("y", "2026-10-14T09:05:00Z")] }))
    store.dispatch(CreateUserChatList({ userDmList: [{ dm_grouping_id: row, dm_chats: [chat("y", "2026-10-14T09:05:00Z")] } as UserDMInterface] }))
    let answer!: (e: unknown) => void
    makeRequest.mockReturnValue(new Promise((_, reject) => (answer = reject)))

    let done!: Promise<unknown>
    act(() => void (done = remove({ kind: "dm", chatId: them, id: "y" })))
    expect(store.getState().chat.chatMessages[them].map((c) => c.chat_uuid)).toEqual(["x"])
    expect(store.getState().chat.latestChatList[0].dm_chats?.[0].chat_uuid).toBe("x")

    await act(async () => {
      answer(refused())
      await done
    })
    expect(store.getState().chat.chatMessages[them].map((c) => c.chat_uuid)).toEqual(["x", "y"])
    expect(store.getState().chat.latestChatList[0].dm_chats?.[0].chat_uuid).toBe("y")
    expect(isTombstoned(store.getState().chat.deletedChats, them, "y")).toBe(false)
  })

  it("leaves a newer preview alone when it puts a refused DM back", async () => {
    const { store, remove } = setup()
    const row = getGroupingId("them", "me")
    store.dispatch(updateChats({ chatId: "them", chats: [chat("x", "2026-10-14T09:00:00Z"), chat("y", "2026-10-14T09:05:00Z")] }))
    store.dispatch(CreateUserChatList({ userDmList: [{ dm_grouping_id: row, dm_chats: [chat("y", "2026-10-14T09:05:00Z")] } as UserDMInterface] }))
    let answer!: (e: unknown) => void
    makeRequest.mockReturnValue(new Promise((_, reject) => (answer = reject)))
    let done!: Promise<unknown>
    act(() => void (done = remove({ kind: "dm", chatId: "them", id: "y" })))
    // A newer message arrives while the delete is out.
    store.dispatch(CreateUserChatList({ userDmList: [{ dm_grouping_id: row, dm_chats: [chat("z", "2026-10-14T09:09:00Z")] } as UserDMInterface] }))
    await act(async () => {
      answer(refused())
      await done
    })
    expect(store.getState().chat.latestChatList[0].dm_chats?.[0].chat_uuid).toBe("z")
  })

  it("puts a group's message back, and the group's preview, when the server refuses (F-02)", async () => {
    const { store, remove } = setup()
    store.dispatch(updateGroupChats({ grpId: "g", chats: [chat("p", "2026-10-14T09:00:00Z"), chat("q", "2026-10-14T09:03:00Z")] }))
    store.dispatch(CreateUserChatList({ userDmList: [{ dm_grouping_id: "g", dm_chats: [chat("q", "2026-10-14T09:03:00Z")] } as UserDMInterface] }))
    makeRequest.mockRejectedValue(refused())
    await act(async () => {
      await remove({ kind: "group", grpId: "g", id: "q" })
    })
    expect(store.getState().groupChat.chatMessages.g.map((c) => c.chat_uuid)).toEqual(["p", "q"])
    expect(store.getState().chat.latestChatList[0].dm_chats?.[0].chat_uuid).toBe("q")
    expect(isTombstoned(store.getState().groupChat.deletedChats, "g", "q")).toBe(false)
    expect(makeRequest).toHaveBeenCalledWith(expect.objectContaining({ payload: { chat_id: "q" } }))
  })
})

describe("every message list and phone thread page", () => {
  const read = (p: string) => readFileSync(join(__dirname, "..", p), "utf8")
  it.each([
    "components/channel/channelMessages.tsx",
    "components/chat/chatMessages.tsx",
    "components/groupChat/groupChatMessages.tsx",
    "components/mobilePost/mobilePost.tsx",
    "components/mobileChatMessage/mobileChat.tsx",
    "components/mobileChatMessage/mobileGroupChat.tsx",
  ])("%s deletes a message through useDeleteMessage", (file) => {
    const src = read(file)
    expect(src).toMatch(/useDeleteMessage\(\)/)
    // A delete of its own lost the message for good when refused (F-01, F-02).
    expect(src).not.toMatch(/PostEndpointUrl\.(DeleteChannelPost|DeleteChatMessage)\b/)
  })
})

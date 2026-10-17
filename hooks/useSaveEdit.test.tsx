import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, renderHook } from "@testing-library/react"
import { Provider } from "react-redux"
import type { ReactNode } from "react"
import { pinTestClock } from "@/lib/testing/testClock"

pinTestClock()

// One saver for every correction made in place, in a list or a thread
// (F-06, F-07): the words show at once, and a save that fails puts back the
// words and edit time they had and says so, for the box to open again on
// what was typed. A thread's edits waited for the server and lost what was
// typed; its message's edit sent the words as the id.

const makeRequest = vi.fn()
vi.mock("@/hooks/usePost", () => ({ usePost: () => ({ makeRequest }) }))
vi.mock("@/hooks/useFetch", () => ({ useFetchOnlyOnce: () => ({ data: { data: { user_uuid: "me" } } }) }))

const { default: store } = await import("@/store/store")
const { addChannelComments } = await import("@/store/slice/channelCommentSlice")
const { updateChats } = await import("@/store/slice/chatSlice")
const { useSaveEdit } = await import("@/hooks/useSaveEdit")
const { PostEndpointUrl } = await import("@/services/endPoints")

const wrapper = ({ children }: { children: ReactNode }) => <Provider store={store}>{children}</Provider>
const reply = () => store.getState().channelComment.postComments["p1"].find((c) => c.comment_uuid === "r1")!
const dm = () => store.getState().chat.chatMessages["u2"].find((c) => c.chat_uuid === "m1")!

beforeEach(() => {
  store.dispatch(addChannelComments({ postId: "p1", comments: [{ comment_uuid: "r1", comment_text: "<p>yes</p>", comment_created_at: "2026-10-14T09:00:00Z" }] as never }))
  store.dispatch(updateChats({ chatId: "u2", chats: [{ chat_uuid: "m1", chat_body_text: "<p>hi</p>", chat_created_at: "2026-10-14T09:00:00Z", chat_updated_at: "2026-10-14T09:05:00Z" }] as never }))
})
afterEach(() => makeRequest.mockReset())

describe("saving a correction", () => {
  it("shows a reply's new words at once and says it saved", async () => {
    makeRequest.mockResolvedValue({ msg: "ok" })
    const { result } = renderHook(() => useSaveEdit(), { wrapper })
    let saved: boolean | undefined
    await act(async () => {
      saved = await result.current({ kind: "postReply", postId: "p1", id: "r1" }, "<p>yes, ship it</p><p></p>")
    })
    expect(saved).toBe(true)
    expect(reply()).toMatchObject({ comment_text: "<p>yes, ship it</p>" })
    expect(reply().comment_updated_at).toBeTruthy()
    expect(makeRequest).toHaveBeenCalledWith(expect.objectContaining({
      apiEndpoint: PostEndpointUrl.UpdatePostComment,
      payload: { post_id: "p1", comment_id: "r1", comment_text_html: "<p>yes, ship it</p>" },
    }))
  })

  it("puts a reply back as it was, never edited, when the save fails, and says so", async () => {
    makeRequest.mockResolvedValue(undefined)
    const { result } = renderHook(() => useSaveEdit(), { wrapper })
    let saved: boolean | undefined
    await act(async () => {
      saved = await result.current({ kind: "postReply", postId: "p1", id: "r1" }, "<p>no</p>")
    })
    expect(saved).toBe(false)
    expect(reply().comment_text).toBe("<p>yes</p>")
    expect(reply().comment_updated_at).toBeUndefined()
  })

  it("puts a DM's message back with the edit time it had", async () => {
    makeRequest.mockResolvedValue(undefined)
    const { result } = renderHook(() => useSaveEdit(), { wrapper })
    await act(async () => {
      await result.current({ kind: "dm", chatId: "u2", id: "m1" }, "<p>hello</p>")
    })
    expect(dm()).toMatchObject({ chat_body_text: "<p>hi</p>", chat_updated_at: "2026-10-14T09:05:00Z" })
    expect(makeRequest).toHaveBeenCalledWith(expect.objectContaining({ payload: { chat_id: "m1", text_html: "<p>hello</p>" } }))
  })

  it("sends a thread's message by its id, loaded in the list or not", async () => {
    makeRequest.mockResolvedValue({ msg: "ok" })
    const { result } = renderHook(() => useSaveEdit(), { wrapper })
    await act(async () => {
      await result.current({ kind: "post", channelId: "c1", id: "p9" }, "<p>new words</p>")
    })
    expect(makeRequest).toHaveBeenCalledWith(expect.objectContaining({
      apiEndpoint: PostEndpointUrl.UpdateChannelPost,
      payload: { post_id: "p9", post_text_html: "<p>new words</p>" },
    }))
  })

  // The server stamps every update it's sent as an edit and broadcasts it, so
  // saving words that didn't change marked the message "(edited)" for everyone:
  // live, as the broadcast came back, and after a reload.
  it("sends nothing for a correction that changes nothing", async () => {
    makeRequest.mockResolvedValue({ msg: "ok" })
    const { result } = renderHook(() => useSaveEdit(), { wrapper })
    let saved: boolean | undefined
    await act(async () => {
      saved = await result.current({ kind: "dm", chatId: "u2", id: "m1" }, "<p>hi</p><p></p>")
    })
    expect(saved).toBe(true)
    expect(makeRequest).not.toHaveBeenCalled()
    expect(dm()).toMatchObject({ chat_body_text: "<p>hi</p>", chat_updated_at: "2026-10-14T09:05:00Z" })
  })

  it("sends nothing for a correction that leaves nothing", async () => {
    const { result } = renderHook(() => useSaveEdit(), { wrapper })
    let saved: boolean | undefined
    await act(async () => {
      saved = await result.current({ kind: "postReply", postId: "p1", id: "r1" }, "<p></p>")
    })
    expect(saved).toBe(true)
    expect(makeRequest).not.toHaveBeenCalled()
  })
})

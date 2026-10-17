import { describe, expect, it } from "vitest"
import { configureStore } from "@reduxjs/toolkit"
import channelSlice, { updateChannelPosts, updatePostByPostId } from "@/store/slice/channelSlice"
import { pinTestClock } from "@/lib/testing/testClock"

pinTestClock()

// F-07: a failed edit put the old words back but left "(edited)" on a post
// it never changed: any change of words stamped the edit time, the revert
// too. The edit's time is given by whoever made it, the revert's by the save.
describe("a channel post's edit, taken back", () => {
  const store = () => {
    const s = configureStore({ reducer: { channel: channelSlice.reducer } })
    s.dispatch(updateChannelPosts({ channelId: "c1", posts: [
      { post_uuid: "never", post_text: "<p>a</p>", post_created_at: "2026-10-14T09:00:00Z" },
      { post_uuid: "once", post_text: "<p>b</p>", post_created_at: "2026-10-14T09:00:00Z", post_updated_at: "2026-10-14T09:10:00Z" },
    ] as never }))
    return s
  }
  const post = (s: ReturnType<typeof store>, id: string) => s.getState().channel.channelPosts["c1"].find((p) => p.post_uuid === id)!

  it("says it was edited as the edit shows, at the time the edit gives", () => {
    const s = store()
    s.dispatch(updatePostByPostId({ channelId: "c1", postId: "never", htmlText: "<p>a2</p>", updatedAt: "2026-10-14T09:20:00Z" }))
    expect(post(s, "never").post_updated_at).toBe("2026-10-14T09:20:00Z")
  })

  it("puts back that a post was never edited, or when it last was", () => {
    const s = store()
    s.dispatch(updatePostByPostId({ channelId: "c1", postId: "never", htmlText: "<p>a2</p>", updatedAt: "2026-10-14T09:20:00Z" }))
    s.dispatch(updatePostByPostId({ channelId: "c1", postId: "never", htmlText: "<p>a</p>", updatedAt: null }))
    expect(post(s, "never").post_updated_at).toBeUndefined()
    s.dispatch(updatePostByPostId({ channelId: "c1", postId: "once", htmlText: "<p>b2</p>", updatedAt: "2026-10-14T09:20:00Z" }))
    s.dispatch(updatePostByPostId({ channelId: "c1", postId: "once", htmlText: "<p>b</p>", updatedAt: "2026-10-14T09:10:00Z" }))
    expect(post(s, "once")).toMatchObject({ post_text: "<p>b</p>", post_updated_at: "2026-10-14T09:10:00Z" })
  })
})

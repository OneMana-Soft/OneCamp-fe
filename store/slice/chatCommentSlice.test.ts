import { describe, expect, it } from "vitest"
import { configureStore } from "@reduxjs/toolkit"
import { chatCommentSlice, removeChatComment, updateChatCommentByCommentId } from "@/store/slice/chatCommentSlice"

// A DM thread the store doesn't hold (opened from a link, never loaded):
// removing a reply by its place in the list, or editing one, threw, where the
// channel's reducers check first.
describe("a DM thread the store doesn't hold", () => {
  it("takes a removal or an edit by place without throwing, and holds nothing new", () => {
    const store = configureStore({ reducer: { chatComments: chatCommentSlice.reducer } })
    expect(() => store.dispatch(removeChatComment({ chatId: "never-loaded", commentIndex: 0 }))).not.toThrow()
    expect(() => store.dispatch(updateChatCommentByCommentId({ chatId: "never-loaded", commentId: "c1", htmlText: "<p>x</p>" }))).not.toThrow()
    expect(store.getState().chatComments.chatComments["never-loaded"]).toBeUndefined()
  })
})

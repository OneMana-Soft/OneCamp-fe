import { describe, expect, it } from "vitest"
import channelCommentSlice, {
  addChannelCommentMsgPreviewFiles,
  addChannelCommentMsgUploadedFiles,
  clearChannelCommentMsgInputState,
  createOrUpdateChannelCommentMsg,
  deleteChannelCommentMsgPreviewFiles,
  setChannelCommentAlsoSend,
  updateChannelCommentMsgPreviewFilesUUID,
} from "@/store/slice/channelCommentSlice"
import {
  addChatCommentPreviewFiles,
  addChatCommentUploadedFiles,
  chatCommentSlice,
  clearChatCommentInputState,
  createOrUpdateChatCommentBody,
  deleteChatCommentPreviewFiles,
} from "@/store/slice/chatCommentSlice"

// A thread reply's draft, kept by its thread (MC-BUG-1): the rules for its files
// that the thread panels' own tests (components/rightPanel/threadDrafts.test.tsx)
// don't reach. A file still uploading when the reply is sent stays for the next
// one; a file whose preview was removed, or sent, while it uploaded never joins
// the draft unseen, where the next reply would have carried it.

const preview = (key: string) => ({ key, fileName: `${key}.pdf`, progress: 40, cancelSource: { cancel: () => {} }, attachmentType: "file" }) as never
const uploaded = (key: string) => ({ attachment_obj_key: key, attachment_file_name: `${key}.pdf`, attachment_uuid: `obj-${key}` }) as never

describe("a channel thread's draft", () => {
  const run = (actions: { type: string }[]) => actions.reduce(channelCommentSlice.reducer, channelCommentSlice.getInitialState())

  it("is one per thread", () => {
    const s = run([
      createOrUpdateChannelCommentMsg({ threadId: "A", body: "<p>Ship it Friday</p>" }),
      createOrUpdateChannelCommentMsg({ threadId: "B", body: "<p>Looks good</p>" }),
      setChannelCommentAlsoSend({ threadId: "A", on: true }),
    ])
    expect(s.commentInputState.A.commentMsgBody).toBe("<p>Ship it Friday</p>")
    expect(s.commentInputState.B.commentMsgBody).toBe("<p>Looks good</p>")
    expect(s.commentInputState.A.alsoSendToChannel).toBe(true)
    expect(s.commentInputState.B.alsoSendToChannel).toBeUndefined()
  })

  it("loses what a send took, and keeps a file still uploading", () => {
    const s = run([
      createOrUpdateChannelCommentMsg({ threadId: "A", body: "<p>Ship it</p>" }),
      setChannelCommentAlsoSend({ threadId: "A", on: true }),
      addChannelCommentMsgPreviewFiles({ threadId: "A", filesUploaded: preview("done") }),
      updateChannelCommentMsgPreviewFilesUUID({ threadId: "A", key: "done", uuid: "obj-done" }),
      addChannelCommentMsgUploadedFiles({ threadId: "A", filesUploaded: uploaded("done") }),
      addChannelCommentMsgPreviewFiles({ threadId: "A", filesUploaded: preview("big") }),
      createOrUpdateChannelCommentMsg({ threadId: "B", body: "<p>Looks good</p>" }),
      clearChannelCommentMsgInputState({ threadId: "A", sent: ["done"] }),
    ])
    expect(s.commentInputState.A.commentMsgBody).toBe("")
    expect(s.commentInputState.A.alsoSendToChannel).toBeUndefined()
    expect(s.commentInputState.A.filesUploaded).toEqual([])
    expect(s.commentInputState.A.filesPreview.map((p) => p.key)).toEqual(["big"])
    expect(s.commentInputState.B.commentMsgBody).toBe("<p>Looks good</p>")
    // The big file lands, and goes with the next reply, in view.
    const next = channelCommentSlice.reducer(s, addChannelCommentMsgUploadedFiles({ threadId: "A", filesUploaded: uploaded("big") }))
    expect(next.commentInputState.A.filesUploaded.map((f) => f.attachment_obj_key)).toEqual(["big"])
  })

  it("never takes a file whose preview was removed while it uploaded", () => {
    const s = run([
      addChannelCommentMsgPreviewFiles({ threadId: "A", filesUploaded: preview("oops") }),
      deleteChannelCommentMsgPreviewFiles({ threadId: "A", key: "oops" }),
      addChannelCommentMsgUploadedFiles({ threadId: "A", filesUploaded: uploaded("oops") }),
      addChannelCommentMsgUploadedFiles({ threadId: "B", filesUploaded: uploaded("stray") }),
    ])
    expect(s.commentInputState.A.filesUploaded).toEqual([])
    expect(s.commentInputState.B).toBeUndefined()
  })
})

describe("a DM or group thread's draft", () => {
  const run = (actions: { type: string }[]) => actions.reduce(chatCommentSlice.reducer, chatCommentSlice.getInitialState())

  it("is one per thread, and a send loses only what it took", () => {
    const s = run([
      createOrUpdateChatCommentBody({ threadId: "A", body: "<p>Ship it Friday</p>" }),
      createOrUpdateChatCommentBody({ threadId: "B", body: "<p>Looks good</p>" }),
      addChatCommentPreviewFiles({ threadId: "A", fileUploaded: preview("big") }),
      clearChatCommentInputState({ threadId: "A", sent: [] }),
    ])
    expect(s.chatCommentInputState.A.commentBody).toBe("")
    expect(s.chatCommentInputState.A.filesPreview.map((p) => p.key)).toEqual(["big"])
    expect(s.chatCommentInputState.B.commentBody).toBe("<p>Looks good</p>")
  })

  it("never takes a file whose preview was removed while it uploaded", () => {
    const s = run([
      addChatCommentPreviewFiles({ threadId: "A", fileUploaded: preview("oops") }),
      deleteChatCommentPreviewFiles({ threadId: "A", key: "oops" }),
      addChatCommentUploadedFiles({ threadId: "A", filesUploaded: uploaded("oops") }),
    ])
    expect(s.chatCommentInputState.A.filesUploaded).toEqual([])
  })
})

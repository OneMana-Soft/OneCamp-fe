import { afterEach, describe, expect, it, vi } from "vitest"
import { renderHook } from "@testing-library/react"
import { CanceledError } from "axios"
import type { Reducer } from "@reduxjs/toolkit"

// What each upload told the server it was for, what it put in its slice, and
// what it said.
const sent: Record<string, unknown>[] = []
const dispatched: { type: string; payload: Record<string, unknown> }[] = []
const toasts: { title?: string; description?: string }[] = []
let answer: () => Promise<unknown> = async () => ({ data: { object_uuid: "file-1" } })
vi.mock("@/lib/axiosInstance", () => ({
  OWN_ERRORS: { suppressErrorToast: true },
  default: {
    post: vi.fn(async (_url: string, form: FormData, config?: { onUploadProgress?: (e: { loaded: number; total?: number }) => void }) => {
      sent.push(JSON.parse(String(form.get("jsonData"))))
      // Half of it has gone up.
      config?.onUploadProgress?.({ loaded: 4, total: 8 })
      return answer()
    }),
  },
}))

// A group made here and not yet on the server ("new-group"), and one that is ("old-group").
const state = {
  groupChat: {
    locallyCreatedGrpInfo: {
      "new-group": {
        grpId: "new-group",
        haveSentFirstChat: false,
        participants: [{ user_uuid: "maya", uid: "0x1" }, { user_uuid: "sam", uid: "0x2" }, { user_uuid: "me", uid: "0x3" }],
      },
      "old-group": {
        grpId: "old-group",
        haveSentFirstChat: true,
        participants: [{ user_uuid: "maya", uid: "0x1" }, { user_uuid: "me", uid: "0x3" }, { user_uuid: "ali", uid: "0x4" }],
      },
    },
  },
}
vi.mock("react-redux", () => ({
  useDispatch: () => (a: (typeof dispatched)[number]) => dispatched.push(a),
  useStore: () => ({ getState: () => state }),
}))
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: (t: (typeof toasts)[number]) => toasts.push(t) }) }))
vi.mock("@/hooks/useClientConfig", () => ({ useClientConfig: () => ({ upload_limit_bytes: 1 << 30, upload_limit_mb: 1024 }) }))

const { useUploadFile } = await import("@/hooks/useUploadFile")
const project = await import("@/store/slice/projectAttachmentSlice")
const createTask = await import("@/store/slice/createTaskDailogSlice")
const task = await import("@/store/slice/taskInfoSlice")
const taskComment = await import("@/store/slice/createTaskCommentSlice")
const channel = await import("@/store/slice/channelSlice")
const channelComment = await import("@/store/slice/channelCommentSlice")
const groupChat = await import("@/store/slice/groupChatSlice")
const chatComment = await import("@/store/slice/chatCommentSlice")
const chat = await import("@/store/slice/chatSlice")

function files(): FileList {
  return [new File(["the plan"], "plan.txt", { type: "text/plain" })] as unknown as FileList
}

afterEach(() => {
  sent.length = 0
  dispatched.length = 0
  toasts.length = 0
  answer = async () => ({ data: { object_uuid: "file-1" } })
})

// A group is made on the server by its first message, and its id is made from its people before
// then. The server lets a file into a group only for someone in it, and can't ask a group it
// doesn't have yet: a file added before the first message went names the group's people, by
// their account ids, which make the group's id.
describe("a file for a group", () => {
  it("names the people of a group not on the server yet", async () => {
    const { result } = renderHook(() => useUploadFile())
    await result.current.makeRequestToUploadToGroupChat(files(), "new-group")
    expect(sent).toEqual([{ src_key: "grpChat", src_value: "new-group", participants: ["maya", "sam", "me"] }])
  })

  it("names nobody for a group the server has", async () => {
    const { result } = renderHook(() => useUploadFile())
    await result.current.makeRequestToUploadToGroupChat(files(), "old-group")
    await result.current.makeRequestToUploadToGroupChat(files(), "someone-elses-group")
    expect(sent).toEqual([
      { src_key: "grpChat", src_value: "old-group" },
      { src_key: "grpChat", src_value: "someone-elses-group" },
    ])
  })
})

// Every upload is one request to /file/upload (lib/upload), saying what the
// file is for, and one loop for every kind of card (hooks/useUploadFile's
// table): eleven copies of the loop each named their target and their slice
// by hand.
describe("each kind of upload", () => {
  type Hook = ReturnType<typeof useUploadFile>
  // What a kind is called with, where its file goes, the key its cards are kept under, and the slice that keeps them.
  const KINDS: [string, (h: Hook) => Promise<unknown>, Record<string, unknown>, Record<string, string>, Reducer][] = [
    ["a project's file", (h) => h.makeRequestToUploadToProject(files(), "p1"), { src_key: "project", src_value: "p1" }, { projectUUID: "p1" }, project.projectAttachmentSlice.reducer],
    ["a new task's", (h) => h.makeRequestToUploadToCreateTask(files(), "p1"), { src_key: "project", src_value: "p1" }, { projectUUID: "p1" }, createTask.createTaskDialogSlice.reducer],
    ["a task's", (h) => h.makeRequestToUploadToTask(files(), "t1", "p1"), { src_key: "project", src_value: "p1" }, { taskUUID: "t1" }, task.taskInfoSlice.reducer],
    ["a task comment's", (h) => h.makeRequestToUploadToTaskComment(files(), "p1", "t1"), { src_key: "project", src_value: "p1" }, { taskUUID: "t1" }, taskComment.createTaskCommentSlice.reducer],
    ["a channel message's", (h) => h.makeRequestToUploadToChannel(files(), "c1"), { src_key: "channel", src_value: "c1" }, { channelId: "c1" }, channel.default.reducer],
    ["a channel reply's", (h) => h.makeRequestToUploadToChannelComment(files(), "c1", "post1"), { src_key: "channel", src_value: "c1" }, { threadId: "post1" }, channelComment.default.reducer],
    ["a group message's", (h) => h.makeRequestToUploadToGroupChat(files(), "old-group"), { src_key: "grpChat", src_value: "old-group" }, { grpId: "old-group" }, groupChat.default.reducer],
    ["a group reply's", (h) => h.makeRequestToUploadToGroupChatComment(files(), "old-group", "chat1"), { src_key: "grpChat", src_value: "old-group" }, { threadId: "chat1" }, chatComment.chatCommentSlice.reducer],
    ["a DM's", (h) => h.makeRequestToUploadToChat(files(), "maya", "dm1"), { src_key: "chat", src_value: "dm1" }, { chatUUID: "maya" }, chat.default.reducer],
    ["a DM reply's", (h) => h.makeRequestToUploadToChatComment(files(), "chat2", "dm1"), { src_key: "chat", src_value: "dm1" }, { threadId: "chat2" }, chatComment.chatCommentSlice.reducer],
  ]

  it.each(KINDS)("%s goes where it is for, and its own slice keeps its card and its file", async (_name, call, target, under, reducer) => {
    const { result } = renderHook(() => useUploadFile())
    await call(result.current)
    expect(sent).toEqual([target])
    // The card, its progress, its file's id and the file kept for what is sent, each under the kind's key...
    expect(dispatched).toHaveLength(4)
    for (const a of dispatched) expect(a.payload).toMatchObject(under)
    // ...and each taken by the kind's own slice, which reads a new card by its own name for it.
    const kept = JSON.stringify(dispatched.reduce((s, a) => reducer(s, a), reducer(undefined, { type: "@@init" })))
    expect(kept).toContain('"fileName":"plan.txt"')
    expect(kept).toContain('"progress":50')
    expect(kept).toContain('"uuid":"file-1"')
    expect(kept).toContain('"attachment_uuid":"file-1"')
  })

  it("and a doc's picture, and the public place for an app's icon", async () => {
    const { result } = renderHook(() => useUploadFile())
    await result.current.uploadImageToDoc(new File(["x"], "cover.png", { type: "image/png" }), "d1")
    const answered = await result.current.makeRequestToUploadToPublic(files())
    expect(sent).toEqual([{ src_key: "doc", src_value: "d1" }, { src_key: "public" }])
    expect(answered).toEqual([{ object_uuid: "file-1" }])
  })
})

describe("a file that doesn't go up", () => {
  it("is named in a toast with the server's reason, and its card goes", async () => {
    answer = () => Promise.reject({ response: { status: 400, data: { msg: "That kind of file isn't allowed here." } } })
    const { result } = renderHook(() => useUploadFile())
    await result.current.makeRequestToUploadToChannel(files(), "c1")
    expect(dispatched.filter((d) => d.type === channel.deleteChannelPreviewFiles.type)).toHaveLength(1)
    expect(toasts).toEqual([{ title: "Couldn't upload plan.txt", description: "That kind of file isn't allowed here.", variant: "destructive" }])
  })

  it("keeps its card on a project's files, which says so and offers Retry", async () => {
    answer = () => Promise.reject({ response: { status: 400, data: { msg: "That kind of file isn't allowed here." } } })
    const { result } = renderHook(() => useUploadFile())
    await result.current.makeRequestToUploadToProject(files(), "p1")
    expect(dispatched.filter((d) => d.type === project.markProjectAttachmentPreviewFailed.type)).toHaveLength(1)
    expect(dispatched.filter((d) => d.type === project.deleteProjectAttachmentPreviewFiles.type)).toHaveLength(0)
    expect(toasts).toHaveLength(1)
  })

  // Cancelling a file's upload (its card's ×) raised "Couldn't upload" too,
  // everywhere but a project's files.
  it("goes without a word when its upload was cancelled", async () => {
    answer = () => Promise.reject(new CanceledError("canceled"))
    const { result } = renderHook(() => useUploadFile())
    await result.current.makeRequestToUploadToChannel(files(), "c1")
    await result.current.makeRequestToUploadToProject(files(), "p1")
    expect(dispatched.filter((d) => d.type === channel.deleteChannelPreviewFiles.type)).toHaveLength(1)
    expect(dispatched.filter((d) => d.type === project.deleteProjectAttachmentPreviewFiles.type)).toHaveLength(1)
    expect(toasts).toEqual([])
  })
})

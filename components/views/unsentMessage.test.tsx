import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { Provider } from "react-redux"

// Sending, in a channel, a DM and a group chat. The message is in the
// conversation the moment Send is pressed, marked as sending; the server's
// answer confirms it in place, or it is marked not sent with Try again, Edit
// (back into the message box, reply and all) and Delete beside it. It used to
// appear only once the server answered (300 to 800 ms on the demo), and a
// failed one vanished from the conversation into the message box. The views
// run as the app runs them, with the store and its reducers; the request, the
// composer and what the views read are stand-ins.

const send = vi.fn()
vi.mock("@/lib/axiosInstance", () => ({ default: { post: (...args: unknown[]) => send(...args) }, OWN_ERRORS: { suppressErrorToast: true } }))
const toast = vi.fn()
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast }) }))
vi.mock("@/hooks/useScheduledMessages", () => ({ useScheduleMessage: () => vi.fn() }))
vi.mock("@/context/MediaQueryContext", () => ({ useMedia: () => ({ isMobile: false, isDesktop: true }) }))
vi.mock("@/hooks/useFetch", () => {
  // The same answer on every render, as SWR gives.
  const me = { data: { data: { user_uuid: "me", user_name: "sam" } } }
  const maya = { data: { data: { user_uuid: "maya", user_name: "maya" } } }
  const latest = { data: undefined, mutate: () => {} }
  return {
    useFetch: () => latest,
    useFetchOnlyOnce: (url: string) => (url === "/user/profile" ? me : maya),
  }
})
vi.mock("@/services/channelService", () => ({ markChannelSeen: vi.fn() }))
vi.mock("@/services/unreadCache", () => ({ clearChatUnread: vi.fn() }))

// The composer: Send, as pressing it does, with what the store holds. And the
// status line a failed message shows, with its actions.
import { SendStatus } from "@/components/message/sendStatus"
type ComposerProps = { handleSend: () => void }
let shown: { state?: "sending" | "failed"; localId?: string } = {}
const Composer = ({ handleSend }: ComposerProps) => (
  <>
    <button onClick={() => handleSend()}>Send</button>
    <SendStatus state={shown.state} localId={shown.localId} />
  </>
)
vi.mock("@/components/channel/chanelIdDesktop", () => ({ ChannelIdDesktop: (p: ComposerProps) => <Composer {...p} /> }))
vi.mock("@/components/channel/channelIdMobile", () => ({ ChannelIdMobile: (p: ComposerProps) => <Composer {...p} /> }))
vi.mock("@/components/chat/chatIdDesktop", () => ({ ChatIdDesktop: (p: ComposerProps) => <Composer {...p} /> }))
vi.mock("@/components/chat/chatIdMobile", () => ({ ChatIdMobile: (p: ComposerProps) => <Composer {...p} /> }))
vi.mock("@/components/groupChat/chatGrpIdDesktop", () => ({ ChatGrpIdDesktop: (p: ComposerProps) => <Composer {...p} /> }))
vi.mock("@/components/groupChat/grpChatIdMobile", () => ({ GrpChatIdMobile: (p: ComposerProps) => <Composer {...p} /> }))

import store from "@/store/store"
import { addChannelUploadedFiles, setChannelReplyTarget, updateChannelInputText } from "@/store/slice/channelSlice"
import { createOrUpdateChatBody, setChatReplyTarget } from "@/store/slice/chatSlice"
import { createOrUpdateGroupChatBody, setGroupChatReplyTarget } from "@/store/slice/groupChatSlice"
import { ChannelView } from "./ChannelView"
import { ChatView } from "./ChatView"
import { GroupChatView } from "./GroupChatView"
import { NOT_SENT_TOAST } from "@/lib/chat/unsentMessage"

const MESSAGE = "<p>Ship it on <strong>Friday</strong></p>"

interface Sent {
  text: string
  state?: "sending" | "failed"
  localId?: string
  id: string
  replyTo?: string
}

interface Surface {
  name: string
  open: () => void
  type: (html: string) => void
  draft: () => { html?: string; replyToUuid?: string; restoredUnsent?: number } | undefined
  /** The newest message in the conversation. */
  last: () => Sent | undefined
  count: () => number
}

const surfaces: Surface[] = [
  {
    name: "a channel",
    open: () => render(<Provider store={store}><ChannelView channelId="ch1" /></Provider>),
    type: (html) => {
      store.dispatch(updateChannelInputText({ channelId: "ch1", inputTextHTML: html }))
      store.dispatch(setChannelReplyTarget({ channelId: "ch1", uuid: "p1", authorName: "Maya", text: "When?" }))
    },
    draft: () => {
      const s = store.getState().channel.channelInputState.ch1
      return s && { html: s.inputTextHTML, replyToUuid: s.replyToUuid, restoredUnsent: s.restoredUnsent }
    },
    last: () => {
      const p = store.getState().channel.channelPosts.ch1?.at(-1)
      return p && { text: p.post_text, state: p.post_send_state, localId: p.post_local_id, id: p.post_uuid, replyTo: p.post_reply_to?.post_uuid }
    },
    count: () => store.getState().channel.channelPosts.ch1?.length ?? 0,
  },
  {
    name: "a DM",
    open: () => render(<Provider store={store}><ChatView chatId="maya" /></Provider>),
    type: (html) => {
      store.dispatch(createOrUpdateChatBody({ chatUUID: "maya", body: html }))
      store.dispatch(setChatReplyTarget({ chatUUID: "maya", uuid: "p1", authorName: "Maya", text: "When?" }))
    },
    draft: () => {
      const s = store.getState().chat.chatInputState.maya
      return s && { html: s.chatBody, replyToUuid: s.replyToUuid, restoredUnsent: s.restoredUnsent }
    },
    last: () => {
      const c = store.getState().chat.chatMessages.maya?.at(-1)
      return c && { text: c.chat_body_text, state: c.chat_send_state, localId: c.chat_local_id, id: c.chat_uuid, replyTo: c.chat_reply_to?.chat_uuid }
    },
    count: () => store.getState().chat.chatMessages.maya?.length ?? 0,
  },
  {
    name: "a group chat",
    open: () => render(<Provider store={store}><GroupChatView grpId="g1" /></Provider>),
    type: (html) => {
      store.dispatch(createOrUpdateGroupChatBody({ grpID: "g1", body: html }))
      store.dispatch(setGroupChatReplyTarget({ grpId: "g1", uuid: "p1", authorName: "Maya", text: "When?" }))
    },
    draft: () => {
      const s = store.getState().groupChat.chatInputState.g1
      return s && { html: s.chatBody, replyToUuid: s.replyToUuid, restoredUnsent: s.restoredUnsent }
    },
    last: () => {
      const c = store.getState().groupChat.chatMessages.g1?.at(-1)
      return c && { text: c.chat_body_text, state: c.chat_send_state, localId: c.chat_local_id, id: c.chat_uuid, replyTo: c.chat_reply_to?.chat_uuid }
    },
    count: () => store.getState().groupChat.chatMessages.g1?.length ?? 0,
  },
]

// A request the test settles.
function pending() {
  let settle!: { resolve: (v: unknown) => void; reject: (e: unknown) => void }
  const promise = new Promise((resolve, reject) => (settle = { resolve, reject }))
  send.mockReturnValueOnce(promise)
  return settle
}
const answer = (uuid: string) => ({ data: { data: { uuid, post_created_at: "2026-10-10T09:00:01.000Z", chat_created_at: "2026-10-10T09:00:01.000Z" } } })

beforeEach(() => {
  send.mockReset()
  toast.mockReset()
  shown = {}
})
afterEach(cleanup)

describe.each(surfaces)("sending in $name", (surface) => {
  it("shows the message at once, marked as sending, and empties the composer", () => {
    surface.type(MESSAGE)
    surface.open()
    pending()
    fireEvent.click(screen.getByRole("button", { name: "Send" }))
    expect(surface.last()).toMatchObject({ text: MESSAGE, state: "sending", replyTo: "p1" })
    expect(surface.draft()?.html).toBe("")
    expect(surface.draft()?.replyToUuid).toBeUndefined()
  })

  it("gives it the server's id when the server has it, in the same place", async () => {
    surface.type("<p>Confirmed</p>")
    surface.open()
    const request = pending()
    fireEvent.click(screen.getByRole("button", { name: "Send" }))
    const before = surface.count()
    const localId = surface.last()!.localId
    await act(async () => request.resolve(answer("m-confirmed")))
    expect(surface.count()).toBe(before)
    expect(surface.last()).toMatchObject({ text: "<p>Confirmed</p>", state: undefined, id: "m-confirmed", localId })
    expect(toast).not.toHaveBeenCalled()
  })

  it("keeps a message that did not go in the conversation, marked not sent, and leaves the composer alone", async () => {
    surface.type("<p>Lost</p>")
    surface.open()
    const request = pending()
    fireEvent.click(screen.getByRole("button", { name: "Send" }))
    surface.type("<p>and Monday</p>")
    await act(async () => request.reject(Object.assign(new Error("Network Error"), { code: "ERR_NETWORK" })))
    expect(surface.last()).toMatchObject({ text: "<p>Lost</p>", state: "failed" })
    expect(surface.draft()?.html).toBe("<p>and Monday</p>")
    expect(toast).not.toHaveBeenCalled()
  })

  it("sends it again on Try again", async () => {
    surface.type("<p>Second go</p>")
    surface.open()
    const first = pending()
    fireEvent.click(screen.getByRole("button", { name: "Send" }))
    await act(async () => first.reject(new Error("HTTP 502")))
    shown = { state: surface.last()!.state, localId: surface.last()!.localId }
    cleanup()
    surface.open()
    const again = pending()
    fireEvent.click(screen.getByRole("button", { name: "Try again" }))
    expect(surface.last()?.state).toBe("sending")
    expect(send).toHaveBeenCalledTimes(2)
    await act(async () => again.resolve(answer("m-second")))
    expect(surface.last()).toMatchObject({ state: undefined, id: "m-second" })
  })

  it("puts it back in the composer, reply and all, on Edit", async () => {
    surface.type(MESSAGE)
    surface.open()
    const request = pending()
    fireEvent.click(screen.getByRole("button", { name: "Send" }))
    await act(async () => request.reject(new Error("HTTP 502")))
    const failed = surface.last()!
    const before = surface.count()
    shown = { state: failed.state, localId: failed.localId }
    cleanup()
    surface.open()
    const restoredBefore = surface.draft()?.restoredUnsent ?? 0
    fireEvent.click(screen.getByRole("button", { name: "Edit" }))
    expect(surface.count()).toBe(before - 1)
    expect(surface.draft()).toEqual({ html: MESSAGE, replyToUuid: "p1", restoredUnsent: restoredBefore + 1 })
  })

  it("drops it on Delete", async () => {
    surface.type("<p>Never mind</p>")
    surface.open()
    const request = pending()
    fireEvent.click(screen.getByRole("button", { name: "Send" }))
    await act(async () => request.reject(new Error("HTTP 502")))
    const failed = surface.last()!
    const before = surface.count()
    shown = { state: failed.state, localId: failed.localId }
    cleanup()
    surface.open()
    fireEvent.click(screen.getByRole("button", { name: "Delete" }))
    expect(surface.count()).toBe(before - 1)
  })
})

describe("a channel's message of only a file", () => {
  it("is sent, though it has no words", () => {
    store.dispatch(updateChannelInputText({ channelId: "ch2", inputTextHTML: "<p></p>" }))
    store.dispatch(addChannelUploadedFiles({ channelId: "ch2", filesUploaded: { attachment_obj_key: "k1", attachment_file_name: "launch.png" } as never }))
    render(<Provider store={store}><ChannelView channelId="ch2" /></Provider>)
    pending()
    fireEvent.click(screen.getByRole("button", { name: "Send" }))
    expect(send).toHaveBeenCalledTimes(1)
    expect(store.getState().channel.channelPosts.ch2?.at(-1)?.post_attachments).toHaveLength(1)
  })
})

describe("sending from a link to an older post", () => {
  afterEach(() => window.history.replaceState(null, "", "/"))

  it("sends without showing it first, and puts it back in the composer if it does not go", async () => {
    window.history.replaceState(null, "", "/app/channel/ch3?postId=p0")
    store.dispatch(updateChannelInputText({ channelId: "ch3", inputTextHTML: MESSAGE }))
    render(<Provider store={store}><ChannelView channelId="ch3" /></Provider>)
    const request = pending()
    fireEvent.click(screen.getByRole("button", { name: "Send" }))
    expect(store.getState().channel.channelPosts.ch3).toBeUndefined()
    await act(async () => request.reject(new Error("HTTP 502")))
    expect(store.getState().channel.channelInputState.ch3?.inputTextHTML).toBe(MESSAGE)
    expect(toast).toHaveBeenCalledWith(NOT_SENT_TOAST)
  })
})

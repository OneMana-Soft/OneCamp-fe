import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { Provider } from "react-redux"

// A message whose send fails goes back into the composer, in a channel, a DM
// and a group chat. The views run as the app runs them, with the store and its
// reducers; the request, the composer and what the views read are stand-ins.

const send = vi.fn()
vi.mock("@/hooks/usePost", () => ({ usePost: () => ({ makeRequest: send, isSubmitting: false }) }))
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

// The composer: Send, as pressing it does, with what the store holds.
type ComposerProps = { handleSend: () => void }
const Composer = ({ handleSend }: ComposerProps) => <button onClick={() => handleSend()}>Send</button>
vi.mock("@/components/channel/chanelIdDesktop", () => ({ ChannelIdDesktop: (p: ComposerProps) => <Composer {...p} /> }))
vi.mock("@/components/channel/channelIdMobile", () => ({ ChannelIdMobile: (p: ComposerProps) => <Composer {...p} /> }))
vi.mock("@/components/chat/chatIdDesktop", () => ({ ChatIdDesktop: (p: ComposerProps) => <Composer {...p} /> }))
vi.mock("@/components/chat/chatIdMobile", () => ({ ChatIdMobile: (p: ComposerProps) => <Composer {...p} /> }))
vi.mock("@/components/groupChat/chatGrpIdDesktop", () => ({ ChatGrpIdDesktop: (p: ComposerProps) => <Composer {...p} /> }))
vi.mock("@/components/groupChat/grpChatIdMobile", () => ({ GrpChatIdMobile: (p: ComposerProps) => <Composer {...p} /> }))

import store from "@/store/store"
import { setChannelReplyTarget, updateChannelInputText } from "@/store/slice/channelSlice"
import { createOrUpdateChatBody, setChatReplyTarget } from "@/store/slice/chatSlice"
import { createOrUpdateGroupChatBody, setGroupChatReplyTarget } from "@/store/slice/groupChatSlice"
import { ChannelView } from "./ChannelView"
import { ChatView } from "./ChatView"
import { GroupChatView } from "./GroupChatView"
import { NOT_SENT_TOAST } from "@/lib/chat/unsentMessage"

const MESSAGE = "<p>Ship it on <strong>Friday</strong></p>"

interface Surface {
  name: string
  open: () => void
  type: (html: string) => void
  draft: () => { html?: string; replyToUuid?: string; restoredUnsent?: number } | undefined
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
  },
]

// A request the test settles.
function pending() {
  let settle!: { resolve: (v: unknown) => void; reject: (e: unknown) => void }
  const promise = new Promise((resolve, reject) => (settle = { resolve, reject }))
  send.mockReturnValueOnce(promise)
  return settle
}

beforeEach(() => {
  send.mockReset()
  toast.mockReset()
})
afterEach(cleanup)

describe.each(surfaces)("sending in $name", (surface) => {
  it("empties the composer at once, and puts the message back with its reply if the send fails", async () => {
    surface.type(MESSAGE)
    surface.open()
    const request = pending()
    fireEvent.click(screen.getByRole("button", { name: "Send" }))
    expect(surface.draft()?.html).toBe("")
    expect(surface.draft()?.replyToUuid).toBeUndefined()

    await act(async () => request.reject(Object.assign(new Error("Network Error"), { code: "ERR_NETWORK" })))
    expect(surface.draft()).toEqual({ html: MESSAGE, replyToUuid: "p1", restoredUnsent: 1 })
    expect(toast).toHaveBeenCalledWith(NOT_SENT_TOAST)
  })

  it("keeps what was typed while it was sending, after the message", async () => {
    surface.type(MESSAGE)
    surface.open()
    const request = pending()
    fireEvent.click(screen.getByRole("button", { name: "Send" }))
    surface.type("<p>and Monday</p>")
    await act(async () => request.reject(new Error("HTTP 502")))
    expect(surface.draft()?.html).toBe(MESSAGE + "<p>and Monday</p>")
  })

  it("leaves the composer empty once the message is sent", async () => {
    surface.type(MESSAGE)
    surface.open()
    const request = pending()
    fireEvent.click(screen.getByRole("button", { name: "Send" }))
    await act(async () => request.resolve({ uuid: "m1", post_created_at: "", chat_created_at: "" }))
    expect(surface.draft()?.html).toBe("")
    expect(toast).not.toHaveBeenCalled()
  })
})

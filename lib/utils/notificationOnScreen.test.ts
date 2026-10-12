import { describe, expect, it } from "vitest"
import { notificationRoute, type PushNotificationData } from "@/lib/utils/notificationRoute"
import { onScreenFrom, pushConversation, pushIsOnScreen } from "@/lib/utils/notificationOnScreen"

// TN-BUG-9: the foreground handler compared the page's path with the push's
// route, and a channel push routes to its post (/app/channel/<ch>/<post>)
// while the channel open on a computer is /app/channel/<ch>: every message in
// the channel being read raised a preview, and so did every reply in the
// thread open beside it. A push is on screen by its conversation and thread.

const SELF = "5e1f0000-0000-4000-8000-000000000001"
const MAYA = "a11ce000-0000-4000-8000-00000000000a"
const ENG = "c0ffee00-0000-4000-8000-000000000001"
const OPS = "c0ffee00-0000-4000-8000-000000000002"
const GRP = "9a0b0000-0000-4000-8000-0000000000aa"
const POST = "aaaa0000-0000-4000-8000-00000000000a"
const OTHER_POST = "bbbb0000-0000-4000-8000-00000000000b"

const channelPost: PushNotificationData = { type: "channel", type_id: ENG, thread_id: POST }
const reply: PushNotificationData = { type: "post_comment", type_id: ENG, thread_id: POST }
const dm: PushNotificationData = { type: "chat", type_id: `${MAYA} ${SELF}`, thread_id: "m1" }
const dmReplyReaction: PushNotificationData = { type: "chat_comment_reaction", type_id: `${SELF} ${MAYA}`, thread_id: "m1" }
const dmReaction: PushNotificationData = { type: "chat_reaction", type_id: `${SELF} ${MAYA}`, thread_id: "m1" }
const group: PushNotificationData = { type: "chat", type_id: GRP, thread_id: "g1" }

describe("what is on screen", () => {
  it("is the page's conversation on a computer, with the thread open in the panel", () => {
    expect(onScreenFrom(`/app/channel/${ENG}`, { openThread: POST })).toEqual({ conversations: [`channel:${ENG}`], thread: POST })
    expect(onScreenFrom(`/app/chat/${MAYA}`)).toEqual({ conversations: [`dm:${MAYA}`], thread: null })
    expect(onScreenFrom(`/app/chat/group/${GRP}?messageId=g1`)).toEqual({ conversations: [`group:${GRP}`], thread: null })
  })

  it("is the thread alone on a phone's thread page", () => {
    expect(onScreenFrom(`/app/channel/${ENG}/${POST}`)).toEqual({ conversations: [], thread: POST })
    expect(onScreenFrom(`/app/chat/group/${GRP}/g1`)).toEqual({ conversations: [], thread: "g1" })
  })

  it("adds the conversations open beside the page", () => {
    const screen = onScreenFrom("/app/home", { panes: [{ kind: "channel", id: OPS }, { kind: "doc", id: "d1" }, { kind: "chat", id: MAYA }] })
    expect(screen.conversations).toEqual([`channel:${OPS}`, `dm:${MAYA}`])
  })
})

describe("a push about what is on screen", () => {
  const reading = (path: string, openThread?: string) => onScreenFrom(path, { openThread })

  it("is a new message in the channel being read, whatever its route says", () => {
    expect(notificationRoute(channelPost, SELF)).toBe(`/app/channel/${ENG}/${POST}`)
    expect(pushIsOnScreen(channelPost, reading(`/app/channel/${ENG}`), SELF)).toBe(true)
    expect(pushIsOnScreen(channelPost, reading(`/app/channel/${OPS}`), SELF)).toBe(false)
  })

  it("is a reply only while its thread is open", () => {
    expect(pushIsOnScreen(reply, reading(`/app/channel/${ENG}`, POST), SELF)).toBe(true)
    expect(pushIsOnScreen(reply, reading(`/app/channel/${ENG}`), SELF)).toBe(false)
    expect(pushIsOnScreen(reply, reading(`/app/channel/${ENG}`, OTHER_POST), SELF)).toBe(false)
    expect(pushIsOnScreen(reply, reading(`/app/channel/${ENG}/${POST}`), SELF)).toBe(true)
  })

  it("is a DM in the conversation with its sender, by the other person's half of the pair", () => {
    expect(pushConversation(dm, SELF)).toBe(`dm:${MAYA}`)
    expect(pushIsOnScreen(dm, reading(`/app/chat/${MAYA}`), SELF)).toBe(true)
    expect(pushIsOnScreen(dmReaction, reading(`/app/chat/${MAYA}`), SELF)).toBe(true)
    expect(pushIsOnScreen(dmReplyReaction, reading(`/app/chat/${MAYA}`), SELF)).toBe(false)
    expect(pushIsOnScreen(dmReplyReaction, reading(`/app/chat/${MAYA}`, "m1"), SELF)).toBe(true)
    expect(pushIsOnScreen(dm, reading(`/app/chat/${SELF}`), SELF)).toBe(false)
  })

  it("is a group message in the group, and in a pane beside the page", () => {
    expect(pushIsOnScreen(group, reading(`/app/chat/group/${GRP}`), SELF)).toBe(true)
    expect(pushIsOnScreen(group, onScreenFrom("/app/home", { panes: [{ kind: "group", id: GRP }] }), SELF)).toBe(true)
    expect(pushIsOnScreen(group, reading("/app/home"), SELF)).toBe(false)
  })

  it("is never a DM when who is signed in isn't known, nor a push with no place", () => {
    expect(pushIsOnScreen(dm, reading(`/app/chat/${MAYA}`), null)).toBe(false)
    expect(pushIsOnScreen({ type: "reminder", type_id: SELF }, reading(`/app/chat/${SELF}`), SELF)).toBe(false)
    expect(pushIsOnScreen(null, reading(`/app/channel/${ENG}`), SELF)).toBe(false)
  })
})

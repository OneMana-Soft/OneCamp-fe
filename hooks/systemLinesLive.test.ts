import { describe, expect, it, vi } from "vitest"
import { renderHook } from "@testing-library/react"
import { pinTestClock } from "@/lib/testing/testClock"

pinTestClock()

const dispatched: { type: string; payload: unknown }[] = []
vi.mock("react-redux", () => ({ useDispatch: () => (a: { type: string; payload: unknown }) => dispatched.push(a) }))
vi.mock("@/hooks/useFetch", () => ({ useFetchOnlyOnce: () => ({ data: { data: { user_uuid: "me" } } }) }))
vi.mock("@/lib/swrMutate", () => ({ patchCached: () => {}, appMutate: () => Promise.resolve() }))

const { MqttActionType } = await import("@/services/mqttService")
const { useChatMessageHandlers } = await import("@/hooks/useChatMessageHandlers")
const { usePostMessageHandlers } = await import("@/hooks/usePostMessageHandlers")

// A system line (chat A9) is the server's words about a conversation: it
// arrives live as a row of its own, and is never unread, so nothing counts it.
const facts = JSON.stringify({ kind: "group.continued", actor: "maya", targets: ["priya"], to: "grp-new" })

function chatLine(grp: string) {
  return JSON.stringify({
    type: 4,
    data: {
      type: MqttActionType.Create, chat_uuid: "line-1", chat_grp_id: grp, chat_html_text: "<p>Maya added Priya.</p>",
      chat_created_at: "2026-10-16T09:00:00Z", user_uuid: "maya", user_full_name: "Maya", chat_kind: "system", chat_system: facts,
    },
  })
}

describe("a system line in a DM or group", () => {
  it("is held as a line, with its facts", () => {
    dispatched.length = 0
    const { result } = renderHook(() => useChatMessageHandlers({ userUuid: "me" }))
    result.current.handleChatMessage(chatLine("grp-old"))
    const added = dispatched.find((a) => a.type.endsWith("/createGroupChat"))
    expect(added?.payload).toMatchObject({ chatId: "line-1", system: { chat_kind: "system", chat_system: facts } })
  })

  it("is never counted unread, where a message from the same person is", () => {
    dispatched.length = 0
    const { result } = renderHook(() => useChatMessageHandlers({ userUuid: "me" }))
    result.current.handleChatMessage(chatLine("maya me"))
    expect(dispatched.some((a) => /IncrementUnreadCount|incrementUserChatUnread/.test(a.type))).toBe(false)
    expect(dispatched.find((a) => a.type.endsWith("/createChat"))?.payload).toMatchObject({ system: { chat_kind: "system" } })

    dispatched.length = 0
    const message = JSON.parse(chatLine("maya me"))
    delete message.data.chat_kind
    delete message.data.chat_system
    result.current.handleChatMessage(JSON.stringify(message))
    expect(dispatched.some((a) => a.type.endsWith("incrementUserChatUnread"))).toBe(true)
    expect((dispatched.find((a) => a.type.endsWith("/createChat"))?.payload as { system?: unknown }).system).toBeUndefined()
  })
})

describe("a system line in a channel", () => {
  const line = (kind?: string) =>
    JSON.stringify({
      type: 0,
      data: {
        type: MqttActionType.Create, post_uuid: "line-2", post_channel_uuid: "ch-new", post_html_text: "<p>Maya made this channel.</p>",
        user_uuid: "maya", user_full_name: "Maya", post_created_at: "2026-10-16T09:00:00Z",
        ...(kind ? { post_kind: kind, post_system: JSON.stringify({ kind: "channel.from_group", actor: "maya", from: "grp" }) } : {}),
      },
    })

  it("is held as a line and never counted unread", () => {
    dispatched.length = 0
    const { result } = renderHook(() => usePostMessageHandlers({ userUuid: "me" }))
    result.current.handlePostMessage(line("system"))
    expect(dispatched.find((a) => a.type.endsWith("/createPost"))?.payload).toMatchObject({ postId: "line-2", system: { post_kind: "system" } })
    expect(dispatched.some((a) => a.type.endsWith("incrementUserChannelUnread"))).toBe(false)

    dispatched.length = 0
    result.current.handlePostMessage(line())
    expect(dispatched.some((a) => a.type.endsWith("incrementUserChannelUnread"))).toBe(true)
    expect((dispatched.find((a) => a.type.endsWith("/createPost"))?.payload as { system?: unknown }).system).toBeUndefined()
  })
})

import { describe, expect, it, vi } from "vitest"
import { renderHook } from "@testing-library/react"
import { pinTestClock } from "@/lib/testing/testClock"

pinTestClock()

const dispatched: { type: string; payload: unknown }[] = []
vi.mock("react-redux", () => ({ useDispatch: () => (a: { type: string; payload: unknown }) => dispatched.push(a) }))

const { MqttActionType } = await import("@/services/mqttService")
const { usePostMessageHandlers } = await import("@/hooks/usePostMessageHandlers")

// The faces beside "N replies" come from the replies the message list holds,
// and a live reply was held with no text and no is_bot. A guest's or Slack
// person's reply then showed the bot's face: nothing said who it relayed.
describe("a live reply in a channel", () => {
  it("is held with its text and whether a bot posted it", () => {
    dispatched.length = 0
    const { result } = renderHook(() => usePostMessageHandlers({ userUuid: "me" }))
    const text = "<p><strong>[Priya (Acme) (guest)]</strong></p><p>ok</p>"
    result.current.handlePostCommentMessage(
      JSON.stringify({
        type: 0,
        data: {
          type: MqttActionType.Create,
          comment_uuid: "c1",
          post_id: "p1",
          channel_id: "ch1",
          user_uuid: "guests",
          user_name: "Guests",
          body_text: text,
          is_bot: true,
          created_at: "2026-10-10T09:05:00Z",
        },
      }),
    )
    const increment = dispatched.find((a) => a.type.endsWith("updateChannelMessageReplyIncrement"))
    const comment = (increment?.payload as { comment: { comment_text: string; comment_by: { is_bot?: boolean } } }).comment
    expect(comment.comment_text).toBe(text)
    expect(comment.comment_by.is_bot).toBe(true)
  })
})

// SN-8: a live post that mentions you adds to its channel's "@2" in the
// sidebar, as the server's count does on the next answer.
describe("a live post in a channel you aren't looking at", () => {
  const post = (html: string) =>
    JSON.stringify({
      type: 0,
      data: { type: MqttActionType.Create, post_uuid: "p9", post_channel_uuid: "ch-launch", post_html_text: html, user_uuid: "maya", user_full_name: "Maya Chen", post_created_at: "2026-10-14T09:00:00Z" },
    })
  const bumped = () => dispatched.find((a) => a.type.endsWith("incrementUserChannelUnread"))?.payload

  it("counts as a mention of you when it mentions you", () => {
    dispatched.length = 0
    const { result } = renderHook(() => usePostMessageHandlers({ userUuid: "me" }))
    result.current.handlePostMessage(post('<p><span data-type="mention" data-id="me@0x2a" data-label="Sam">@Sam</span> look</p>'))
    expect(bumped()).toEqual({ ch_uuid: "ch-launch", mentionsMe: true })
  })

  it("counts as unread only when it doesn't", () => {
    dispatched.length = 0
    const { result } = renderHook(() => usePostMessageHandlers({ userUuid: "me" }))
    result.current.handlePostMessage(post('<p><span data-type="mention" data-id="jonas@0x2b" data-label="Jonas">@Jonas</span> look</p>'))
    expect(bumped()).toEqual({ ch_uuid: "ch-launch", mentionsMe: false })
  })
})

// An edit that arrives live is one: it says "(edited)" at once, as your own does.
describe("a live edit", () => {
  it("of a post or a reply is held with the time it arrived", () => {
    dispatched.length = 0
    const before = Date.now()
    const { result } = renderHook(() => usePostMessageHandlers({ userUuid: "me" }))
    result.current.handlePostMessage(JSON.stringify({
      type: 0,
      data: { type: MqttActionType.Update, post_uuid: "p9", post_channel_uuid: "ch-launch", post_html_text: "<p>fixed</p>", user_uuid: "maya" },
    }))
    result.current.handlePostCommentMessage(JSON.stringify({
      type: 0,
      data: { type: MqttActionType.Update, comment_uuid: "c1", post_id: "p9", body_text: "<p>fixed</p>", user_uuid: "maya" },
    }))
    const times = dispatched
      .filter((a) => /updatePostByPostId|updateChannelCommentByCommentUUID/.test(a.type))
      .map((a) => Date.parse((a.payload as { updatedAt: string }).updatedAt))
    expect(times).toHaveLength(2)
    for (const t of times) expect(t).toBeGreaterThanOrEqual(before)
  })
})

import { describe, expect, it, vi } from "vitest"
import { renderHook } from "@testing-library/react"

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

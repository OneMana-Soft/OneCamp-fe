import { describe, expect, it, vi } from "vitest"
import { renderHook } from "@testing-library/react"

const dispatched: { type: string; payload: unknown }[] = []
vi.mock("react-redux", () => ({ useDispatch: () => (a: { type: string; payload: unknown }) => dispatched.push(a) }))
vi.mock("@/hooks/useFetch", () => ({ useFetchOnlyOnce: () => ({ data: { data: { user_uuid: "me" } } }) }))

const { MqttActionType } = await import("@/services/mqttService")
const { useChatMessageHandlers } = await import("@/hooks/useChatMessageHandlers")

// A forward into a DM or a group was left out of the conversation: the live
// handler skipped every message carrying a forward, though its own comment
// said forwards must land there (the sender's tab shows none of its own).
function forward(grp: string) {
  return JSON.stringify({
    type: 4,
    data: {
      type: MqttActionType.Create,
      chat_uuid: "fwd-1",
      chat_grp_id: grp,
      chat_html_text: "",
      chat_created_at: "2026-10-13T09:00:00Z",
      user_uuid: "maya",
      user_full_name: "Maya",
      chat_fwd_msg_post: { post_uuid: "p1", post_text: "<p>the numbers for Q4</p>" },
    },
  })
}

describe("a forward", () => {
  it("lands live in an open DM", () => {
    dispatched.length = 0
    const { result } = renderHook(() => useChatMessageHandlers({ userUuid: "me" }))
    result.current.handleChatMessage(forward("maya me"))
    const added = dispatched.find((a) => a.type.endsWith("/createChat"))
    expect(added).toBeTruthy()
    expect((added?.payload as { fwdPost?: { post_uuid: string } }).fwdPost?.post_uuid).toBe("p1")
  })

  it("lands live in an open group", () => {
    dispatched.length = 0
    const { result } = renderHook(() => useChatMessageHandlers({ userUuid: "me" }))
    result.current.handleChatMessage(forward("grp-hash-1"))
    const added = dispatched.find((a) => a.type.endsWith("/createGroupChat"))
    expect(added).toBeTruthy()
    expect((added?.payload as { fwdPost?: { post_uuid: string } }).fwdPost?.post_uuid).toBe("p1")
  })
})

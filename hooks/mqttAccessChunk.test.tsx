import { describe, expect, it, vi } from "vitest"
import { renderHook, waitFor } from "@testing-library/react"
import { MqttMessageType } from "@/services/mqttService"
import type { ConnectionConfig } from "@/types/mqtt"

// The handler's other events are beside the point here.
vi.mock("react-redux", () => ({ useDispatch: () => () => {} }))
vi.mock("@/hooks/useUserMessageHandlers", () => ({ useUserMessageHandlers: () => ({}) }))
vi.mock("@/hooks/usePostMessageHandlers", () => ({ usePostMessageHandlers: () => ({}) }))
vi.mock("@/hooks/useChatMessageHandlers", () => ({ useChatMessageHandlers: () => ({}) }))
vi.mock("@/hooks/useTypingHandlers", () => ({ useTypingHandlers: () => ({}) }))
vi.mock("@/hooks/useTaskMessageHandlers", () => ({ useTaskMessageHandlers: () => ({}) }))
vi.mock("@/hooks/useDocMessageHandlers", () => ({ useDocMessageHandlers: () => ({}) }))
vi.mock("@/hooks/useActivityMessageHandlers", () => ({ useActivityMessageHandlers: () => ({}) }))
// The access event's code is a chunk of its own, and here it fails to load,
// as it does for a tab opened before a deploy.
vi.mock("@/lib/mqtt/conversationAccess", () => {
  throw new Error("Failed to load chunk")
})

const { useMqttMessageHandler } = await import("@/hooks/useMqttMessageHandler")

describe("a project taken away while the access event's code can't load", () => {
  it("still fetches the topics again, so the tab stops hearing the project", async () => {
    const refreshTopics = vi.fn()
    const { result } = renderHook(() => useMqttMessageHandler({ connectionConfig: {} as ConnectionConfig, userUuid: "u1", refreshTopics }))
    const event = { type: MqttMessageType.Conversation_Access, data: { kind: "project", id: "P1", change: "dropped" } }
    result.current.handleMessage("activity/u1", Buffer.from(JSON.stringify(event)))
    await waitFor(() => expect(refreshTopics).toHaveBeenCalledTimes(1))
  })
})

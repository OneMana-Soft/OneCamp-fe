import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, renderHook } from "@testing-library/react"
import { projectStatusesKey } from "@/lib/projectStatusesKey"

// A project's statuses, or their order, changed: the server says so on the
// project's topic (MESSAGE_PROJECT_STATUSES, 43). The app listens on the
// topic of every project a person is in, so its message router reads the
// statuses again for every board and picker of the project: a list's or a
// task panel's status picker as much as an open board (the regression
// audit's S-e).

const read = vi.hoisted(() => [] as unknown[])
vi.mock("@/lib/swrMutate", () => ({ appMutate: (key: unknown) => void read.push(key) }))
vi.mock("react-redux", () => ({ useDispatch: () => vi.fn() }))
// The handlers of the other kinds of message, which these messages reach none of.
vi.mock("@/hooks/useUserMessageHandlers", () => ({ useUserMessageHandlers: () => ({}) }))
vi.mock("@/hooks/usePostMessageHandlers", () => ({ usePostMessageHandlers: () => ({}) }))
vi.mock("@/hooks/useChatMessageHandlers", () => ({ useChatMessageHandlers: () => ({}) }))
vi.mock("@/hooks/useTypingHandlers", () => ({ useTypingHandlers: () => ({}) }))
vi.mock("@/hooks/useTaskMessageHandlers", () => ({ useTaskMessageHandlers: () => ({}) }))
vi.mock("@/hooks/useDocMessageHandlers", () => ({ useDocMessageHandlers: () => ({}) }))
vi.mock("@/hooks/useActivityMessageHandlers", () => ({ useActivityMessageHandlers: () => ({}) }))

const { useMqttMessageHandler } = await import("@/hooks/useMqttMessageHandler")

// A message on project p-1's topic, as the router hears it.
function hear(message: object) {
  const connectionConfig = { wsUrl: "", wsPort: 0, reconnectInterval: 0, typingTimeout: 0 }
  const { result } = renderHook(() => useMqttMessageHandler({ connectionConfig, userUuid: "u-1" }))
  result.current.handleMessage("project/p-1", Buffer.from(JSON.stringify(message)))
}

afterEach(() => {
  cleanup()
  read.length = 0
})

describe("a project's statuses changing", () => {
  it("reads them again for every board and picker of the project, whatever is open", async () => {
    hear({ type: 43, data: { project_uuid: "p-1" } })
    // The router loads the message's reader when the first one comes.
    await vi.waitFor(() => expect(read).toEqual([projectStatusesKey("p-1")]))
  })

  it("reads nothing again for another message on the project's topic", async () => {
    hear({ type: 40, data: { project_uuid: "p-1", task_uuid: "t-1" } })
    // A read would come only once the reader's import settles: a statuses
    // message heard after it settles after it, and is the one read.
    hear({ type: 43, data: { project_uuid: "p-1" } })
    await vi.waitFor(() => expect(read).toEqual([projectStatusesKey("p-1")]))
  })
})

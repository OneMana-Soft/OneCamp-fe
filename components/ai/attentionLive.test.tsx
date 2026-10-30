import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, render, screen, waitFor } from "@testing-library/react"
import { Provider } from "react-redux"
import { configureStore } from "@reduxjs/toolkit"
import type { AttentionItem, AttentionResult } from "@/services/memoryService"
import type { PendingAction } from "@/services/pendingActionService"
import { pinTestClock } from "@/lib/testing/testClock"

// An agent's request made while Home is open comes over the live connection
// into the store (pendingActionSlice). The list read the server once, so the
// request wasn't in it, and the greeting's line, which says what the list
// shows, didn't count it either (21 Oct 2026). A request the list doesn't have
// reads the list again; one it has reads nothing.

pinTestClock(new Date(2026, 9, 21, 15, 0))

const getAttention = vi.hoisted(() => vi.fn<() => Promise<AttentionResult>>())
vi.mock("@/services/memoryService", async (orig) => ({ ...(await orig<object>()), getAttention, attentionKey: () => "attention" }))
vi.mock("@/components/common/withFeature", async (orig) => ({ ...(await orig<object>()), withAI: <P,>(C: P) => C }))
vi.mock("@/hooks/useBotKinds", () => ({ useBotKind: () => undefined }))
vi.mock("@/hooks/useUserAvatar", () => ({ useUserAvatar: () => ({ src: undefined }) }))

const { default: AttentionCard } = await import("@/components/ai/AttentionCard")
const { default: pendingActionSlice, setPendingActions, upsertPendingAction } = await import("@/store/slice/pendingActionSlice")
const { default: userSlice } = await import("@/store/slice/userSlice")

const approval = (id: string, title: string): AttentionItem => ({ source: "approval", kind: "Approval", title, subtitle: "in Q4 launch", priority: 1, ref_id: id })
const answer = (items: AttentionItem[]): AttentionResult => ({ enabled: true, items, counts: {} }) as AttentionResult
const action = (id: string): PendingAction => ({
  id,
  requested_by: "agent",
  surface_type: "assistant",
  surface_id: "",
  tool_name: "create_tasks",
  params: {},
  description: "Create tasks",
  status: "pending",
  expires_at: "2099-01-01T00:00:00Z",
  created_at: "2026-10-21T10:00:00Z",
}) as PendingAction

function home() {
  const store = configureStore({
    reducer: { [userSlice.name]: userSlice.reducer, [pendingActionSlice.name]: pendingActionSlice.reducer },
    middleware: (d) => d({ serializableCheck: false }),
  })
  render(
    <Provider store={store}>
      <AttentionCard />
    </Provider>,
  )
  return store
}

afterEach(() => {
  cleanup()
  getAttention.mockReset()
})

describe("an agent's request while Home is open", () => {
  it("reads the list again when the request isn't in it, and shows it", async () => {
    getAttention.mockResolvedValueOnce(answer([approval("p1", "Release Captain wants to create 6 tasks")]))
    const store = home()
    await screen.findByText("Release Captain wants to create 6 tasks")
    getAttention.mockResolvedValueOnce(answer([approval("p1", "Release Captain wants to create 6 tasks"), approval("p2", "Scout wants to post in #engineering")]))
    act(() => void store.dispatch(upsertPendingAction(action("p2"))))
    await screen.findByText("Scout wants to post in #engineering")
    expect(getAttention).toHaveBeenCalledTimes(2)
  })

  it("reads nothing again for requests the list already has", async () => {
    getAttention.mockResolvedValueOnce(answer([approval("p1", "Release Captain wants to create 6 tasks")]))
    const store = home()
    await screen.findByText("Release Captain wants to create 6 tasks")
    act(() => void store.dispatch(setPendingActions([action("p1")])))
    await act(async () => {})
    await waitFor(() => expect(getAttention).toHaveBeenCalledTimes(1))
  })
})

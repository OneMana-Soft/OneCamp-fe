import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
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
const updateMemoryStatus = vi.hoisted(() => vi.fn<(id: string, status: string) => Promise<void>>(async () => {}))
vi.mock("@/services/memoryService", async (orig) => ({ ...(await orig<object>()), getAttention, updateMemoryStatus, attentionKey: () => "attention" }))
// The shared toast, read back: Done's Undo.
type Toasted = { title?: string; action?: { props: { onClick: () => void } } }
const toast = vi.hoisted(() => vi.fn<(t: Toasted) => void>())
vi.mock("@/hooks/use-toast", async (orig) => ({ ...(await orig<object>()), useToast: () => ({ toast }) }))
vi.mock("@/components/common/withFeature", async (orig) => ({ ...(await orig<object>()), withAI: <P,>(C: P) => C }))
vi.mock("@/hooks/useBotKinds", () => ({ useBotKind: () => undefined }))
vi.mock("@/hooks/useUserAvatar", () => ({ useUserAvatar: () => ({ src: undefined }) }))

const { default: AttentionCard } = await import("@/components/ai/AttentionCard")
const { default: pendingActionSlice, setPendingActions, upsertPendingAction } = await import("@/store/slice/pendingActionSlice")
const { default: userSlice } = await import("@/store/slice/userSlice")
const { default: axiosInstance } = await import("@/lib/axiosInstance")
const { forgetShared, sharedRequest } = await import("@/lib/utils/sharedRequest")
const { PostEndpointUrl } = await import("@/services/endPoints")

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
  updateMemoryStatus.mockReset()
  toast.mockReset()
  forgetShared("attention")
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

// C11 (V-581): Done on an overdue commitment went to the task list's endpoint
// with no task, and failed ("the task is gone"). It resolves the commitment's
// memory item, as the memory page's Resolve does, and Undo opens it again.
describe("an overdue commitment on Home", () => {
  const commitment: AttentionItem = { source: "commitment", kind: "Overdue commitment", title: "Send the vendor shortlist to Priya", url: "/app/ai/memory?item=m-1", due_at: "2026-10-17", priority: 2 }
  // The shared attention read (getAttention's sharedRequest), kept from a
  // moment ago: true when asking it now goes to the server again.
  const keep = () => sharedRequest("attention", async () => answer([commitment]))
  const asksAgain = async () => {
    const read = vi.fn(async () => answer([]))
    await sharedRequest("attention", read)
    return read.mock.calls.length === 1
  }

  it("is resolved by Done through the memory item, never the task list, and opened again by Undo", async () => {
    getAttention.mockResolvedValueOnce(answer([commitment]))
    home()
    await screen.findByText("Send the vendor shortlist to Priya")
    const post = vi.spyOn(axiosInstance, "post").mockResolvedValue({ data: {} })
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Done" })))
    expect(updateMemoryStatus).toHaveBeenCalledWith("m-1", "resolved")
    expect(post).not.toHaveBeenCalled()
    expect(screen.queryByText("Send the vendor shortlist to Priya")).toBeNull()
    const said = toast.mock.calls.at(-1)![0]
    expect(said.title).toBe("Done")
    await act(async () => said.action!.props.onClick())
    expect(updateMemoryStatus).toHaveBeenLastCalledWith("m-1", "open")
    expect(screen.getByText("Send the vendor shortlist to Priya")).toBeTruthy()
    post.mockRestore()
  })

  // CR-B23 L1: the attention read kept from a moment ago still held the
  // resolved commitment, and the next Home drew it again until a refresh.
  it("asks the attention read again after Done and after its Undo", async () => {
    getAttention.mockResolvedValueOnce(answer([commitment]))
    home()
    await screen.findByText("Send the vendor shortlist to Priya")
    await keep()
    expect(await asksAgain()).toBe(false)
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Done" })))
    expect(updateMemoryStatus).toHaveBeenCalledWith("m-1", "resolved")
    expect(await asksAgain(), "the read after Done").toBe(true)
    await keep()
    await act(async () => toast.mock.calls.at(-1)![0].action!.props.onClick())
    expect(updateMemoryStatus).toHaveBeenLastCalledWith("m-1", "open")
    expect(await asksAgain(), "the read after Undo").toBe(true)
  })

  it("keeps its row and says why when resolving fails", async () => {
    getAttention.mockResolvedValueOnce(answer([commitment]))
    updateMemoryStatus.mockRejectedValueOnce(new Error("offline"))
    home()
    await screen.findByText("Send the vendor shortlist to Priya")
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Done" })))
    expect(screen.getByText("Send the vendor shortlist to Priya")).toBeTruthy()
    expect(screen.getByText(/Couldn't mark it done/)).toBeTruthy()
  })
})

// CR-B23 T1: Done on Home's attention card is the commitment's way only for a
// commitment. A task's Done and its Undo set the task's status through the
// task list's endpoint, and never touch a memory item.
describe("an overdue task on Home's attention card", () => {
  const task: AttentionItem = { source: "task", kind: "Overdue task", title: "Ship the onboarding checklist", subtitle: "", context: "Q4 launch", url: "/app/task/t-1", ref_id: "t-1", priority: 2 }

  it("is done, and undone, through the task list, never the memory item", async () => {
    getAttention.mockResolvedValueOnce(answer([task]))
    home()
    await screen.findByText("Ship the onboarding checklist")
    const post = vi.spyOn(axiosInstance, "post").mockResolvedValue({ data: {} })
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Done" })))
    expect(post).toHaveBeenCalledWith(PostEndpointUrl.UpdateTaskStatus, expect.objectContaining({ task_status: "done", task_uuid: "t-1" }))
    expect(screen.queryByText("Ship the onboarding checklist")).toBeNull()
    const said = toast.mock.calls.at(-1)![0]
    expect(said.title).toBe("Done")
    await act(async () => said.action!.props.onClick())
    expect(post).toHaveBeenLastCalledWith(PostEndpointUrl.UpdateTaskStatus, expect.objectContaining({ task_status: "todo", task_uuid: "t-1" }))
    expect(post).toHaveBeenCalledTimes(2)
    expect(screen.getByText("Ship the onboarding checklist")).toBeTruthy()
    expect(updateMemoryStatus).not.toHaveBeenCalled()
    post.mockRestore()
  })
})

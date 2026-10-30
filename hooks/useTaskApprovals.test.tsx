import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, renderHook, waitFor } from "@testing-library/react"
import { SWRConfig } from "swr"
import type { ReactNode } from "react"
import type { TaskApproval } from "@/lib/rules/approvals"
import { pinTestClock } from "@/lib/testing/testClock"

pinTestClock()

// A task's request from its card and the ask sheet: asking shows the new
// request at once, and an answer or a withdrawal also re-reads the
// approvers' waiting lists, so Home's Approvals row goes when it's answered.

const request = { id: "a1", state: "pending", to_status: "", approvers: ["ana"], decisions: [] } as unknown as TaskApproval
const get = vi.fn(async () => ({ data: { data: null } }))
const post = vi.fn<(url: string, body?: unknown, config?: unknown) => Promise<{ data: { data: TaskApproval | null } }>>(async (url) => ({
  data: { data: url.endsWith("/withdraw") ? null : request },
}))
vi.mock("@/lib/axiosInstance", async () => (await import("@/lib/testing/axiosInstance")).axiosInstanceModule({ default: { get: (...a: unknown[]) => get(...(a as [])), post: (url: string, body?: unknown, config?: unknown) => post(url, body, config) } }))
const appMutate = vi.fn()
vi.mock("@/lib/swrMutate", () => ({ appMutate: (key: unknown) => appMutate(key) }))

const { useTaskApproval } = await import("@/hooks/useTaskApprovals")
// The card and the ask sheet say their own failures: the app's error toast stays quiet, so one failure is said once.
const OWN = { suppressErrorToast: true }

function hook() {
  const cache = new Map()
  const wrapper = ({ children }: { children: ReactNode }) => <SWRConfig value={{ provider: () => cache as never, dedupingInterval: 0 }}>{children}</SWRConfig>
  return renderHook(() => useTaskApproval("t1"), { wrapper })
}

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe("a task's approval request, asked and answered", () => {
  it("asks with what the sheet says, and shows the request at once", async () => {
    const { result } = hook()
    await waitFor(() => expect(get).toHaveBeenCalled())
    const input = { approvers: ["ana"], needed: 1, client: true, due_at: "2026-10-30T11:30:00.000Z", ask: "Is the copy final?" }
    await act(async () => void (await result.current.ask(input)))
    expect(post).toHaveBeenCalledWith("/task/approval/t1/ask", input, OWN)
    expect(result.current.approval).toEqual(request)
  })

  it("re-reads the waiting lists after an answer and after a withdrawal", async () => {
    const { result } = hook()
    await act(async () => void (await result.current.decide("a1", "approve", "")))
    expect(post).toHaveBeenCalledWith("/task/approval/t1/decide", { approval_id: "a1", verdict: "approve", comment: "" }, OWN)
    expect(appMutate).toHaveBeenCalledWith("/approvals/waiting")
    appMutate.mockClear()
    await act(async () => void (await result.current.withdraw()))
    expect(post).toHaveBeenLastCalledWith("/task/approval/t1/withdraw", undefined, OWN)
    expect(appMutate).toHaveBeenCalledWith("/approvals/waiting")
  })

  it("reads a request answered or closed meanwhile again, with the waiting lists, and says why", async () => {
    const { result } = hook()
    await waitFor(() => expect(get).toHaveBeenCalledTimes(1))
    const closed = { response: { status: 409, data: { msg: "That request is closed now." } } }
    post.mockRejectedValueOnce(closed)
    await act(async () => expect(result.current.decide("a1", "approve", "")).rejects.toBe(closed))
    await waitFor(() => expect(get).toHaveBeenCalledTimes(2))
    expect(appMutate).toHaveBeenCalledWith("/approvals/waiting")
    // Any other failure leaves the request as it was read.
    post.mockRejectedValueOnce({ response: { status: 500, data: {} } })
    await act(async () => expect(result.current.withdraw()).rejects.toBeTruthy())
    expect(get).toHaveBeenCalledTimes(2)
  })
})

import { afterEach, describe, expect, it, vi } from "vitest"
import { act, renderHook, waitFor } from "@testing-library/react"

const toast = vi.fn()
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast }) }))
const post = vi.fn()
vi.mock("@/lib/axiosInstance", async () => (await import("@/lib/testing/axiosInstance")).axiosInstanceModule({ default: { get: vi.fn(), post: (...a: unknown[]) => post(...a) } }))

const { usePost } = await import("@/hooks/usePost")
const { APPROVAL_HELD } = await import("@/lib/approvalHeld")

const heard = vi.fn()
window.addEventListener(APPROVAL_HELD, heard)

afterEach(() => vi.clearAllMocks())

async function send(answer: () => Promise<unknown>, showToast = false) {
  post.mockImplementationOnce(answer)
  const { result } = renderHook(() => usePost())
  let out: unknown
  await act(async () => {
    out = await result.current.makeRequest({ apiEndpoint: "/task/createTask", payload: {}, showErrorToast: true, showToast }).catch(() => "refused")
  })
  return out
}

// A move or a new task the project's status rules hold (main's approvals
// check): one toast in the server's words that never says "Sent for
// approval" twice, and the task's card told to read its request again. The
// words load as a chunk of their own (lib/rules/held), so they come a tick
// after the answer.
describe("a change the project's rules hold for approval", () => {
  it("says a held move once: Sent for approval, over where it moves", async () => {
    await send(() => Promise.reject({ response: { status: 409, data: { code: "approval", msg: "Sent for approval: it moves to In review once it's approved." } } }))
    await waitFor(() => expect(toast).toHaveBeenCalledWith({ title: "Sent for approval", description: "It moves to In review once it's approved." }))
    expect(heard).toHaveBeenCalledTimes(1)
  })

  it("says a move already waiting as just that", async () => {
    await send(() => Promise.reject({ response: { status: 409, data: { code: "approval", msg: "It's waiting for approval already." } } }))
    await waitFor(() => expect(toast).toHaveBeenCalledWith({ title: "It's waiting for approval already." }))
  })

  it("says a new task made in To do and sent for approval as a held move is said, and keeps its answer", async () => {
    const made = { task_uuid: "t1", approval_id: "a1", status: "todo" }
    const out = await send(async () => ({ data: { msg: "Made in To do. Sent for approval: it moves to In review once it's approved.", code: "approval", data: made } }))
    expect(out).toEqual(made)
    await waitFor(() => expect(toast).toHaveBeenCalledWith({ title: "Sent for approval", description: "Made in To do. It moves to In review once it's approved." }))
    expect(heard).toHaveBeenCalledTimes(1)
    // A caller that asks for a success toast gets these words alone.
    toast.mockClear()
    await send(async () => ({ data: { msg: "Made in To do. Sent for approval: it moves to In review once it's approved.", code: "approval", data: made } }), true)
    await waitFor(() => expect(toast).toHaveBeenCalledTimes(1))
    expect(toast.mock.calls[0][0]).toEqual({ title: "Sent for approval", description: "Made in To do. It moves to In review once it's approved." })
  })

  it("says a new task made in To do whose request couldn't open, and tells no card", async () => {
    const msg = "Made in To do. Moving it to In review needs the client's approval: share a client link that can comment first."
    await send(async () => ({ data: { msg, code: "status_rule", data: { task_uuid: "t1", status: "todo" } } }))
    await waitFor(() => expect(toast).toHaveBeenCalledWith({ title: msg }))
    expect(heard).not.toHaveBeenCalled()
  })

  it("says nothing more of a task made where it was asked", async () => {
    await send(async () => ({ data: { msg: "Created task!", data: { task_uuid: "t1" } } }))
    expect(toast).not.toHaveBeenCalled()
  })
})

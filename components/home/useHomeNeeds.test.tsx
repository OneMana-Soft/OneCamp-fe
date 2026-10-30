import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, renderHook, waitFor } from "@testing-library/react"
import { SWRConfig } from "swr"
import type { ReactNode } from "react"

// Home's list reads three sources, and approvals waiting for the reader
// joined them (R2b). One that fails never holds the others' rows behind
// "Loading what needs you", and only every source failing says it couldn't
// load. The approvals read says nothing of its own failure: a server without
// R2b answers 404 there, and Home must stay quiet about it.

type Answer = () => Promise<unknown>
let answers: Record<string, Answer>
const get = vi.fn((url: string) => {
  const hit = Object.keys(answers).find((k) => url.startsWith(k))
  return hit ? answers[hit]() : Promise.reject(new Error(`nothing answers ${url}`))
})
vi.mock("@/lib/axiosInstance", async () => (await import("@/lib/testing/axiosInstance")).axiosInstanceModule({ default: { get: (url: string) => get(url), post: vi.fn() } }))
const tellReadFailure = vi.fn()
vi.mock("@/lib/http/loadFailure", () => ({ tellReadFailure: (e: unknown) => tellReadFailure(e) }))
vi.mock("react-redux", () => ({ useSelector: (pick: (s: unknown) => unknown) => pick({ users: { userSidebar: { userChats: [] } } }) }))

const { useHomeNeeds } = await import("@/components/home/useHomeNeeds")

const ok = (data: unknown): Answer => () => Promise.resolve({ data })
const fails: Answer = () => Promise.reject(Object.assign(new Error("Request failed with status code 500"), { response: { status: 500, data: { msg: "boom" } } }))
const dueToday = { task_uuid: "t1", task_name: "Write the launch notes", task_status: "todo", task_due_date: new Date().toISOString(), task_deleted_at: "" }
const waiting = { approval_id: "a1", kind: "task", id: "t2", title: "Launch copy", path: "/app/task/t2", to_name: "Done", requested_by: "u-cy", created_at: new Date().toISOString() }

function read() {
  const cache = new Map()
  const wrapper = ({ children }: { children: ReactNode }) => (
    <SWRConfig value={{ provider: () => cache as never, dedupingInterval: 0, shouldRetryOnError: false }}>{children}</SWRConfig>
  )
  return renderHook(() => useHomeNeeds(), { wrapper })
}

beforeEach(() => {
  answers = {
    "/user/profile": ok({ data: { user_uuid: "u-sam" } }),
    "/activity": ok({ data: { activities: [] } }),
    "/user/assignedTaskList": ok({ data: { user_tasks: [dueToday] } }),
    "/approvals/waiting": ok({ data: { items: [waiting] } }),
  }
})
afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe("what needs me, with approvals among its sources", () => {
  it("lists the approvals waiting for me beside the rest", async () => {
    const { result } = read()
    await waitFor(() => expect(result.current.items.map((i) => i.id)).toEqual(expect.arrayContaining(["approval:a1", "task:t1"])))
    expect(result.current.loading).toBe(false)
  })

  it("shows the other sources' rows when approvals fail, and says nothing of it", async () => {
    answers["/approvals/waiting"] = fails
    const { result } = read()
    await waitFor(() => expect(result.current.items.map((i) => i.id)).toContain("task:t1"))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.error).toBe(false)
    expect(tellReadFailure).not.toHaveBeenCalled()
  })

  it("says it couldn't load only when every source failed", async () => {
    for (const k of ["/activity", "/user/assignedTaskList", "/approvals/waiting"]) answers[k] = fails
    const { result } = read()
    await waitFor(() => expect(result.current.error).toBe(true))
    expect(result.current.loading).toBe(false)
  })
})

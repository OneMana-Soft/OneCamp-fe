import { afterEach, describe, expect, it, vi } from "vitest"
import { pinTestClock } from "@/lib/testing/testClock"
import { act, cleanup, renderHook } from "@testing-library/react"

// What the server answered, fed to the hook as useFetch hands it over; mutate runs the change as SWR does and keeps what it showed.
const answer = vi.hoisted(() => ({ current: undefined as unknown, isError: undefined as unknown, keys: [] as string[], shown: [] as unknown[], cached: [] as unknown[] }))
const mutate = vi.hoisted(() =>
  vi.fn(async (change?: unknown, opts?: { optimisticData?: unknown }) => {
    if (typeof change !== "function") return undefined
    answer.shown.push(opts?.optimisticData)
    const next = await (change as () => Promise<unknown>)()
    answer.cached.push(next)
    return next
  }),
)
const post = vi.hoisted(() => vi.fn<(...args: unknown[]) => Promise<unknown>>(async () => ({ data: { msg: "ok", data: { plan: undefined } } })))
vi.mock("@/hooks/useFetch", () => ({
  useFetch: (key: string) => {
    answer.keys.push(key)
    return { data: key ? answer.current : undefined, mutate, isError: answer.isError, isLoading: answer.current === undefined }
  },
}))
vi.mock("@/lib/axiosInstance", async () => (await import("@/lib/testing/axiosInstance")).axiosInstanceModule({ default: { post } }))

import { usePlanRegistry, useProjectPlan } from "@/hooks/useProjectPlan"
import { OWN_ERRORS } from "@/lib/http/ownErrors"
import type { ProjectPlan } from "@/lib/work/projectPlan"

pinTestClock()

afterEach(() => {
  cleanup()
  answer.current = undefined
  answer.isError = undefined
  answer.keys = []
  answer.shown = []
  answer.cached = []
  mutate.mockClear()
  post.mockClear()
})

const PLAN: ProjectPlan = { lead: null, start: null, target: null, priority: "", status: { category: "in_progress", name: "In progress", color: "amber" }, labels: null }
const read = (plan: ProjectPlan, can_edit = true, can_lead = false) => ({ msg: "ok", data: { plan, can_edit, can_lead } })

describe("a project's plan as the server answers it (linear-15)", () => {
  it("reads the plan and what the reader may change, from the project's own address", () => {
    answer.current = read(PLAN, true, false)
    const { result } = renderHook(() => useProjectPlan("p 1"))
    expect(result.current.plan?.status.name).toBe("In progress")
    expect(result.current.canEdit).toBe(true)
    expect(result.current.canLead).toBe(false)
    expect(answer.keys).toContain("/project/p%201/plan")
  })

  it("asks for nothing without a project, and fails only when a read failed with nothing to show", () => {
    const { result, rerender } = renderHook(({ id }: { id?: string }) => useProjectPlan(id), { initialProps: { id: undefined as string | undefined } })
    expect(answer.keys.every((k) => k === "")).toBe(true)
    expect(result.current.failed).toBe(false)
    answer.isError = new Error("offline")
    rerender({ id: "p1" })
    expect(result.current.failed).toBe(true)
    answer.current = read(PLAN)
    rerender({ id: "p1" })
    expect(result.current.failed).toBe(false)
  })

  it("shows a change at once, sends only its parts, and keeps the plan as the server answers it", async () => {
    answer.current = read(PLAN)
    const target = { date: "2027-09-30", resolution: "quarter" as const }
    post.mockResolvedValueOnce({ data: { msg: "ok", data: { plan: { ...PLAN, priority: "high", target } } } })
    const { result } = renderHook(() => useProjectPlan("p1"))
    await act(() => result.current.save({ priority: "high", target }, { priority: "high", target }))
    expect(post).toHaveBeenCalledWith("/project/p1/plan", { priority: "high", target }, OWN_ERRORS)
    expect(answer.shown[0]).toEqual(read({ ...PLAN, priority: "high", target }))
    expect(answer.cached[0]).toEqual(read({ ...PLAN, priority: "high", target }))
    // SWR puts the plan back by itself on a refusal: the hook asks it to, and doesn't read again.
    expect(mutate.mock.calls[0][1]).toMatchObject({ rollbackOnError: true, populateCache: true, revalidate: false })
  })

  it("keeps a change the server took when its answer carries no plan, rather than put the old plan back", async () => {
    answer.current = read(PLAN)
    post.mockResolvedValueOnce({ data: { msg: "ok" } })
    const { result } = renderHook(() => useProjectPlan("p1"))
    await act(() => result.current.save({ priority: "high" }, { priority: "high" }))
    expect(answer.cached[0]).toEqual(read({ ...PLAN, priority: "high" }))
  })

  it("throws a refusal for the caller to say in the server's words", async () => {
    answer.current = read(PLAN, true, true)
    const refused = Object.assign(new Error("400"), { response: { status: 400, data: { msg: "A project's lead is one of its admins or members." } } })
    post.mockRejectedValueOnce(refused)
    const { result } = renderHook(() => useProjectPlan("p1"))
    await expect(result.current.save({ lead_uuid: "u9" }, { lead: { user_uuid: "u9", name: "Oz" } })).rejects.toBe(refused)
  })

  it("reads the workspace's statuses and labels only once a picker asks", () => {
    answer.current = { msg: "ok", data: { categories: [], statuses: null, labels: [{ id: "l1", name: "Q3", color: "sky" }], colors: [] } }
    const { result, rerender } = renderHook(({ on }: { on: boolean }) => usePlanRegistry(on), { initialProps: { on: false } })
    expect(result.current.registry).toBeUndefined()
    expect(result.current.failed).toBe(false)
    rerender({ on: true })
    expect(result.current.registry?.labels?.[0].name).toBe("Q3")
    expect(answer.keys).toContain("/project/plan/registry")
  })

  it("says when that read failed, so a picker offers Try again, which reads it again", () => {
    answer.isError = new Error("offline")
    const { result } = renderHook(() => usePlanRegistry(true))
    expect(result.current.registry).toBeUndefined()
    expect(result.current.failed).toBe(true)
    act(() => result.current.retry())
    expect(mutate).toHaveBeenCalledTimes(1)
  })
})

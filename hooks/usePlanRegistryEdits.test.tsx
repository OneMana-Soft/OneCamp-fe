import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, renderHook } from "@testing-library/react"

// linear-15 head 2b part 2: a workspace admin keeps the plan's statuses and labels from the settings, on the
// registry's routes (POST /project/plan/statuses, /plan/labels and their /{id}/edit and /{id}/delete). The writes
// live in their own module, which only the admin page takes, over the pickers' read (usePlanRegistry).
const answer = vi.hoisted(() => ({ current: undefined as unknown }))
const mutate = vi.hoisted(() => vi.fn(async () => undefined))
const post = vi.hoisted(() => vi.fn<(...args: unknown[]) => Promise<unknown>>(async () => ({ data: { msg: "ok", data: { id: "new" } } })))
vi.mock("@/hooks/useFetch", () => ({
  useFetch: (key: string) => ({ data: key ? answer.current : undefined, mutate, isError: undefined, isLoading: answer.current === undefined }),
}))
vi.mock("@/lib/axiosInstance", async () => (await import("@/lib/testing/axiosInstance")).axiosInstanceModule({ default: { post } }))

import { usePlanRegistryEdits } from "@/hooks/usePlanRegistryEdits"
import { OWN_ERRORS } from "@/lib/http/ownErrors"

afterEach(() => {
  cleanup()
  answer.current = undefined
  mutate.mockClear()
  post.mockClear()
})

const REGISTRY = { categories: [], statuses: [{ id: "s1", name: "Review", color: "violet", category: "in_progress", position: 1 }], labels: [{ id: "l1", name: "Revenue", color: "green" }], colors: ["violet", "green"] }

describe("the workspace's plan statuses and labels, as an admin keeps them (linear-15)", () => {
  it("adds, edits and deletes a status on the registry's routes, in the server's words, and reads the registry again after each", async () => {
    answer.current = { data: REGISTRY }
    const { result } = renderHook(() => usePlanRegistryEdits(true))
    await act(() => result.current.addStatus({ name: "QA", category: "in_progress", color: "violet" }))
    await act(() => result.current.editStatus("s1", { position: 2 }))
    await act(() => result.current.deleteStatus("s1"))
    expect(post.mock.calls).toEqual([
      ["/project/plan/statuses", { name: "QA", category: "in_progress", color: "violet" }, OWN_ERRORS],
      ["/project/plan/statuses/s1/edit", { position: 2 }, OWN_ERRORS],
      ["/project/plan/statuses/s1/delete", {}, OWN_ERRORS],
    ])
    expect(mutate).toHaveBeenCalledTimes(3)
  })

  it("adds, renames and deletes a label the same way", async () => {
    answer.current = { data: REGISTRY }
    const { result } = renderHook(() => usePlanRegistryEdits(true))
    await act(() => result.current.addLabel({ name: "Ops", color: "green" }))
    await act(() => result.current.editLabel("l1", { name: "Growth" }))
    await act(() => result.current.deleteLabel("l1"))
    expect(post.mock.calls).toEqual([
      ["/project/plan/labels", { name: "Ops", color: "green" }, OWN_ERRORS],
      ["/project/plan/labels/l1/edit", { name: "Growth" }, OWN_ERRORS],
      ["/project/plan/labels/l1/delete", {}, OWN_ERRORS],
    ])
    expect(mutate).toHaveBeenCalledTimes(3)
  })

  it("settles a change only once the registry has been read again, so the settings never show the old list", async () => {
    answer.current = { data: REGISTRY }
    let readDone = () => {}
    mutate.mockImplementationOnce(() => new Promise<undefined>((done) => (readDone = () => done(undefined))))
    const { result } = renderHook(() => usePlanRegistryEdits(true))
    let settled = false
    const change = result.current.editLabel("l1", { name: "Growth" }).then(() => (settled = true))
    await vi.waitFor(() => expect(mutate).toHaveBeenCalledTimes(1))
    await Promise.resolve()
    expect(settled).toBe(false)
    readDone()
    await act(() => change)
    expect(settled).toBe(true)
  })

  it("keeps the registry as it was when the server refuses, and hands the refusal back", async () => {
    answer.current = { data: REGISTRY }
    const refusal = Object.assign(new Error("There's a status with that name already."), { response: { status: 400 } })
    post.mockRejectedValueOnce(refusal)
    const { result } = renderHook(() => usePlanRegistryEdits(true))
    await expect(act(() => result.current.addStatus({ name: "Done", category: "done", color: "green" }))).rejects.toBe(refusal)
    expect(mutate).not.toHaveBeenCalled()
  })

  // A status's place is one number across the workspace (the server lists by it), so a category's new order is
  // its statuses trading the places they hold: only the ones that move are sent, and the registry is read once.
  const inProgress = (places: Record<string, number>) =>
    Object.entries(places).map(([id, position]) => ({ id, name: id, color: "amber", category: "in_progress", position }))

  it("puts one category's statuses in a new order by trading their places, and reads the registry once after", async () => {
    answer.current = { data: { ...REGISTRY, statuses: inProgress({ a: 2, b: 5, c: 9 }) } }
    const { result } = renderHook(() => usePlanRegistryEdits(true))
    await act(() => result.current.order(["a", "c", "b"]))
    expect(post.mock.calls).toEqual([
      ["/project/plan/statuses/c/edit", { position: 5 }, OWN_ERRORS],
      ["/project/plan/statuses/b/edit", { position: 9 }, OWN_ERRORS],
    ])
    expect(mutate).toHaveBeenCalledTimes(1)
  })

  it("spreads statuses that share a place up from the lowest, and reads the registry even when the server refuses", async () => {
    answer.current = { data: { ...REGISTRY, statuses: inProgress({ a: 3, b: 3 }) } }
    const gone = Object.assign(new Error("It was deleted a moment ago."), { response: { status: 404 } })
    post.mockRejectedValueOnce(gone)
    const { result } = renderHook(() => usePlanRegistryEdits(true))
    await expect(act(() => result.current.order(["b", "a"]))).rejects.toBe(gone)
    expect(post.mock.calls).toEqual([["/project/plan/statuses/a/edit", { position: 4 }, OWN_ERRORS]])
    expect(mutate).toHaveBeenCalledTimes(1)
  })
})

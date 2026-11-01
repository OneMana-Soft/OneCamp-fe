import { afterEach, describe, expect, it, vi } from "vitest"
import type { ScopedMutator } from "swr"

// The Cycle row's change, which the palette's Move to cycle… makes too (linear-28 H1b): the server's answer is kept
// where the row reads it, without a read, and the project's cycles are counted again. "No cycle" keeps
// { data: null }, as the row always did; a refused move keeps nothing, and the request's own toast says why.
const post = vi.fn()
vi.mock("@/lib/axiosInstance", async () => (await import("@/lib/testing/axiosInstance")).axiosInstanceModule({ default: { post: (...a: unknown[]) => post(...a) } }))

import { pickCycleFor } from "@/components/task/taskCycleField"
import { projectCyclesKey } from "@/hooks/useProjectCycles"
import { ProjectsGet, ProjectsPost } from "@/services/endpoints/projects"

afterEach(() => post.mockReset())

const SPRINT = { id: "c1", name: "Sprint 1", state: "current" }
const rowKey = `${ProjectsGet.GetTaskCycle}/t1`
const mutator = () => vi.fn((..._: unknown[]) => Promise.resolve())

describe("pickCycleFor, the Cycle row's change made from the palette", () => {
  it("keeps the cycle the server answers under the row's key, without a read, then counts the project's cycles again", async () => {
    post.mockResolvedValue({ data: { data: SPRINT } })
    const mutate = mutator()
    await pickCycleFor(mutate as unknown as ScopedMutator, "t1", "p1", "c1")
    expect(post).toHaveBeenCalledWith(ProjectsPost.SetTaskCycle, { task_uuid: "t1", cycle_id: "c1" })
    expect(mutate.mock.calls).toEqual([[rowKey, { data: SPRINT }, { revalidate: false }], [projectCyclesKey("p1")]])
  })

  it("keeps No cycle as { data: null }, the row's own answer, whether the server sends null or nothing", async () => {
    for (const answer of [{ data: null }, {}]) {
      post.mockResolvedValue({ data: answer })
      const mutate = mutator()
      await pickCycleFor(mutate as unknown as ScopedMutator, "t1", "p1", "")
      expect(post).toHaveBeenLastCalledWith(ProjectsPost.SetTaskCycle, { task_uuid: "t1", cycle_id: "" })
      expect(mutate.mock.calls).toEqual([[rowKey, { data: null }, { revalidate: false }], [projectCyclesKey("p1")]])
    }
  })

  it("keeps nothing and counts nothing again when the move is refused", async () => {
    post.mockRejectedValue(new Error("Request failed with status code 403"))
    const mutate = mutator()
    await expect(pickCycleFor(mutate as unknown as ScopedMutator, "t1", "p1", "c1")).resolves.toBeUndefined()
    expect(mutate).not.toHaveBeenCalled()
  })
})

import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, renderHook } from "@testing-library/react"

// What the server answered, fed to the hook as useFetch hands it over.
const answer = vi.hoisted(() => ({ current: undefined as unknown }))
vi.mock("@/hooks/useFetch", () => ({
  useFetch: () => ({ data: answer.current, mutate: vi.fn(), isError: false, isLoading: answer.current === undefined }),
}))

import { useProjectMilestones } from "@/hooks/useProjectMilestones"

afterEach(cleanup)

describe("a project's milestones as the server answers them (V-51)", () => {
  it("reads null for none as none, so the section shows its empty state and its Add", () => {
    // GET /project/{p}/milestones for a project with none, as the live server answered it before it answered [].
    answer.current = { msg: "ok", data: { milestones: null, can_manage: true } }
    const { result } = renderHook(() => useProjectMilestones("p1"))
    expect(result.current.milestones).toEqual([])
    expect(result.current.canManage).toBe(true)
  })

  it("reads an empty list as none too", () => {
    answer.current = { msg: "ok", data: { milestones: [], can_manage: true } }
    expect(renderHook(() => useProjectMilestones("p1")).result.current.milestones).toEqual([])
  })

  it("is not read yet only while nothing has come back", () => {
    answer.current = undefined
    expect(renderHook(() => useProjectMilestones("p1")).result.current.milestones).toBeUndefined()
  })
})

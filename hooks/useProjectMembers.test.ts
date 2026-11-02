import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, renderHook } from "@testing-library/react"

// The one read of a project's members for its pickers (linear-15; main, 2 Nov 21:2x). A picker reads them as it
// opens, under the key the project page reads them by at a laptop's width (its member stack), so an answer the page
// already read serves the picker and nothing is fetched twice.

const read = vi.hoisted(() => ({ calls: [] as unknown[][], data: undefined as unknown, isError: undefined as unknown, mutate: vi.fn() }))
vi.mock("@/hooks/useFetch", () => ({
  useFetch: (...args: unknown[]) => {
    read.calls.push(args)
    return { data: read.data, isError: read.isError, isLoading: false, mutate: read.mutate }
  },
}))

import { projectMembersKey, useProjectMembers } from "@/hooks/useProjectMembers"
import { ProjectsGet } from "@/services/endpoints/projects"

const OZ = { user_uuid: "u-oz", user_name: "Oz Ito" }

afterEach(() => {
  cleanup()
  read.calls = []
  read.data = undefined
  read.isError = undefined
  read.mutate.mockClear()
})

describe("a project's members, read for a picker (linear-15)", () => {
  it("reads /project/membersInfo under the key the project page reads it by, and nothing without a project", () => {
    expect(projectMembersKey("p1")).toBe(`${ProjectsGet.GetProjectMemberInfo}/p1`)
    expect(projectMembersKey("p1")).toBe("/project/membersInfo/p1")
    const { rerender } = renderHook(({ id }: { id?: string }) => useProjectMembers(id), { initialProps: {} })
    expect(read.calls.at(-1)?.[0]).toBe("")
    rerender({ id: "p1" })
    expect(read.calls.at(-1)?.[0]).toBe("/project/membersInfo/p1")
  })

  it("lets an answer already read serve the picker, never asking for it again as the picker opens", () => {
    renderHook(() => useProjectMembers("p1"))
    expect(read.calls.at(-1)?.[2]).toMatchObject({ revalidateIfStale: false })
  })

  it("has no members until they are read, and an answer that lists none is an empty list", () => {
    const { result, rerender } = renderHook(() => useProjectMembers("p1"))
    expect(result.current.members).toBeUndefined()
    expect(result.current.failed).toBe(false)
    read.data = { data: { project_members: null } }
    rerender()
    expect(result.current.members).toEqual([])
    read.data = { data: { project_members: [OZ] } }
    rerender()
    expect(result.current.members).toEqual([OZ])
  })

  it("says a failed read only while nothing read earlier stands in, and Try again reads again", () => {
    read.isError = new Error("offline")
    const { result, rerender } = renderHook(() => useProjectMembers("p1"))
    expect(result.current.failed).toBe(true)
    act(() => result.current.retry())
    expect(read.mutate).toHaveBeenCalledTimes(1)
    read.data = { data: { project_members: [OZ] } }
    rerender()
    expect(result.current.failed).toBe(false)
    expect(result.current.members).toEqual([OZ])
  })
})

import { describe, expect, it, vi } from "vitest"
import { renderHook } from "@testing-library/react"

// A field added to a project: a formula has a value on every task the moment it exists (the server works it out on
// each read), so what the app holds of the project's tasks, the open task's panel too, is read again.
const post = vi.fn(() => Promise.resolve({ data: { data: { id: "f1" } } }))
const mutateAll = vi.fn<(match: (key: unknown) => boolean) => Promise<void>>(() => Promise.resolve())
vi.mock("@/lib/axiosInstance", async () => (await import("@/lib/testing/axiosInstance")).axiosInstanceModule({ default: { post: (...a: unknown[]) => post(...(a as [])) } }))
vi.mock("swr", async (real) => ({ ...(await real<typeof import("swr")>()), useSWRConfig: () => ({ mutate: mutateAll }) }))
vi.mock("@/hooks/useFetch", () => ({ useFetch: () => ({ data: { data: { fields: [], can_edit: true } }, isLoading: false, isError: false, mutate: () => Promise.resolve() }) }))

const { useProjectFields } = await import("@/hooks/useProjectFields")

describe("adding a field", () => {
  it("reads the project's tasks again, the open task's too, when the field is a formula", async () => {
    const { result } = renderHook(() => useProjectFields("p1"))
    await result.current.create({ name: "Days left", type: "formula", formula: 'DATETIME_DIFF({Due}, TODAY(), "days")' })
    expect(mutateAll).toHaveBeenCalledTimes(1)
    const reads = mutateAll.mock.calls[0][0]
    expect(reads("/task/info/t1")).toBe(true)
    expect(reads("/project/taskList/p1?page=1")).toBe(true)
  })

  it("reads nothing again for a field no task holds a value of yet", async () => {
    mutateAll.mockClear()
    const { result } = renderHook(() => useProjectFields("p1"))
    await result.current.create({ name: "Channel", type: "text" })
    expect(mutateAll).not.toHaveBeenCalled()
  })
})

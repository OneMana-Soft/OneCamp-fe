import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, renderHook, waitFor } from "@testing-library/react"

// A link's new-task fields load their parser only when the link names some,
// and the form waits for them, so it starts from what they name.

const toast = vi.hoisted(() => vi.fn())
vi.mock("@/hooks/use-toast", () => ({ toast }))

afterEach(() => {
  cleanup()
  vi.doUnmock("@/lib/task/newTaskAddress")
  vi.resetModules()
  toast.mockClear()
})

const hook = async () => (await import("./useTaskAddress")).useTaskAddress

describe("a link's new-task fields, for the New task form", () => {
  it("are ready at once when the link names none, with nothing loaded", async () => {
    vi.doMock("@/lib/task/newTaskAddress", () => {
      throw new Error("loaded")
    })
    const useTaskAddress = await hook()
    const { result } = renderHook(() => useTaskAddress(""))
    expect(result.current).toEqual({ ready: true })
    expect(toast).not.toHaveBeenCalled()
  })

  it("keep the form waiting until the parser has placed them, and again for another link", async () => {
    const useTaskAddress = await hook()
    const { result, rerender } = renderHook(({ query }) => useTaskAddress(query), { initialProps: { query: "title=Ship+it&project=q4" } })
    expect(result.current.ready).toBe(false)
    await waitFor(() => expect(result.current.ready).toBe(true))
    expect(result.current.address).toMatchObject({ name: "Ship it", project: "q4" })

    rerender({ query: "title=Next+one" })
    expect(result.current.ready).toBe(false)
    await waitFor(() => expect(result.current.address?.name).toBe("Next one"))
    expect(result.current.ready).toBe(true)
  })

  it("open the form empty, and say why, when the parser can't load", async () => {
    vi.doMock("@/lib/task/newTaskAddress", () => {
      throw new Error("chunk")
    })
    const useTaskAddress = await hook()
    const { result } = renderHook(() => useTaskAddress("title=Ship+it"))
    await waitFor(() => expect(result.current.ready).toBe(true))
    expect(result.current.address).toBeUndefined()
    expect(toast).toHaveBeenCalledTimes(1)
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ variant: "destructive", title: "The link's fields didn't load" }))
  })
})

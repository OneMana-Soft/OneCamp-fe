import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, renderHook } from "@testing-library/react"

// What the server answered, fed to the hook as useFetch hands it over, and what it was sent.
const answer = vi.hoisted(() => ({ current: undefined as unknown, isError: undefined as unknown, mutate: vi.fn() }))
const post = vi.hoisted(() => vi.fn(async () => ({ data: { msg: "ok" } })))
vi.mock("@/hooks/useFetch", () => ({
  useFetch: (key: string) => ({ data: key ? answer.current : undefined, mutate: answer.mutate, isError: answer.isError, isLoading: answer.current === undefined }),
}))
vi.mock("@/lib/axiosInstance", async () => (await import("@/lib/testing/axiosInstance")).axiosInstanceModule({ default: { post } }))

import { useProjectLinks } from "@/hooks/useProjectLinks"
import { OWN_ERRORS } from "@/lib/http/ownErrors"
import { pinTestClock } from "@/lib/testing/testClock"

// A link carries the day it was added, so every test runs on the one test day (app/testClock.test.ts).
pinTestClock()

afterEach(() => {
  cleanup()
  answer.current = undefined
  answer.isError = undefined
  answer.mutate.mockClear()
  post.mockClear()
})

const LINK = { id: "l1", url: "https://www.figma.com/file/abc", host: "www.figma.com", title: "Launch designs", description: "", site_name: "Figma", has_icon: true, has_image: false, created_at: "2026-10-14T07:00:00Z" }

describe("a project's links as the server answers them (basecamp-16)", () => {
  it("reads null for none as none, and says whether the reader may change them", () => {
    answer.current = { msg: "ok", data: { links: null, can_manage: true } }
    const { result } = renderHook(() => useProjectLinks("p1"))
    expect(result.current.links).toEqual([])
    expect(result.current.canManage).toBe(true)
  })

  it("lists the links in the server's order, which a member may not change", () => {
    answer.current = { msg: "ok", data: { links: [LINK, { ...LINK, id: "l2" }], can_manage: false } }
    const { result } = renderHook(() => useProjectLinks("p1"))
    expect(result.current.links?.map((l) => l.id)).toEqual(["l1", "l2"])
    expect(result.current.canManage).toBe(false)
  })

  it("is not read yet while nothing has come back, and failed only when a read failed with nothing to show", () => {
    const { result, rerender } = renderHook(() => useProjectLinks("p1"))
    expect(result.current.links).toBeUndefined()
    expect(result.current.failed).toBe(false)
    answer.isError = new Error("offline")
    rerender()
    expect(result.current.failed).toBe(true)
    // A list read earlier stays on screen through a later failed read.
    answer.current = { msg: "ok", data: { links: [LINK], can_manage: true } }
    rerender()
    expect(result.current.failed).toBe(false)
  })

  it("asks for nothing without a project", () => {
    answer.current = { msg: "ok", data: { links: [LINK], can_manage: true } }
    expect(renderHook(() => useProjectLinks(undefined)).result.current.links).toBeUndefined()
  })
})

describe("what a project's admins do with its links", () => {
  it("adds a link by its address, with a title when one is given, and reads the list again", async () => {
    answer.current = { msg: "ok", data: { links: [], can_manage: true } }
    const { result } = renderHook(() => useProjectLinks("p1"))
    await act(() => result.current.add("https://www.figma.com/file/abc"))
    expect(post).toHaveBeenLastCalledWith("/project/p1/links", { url: "https://www.figma.com/file/abc", title: "" }, OWN_ERRORS)
    await act(() => result.current.add("https://github.com/acme/site", "Site repo"))
    expect(post).toHaveBeenLastCalledWith("/project/p1/links", { url: "https://github.com/acme/site", title: "Site repo" }, OWN_ERRORS)
    expect(answer.mutate).toHaveBeenCalledTimes(2)
  })

  it("renames and deletes a link at its own address", async () => {
    answer.current = { msg: "ok", data: { links: [LINK], can_manage: true } }
    const { result } = renderHook(() => useProjectLinks("p1"))
    await act(() => result.current.rename("l1", "Designs"))
    expect(post).toHaveBeenLastCalledWith("/project/p1/links/l1/edit", { title: "Designs" }, OWN_ERRORS)
    await act(() => result.current.remove("l1"))
    expect(post).toHaveBeenLastCalledWith("/project/p1/links/l1/delete", {}, OWN_ERRORS)
  })

  it("passes a refusal on with the server's words, and reads nothing again", async () => {
    answer.current = { msg: "ok", data: { links: [LINK], can_manage: true } }
    const refusal = Object.assign(new Error("Request failed with status code 409"), { response: { status: 409, data: { msg: "This project has a link to that address already." } } })
    post.mockRejectedValueOnce(refusal)
    const { result } = renderHook(() => useProjectLinks("p1"))
    await expect(result.current.add(LINK.url)).rejects.toBe(refusal)
    expect(answer.mutate).not.toHaveBeenCalled()
  })
})

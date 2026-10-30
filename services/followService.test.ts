import { afterEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/axiosInstance", async () => (await import("@/lib/testing/axiosInstance")).axiosInstanceModule({
  default: { put: vi.fn(), delete: vi.fn() },
}))
vi.mock("@/lib/swrMutate", () => ({ patchCached: vi.fn() }))

import axiosInstance from "@/lib/axiosInstance"
import { patchCached } from "@/lib/swrMutate"
import { FOLLOW_MODES, followUrl, setFollow } from "./followService"

const put = axiosInstance.put as unknown as ReturnType<typeof vi.fn>
const del = axiosInstance.delete as unknown as ReturnType<typeof vi.fn>

afterEach(() => vi.clearAllMocks())

describe("following a page", () => {
  it("chooses a mode, or forgets the choice, and writes the answer into the cache", async () => {
    const state = { resource_kind: "doc", resource_uuid: "d1", mode: "all", chosen: true, default: "mentions" }
    put.mockResolvedValueOnce({ data: { msg: "ok", data: state } })
    expect(await setFollow("d1", "all")).toEqual(state)
    expect(put).toHaveBeenCalledWith("/follows", { resource_kind: "doc", resource_uuid: "d1", mode: "all" })
    expect(patchCached).toHaveBeenCalledWith(followUrl("d1"), expect.any(Function))

    del.mockResolvedValueOnce({ data: { msg: "ok", data: { ...state, mode: "mentions", chosen: false } } })
    await setFollow("d1", null)
    expect(del).toHaveBeenCalledWith("/follows?resource_kind=doc&resource_uuid=d1")
  })

  it("offers the three modes, in words", () => {
    expect(FOLLOW_MODES.map((m) => m.label)).toEqual(["All activity", "Replies and mentions", "Only @mentions"])
    expect(followUrl("")).toBe("")
  })
})

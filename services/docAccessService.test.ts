import { beforeEach, describe, expect, it, vi } from "vitest"

const post = vi.fn(async () => ({ data: { data: {} } }))
const get = vi.fn(async () => ({ data: { data: {} } }))
vi.mock("@/lib/axiosInstance", async () => (await import("@/lib/testing/axiosInstance")).axiosInstanceModule({
  default: { post: (...a: unknown[]) => post(...(a as [])), get: (...a: unknown[]) => get(...(a as [])), delete: vi.fn() },
}))
const mutate = vi.fn()
vi.mock("@/lib/swrMutate", () => ({ appMutate: (...a: unknown[]) => mutate(...a), patchCached: vi.fn() }))
vi.mock("@/services/docGraphService", () => ({ refreshDocGraph: vi.fn() }))

import {
  accessRequestsKey,
  answerDocAccess,
  docAccessKey,
  getAccessRequests,
  getDocAccess,
  lockDoc,
  requestDocAccess,
  transferDoc,
  updateDocAccess,
} from "@/services/docAccessService"

describe("the doc access calls", () => {
  beforeEach(() => {
    post.mockClear()
    get.mockClear()
    mutate.mockClear()
  })

  it("read my access and the requests by the keys their answers live under", async () => {
    await getDocAccess("d1")
    expect(get).toHaveBeenLastCalledWith("/doc/access/d1")
    expect(docAccessKey("d1")).toBe("/doc/access/d1")
    await getAccessRequests("d 1")
    expect(get).toHaveBeenLastCalledWith("/doc/access/requests?doc_uuid=d%201")
    expect(accessRequestsKey()).toBe("/doc/access/requests")
  })

  it("send a change as the server reads it, and ask again for what it moves", async () => {
    await updateDocAccess({
      doc_uuid: "d1",
      adds: [{ kind: "team", uuid: "t1", level: "edit", until: "2026-11-01T00:00:00Z" }],
      general: { level: "none" },
      guest_links: "keep",
    })
    expect(post).toHaveBeenLastCalledWith("/doc/access/update", {
      doc_uuid: "d1",
      adds: [{ kind: "team", uuid: "t1", level: "edit", until: "2026-11-01T00:00:00Z" }],
      general: { level: "none" },
      guest_links: "keep",
    })
    const moved = mutate.mock.calls.at(-1)?.[0] as (key: unknown) => boolean
    expect(moved("/doc/access/d1")).toBe(true)
    expect(moved("/doc/access/requests?doc_uuid=d1")).toBe(true)
    expect(moved("/doc/access/d2")).toBe(false)
  })

  it("asks again even when a change fails", async () => {
    post.mockRejectedValueOnce(new Error("403"))
    await expect(transferDoc("d1", "u2")).rejects.toThrow("403")
    expect(post).toHaveBeenLastCalledWith("/doc/access/transfer", { doc_uuid: "d1", to_user_uuid: "u2" })
    expect(mutate).toHaveBeenCalled()
  })

  it("lifts a lock as none, and answers a request by its id", async () => {
    await lockDoc("d1", "")
    expect(post).toHaveBeenLastCalledWith("/doc/lock", { doc_uuid: "d1", lock: "none" })
    await requestDocAccess("d1")
    expect(post).toHaveBeenLastCalledWith("/doc/access/request", { doc_uuid: "d1", level: "view", note: "" })
    await answerDocAccess({ id: "r1", doc_uuid: "d1" }, { approve: true, level: "comment" })
    expect(post).toHaveBeenLastCalledWith("/doc/access/answer", { request_id: "r1", approve: true, level: "comment" })
  })
})

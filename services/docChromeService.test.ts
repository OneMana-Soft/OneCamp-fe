import { beforeEach, describe, expect, it, vi } from "vitest"

const hoisted = vi.hoisted(() => ({ post: vi.fn(), get: vi.fn(), patched: [] as unknown[], mutated: [] as unknown[], graph: vi.fn() }))

vi.mock("@/lib/axiosInstance", () => ({ default: { post: hoisted.post, get: hoisted.get } }))
vi.mock("@/lib/swrMutate", () => ({
  appMutate: (k: unknown) => {
    hoisted.mutated.push(k)
    return Promise.resolve()
  },
  patchCached: (k: string, update: (d: unknown) => unknown) => {
    hoisted.patched.push(update({ msg: "ok", data: { doc_uuid: "d1", doc_title: "Plan", doc_icon: "📘", doc_cover_key: "gallery:sky", doc_cover_offset: 20 } }))
  },
}))
vi.mock("@/services/docGraphService", () => ({ refreshDocGraph: hoisted.graph }))

import { inviteToDoc, lookFields, searchDocs, searchPeople, setDocLook } from "./docChromeService"

beforeEach(() => {
  hoisted.post.mockReset()
  hoisted.patched.length = 0
  hoisted.mutated.length = 0
  hoisted.graph.mockReset()
})

describe("a doc's look, as its cached answer holds it", () => {
  it("sets what is given and takes away what is emptied, a cover's position with it", () => {
    expect(lookFields({ icon: "🚀", full_width: true })).toEqual({ set: { doc_icon: "🚀", doc_full_width: true }, drop: [] })
    expect(lookFields({ icon: "", cover: "" })).toEqual({ set: {}, drop: ["doc_icon", "doc_cover_key", "doc_cover_offset"] })
    expect(lookFields({ cover: "gallery:dusk", cover_offset: 30, font: "", small_text: false })).toEqual({
      set: { doc_cover_key: "gallery:dusk", doc_cover_offset: 30, doc_small_text: false },
      drop: ["doc_font"],
    })
  })

  it("shows a change at once, then saves it; the tree hears of a new icon", async () => {
    hoisted.post.mockResolvedValue({ data: { data: {} } })
    await setDocLook({ doc_uuid: "d1", icon: "", cover: "" })
    expect(hoisted.patched).toEqual([{ msg: "ok", data: { doc_uuid: "d1", doc_title: "Plan" } }])
    expect(hoisted.post).toHaveBeenCalledWith("/doc/look", { doc_uuid: "d1", icon: "", cover: "" })
    expect(hoisted.graph).toHaveBeenCalled()
  })

  it("asks for the doc again when the save fails, so the screen says what the server has", async () => {
    hoisted.post.mockRejectedValue(new Error("no"))
    await expect(setDocLook({ doc_uuid: "d1", font: "serif" })).rejects.toThrow("no")
    expect(hoisted.mutated).toContain("/doc/getDocInfo/d1")
  })
})

describe("the searches", () => {
  it("keeps the docs a workspace search found, once each", async () => {
    hoisted.post.mockResolvedValue({
      data: { data: { page: [
        { type: "doc", doc: { doc_uuid: "a", doc_title: "RFCs" } },
        { type: "task", task: { task_uuid: "t" } },
        { type: "doc", doc: { doc_uuid: "a", doc_title: "RFCs" } },
        { type: "doc", doc: { doc_uuid: "b" } },
      ] } },
    })
    expect(await searchDocs("rf")).toEqual([
      { doc_uuid: "a", doc_title: "RFCs", doc_icon: undefined },
      { doc_uuid: "b", doc_title: "", doc_icon: undefined },
    ])
  })

  it("reads people from either shape the server answers with", async () => {
    hoisted.post.mockResolvedValueOnce({ data: { data: [{ user_uuid: "u1" }] } }).mockResolvedValueOnce({ data: [{ user_uuid: "u2" }] }).mockResolvedValueOnce({ data: { msg: "none" } })
    expect(await searchPeople("a")).toEqual([{ user_uuid: "u1" }])
    expect(await searchPeople("b")).toEqual([{ user_uuid: "u2" }])
    expect(await searchPeople("c")).toEqual([])
  })
})

describe("an editor's invite", () => {
  it("goes to the invite route, and the doc's access and requests are asked for again either way", async () => {
    hoisted.post.mockRejectedValue(new Error("refused"))
    await expect(inviteToDoc({ doc_uuid: "d1", adds: [{ kind: "user", uuid: "u1", level: "view" }] })).rejects.toThrow("refused")
    expect(hoisted.post).toHaveBeenCalledWith("/doc/access/invite", { doc_uuid: "d1", adds: [{ kind: "user", uuid: "u1", level: "view" }] })
    const asked = hoisted.mutated[0] as (k: unknown) => boolean
    expect(asked("/doc/access/d1")).toBe(true)
    expect(asked("/doc/access/requests?doc_uuid=d1")).toBe(true)
    expect(asked("/doc/access/d2")).toBe(false)
  })
})

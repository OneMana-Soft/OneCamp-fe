import { beforeEach, describe, expect, it, vi } from "vitest"

const warmed: string[] = []
const fetched: string[] = []
const mutations: Array<{ key: string; next: unknown }> = []
let cached: unknown = undefined
vi.mock("@/lib/collabSession", () => {
  const last = new Map<string, number>()
  return {
    prefetchCollabSession: (name: string) => {
      if (last.has(name)) return false
      last.set(name, Date.now())
      warmed.push(name)
      return true
    },
  }
})
vi.mock("@/lib/axiosInstance", async () => (await import("@/lib/testing/axiosInstance")).axiosInstanceModule({
  default: { get: async (url: string) => (fetched.push(url), { data: { data: { doc_uuid: url.split("/").pop() } } }) },
}))
vi.mock("@/lib/swrMutate", () => ({
  appMutate: async (key: string, fn: (current: unknown) => unknown) => mutations.push({ key, next: fn(cached) }),
  cachedData: () => cached,
}))

import { prefetchDoc } from "@/lib/docPrefetch"

beforeEach(() => {
  fetched.length = 0
  mutations.length = 0
  cached = undefined
})

describe("prefetching a doc", () => {
  it("starts its session and fills the cache the page reads, once a minute", async () => {
    expect(prefetchDoc("doc-a")).toBe(true)
    await vi.waitFor(() => expect(mutations).toHaveLength(1))
    expect(warmed).toContain("doc-a")
    expect(fetched).toEqual(["/doc/getDocInfo/doc-a"])
    expect(mutations[0]).toEqual({ key: "/doc/getDocInfo/doc-a", next: { data: { doc_uuid: "doc-a" } } })
    expect(prefetchDoc("doc-a")).toBe(false)
    expect(fetched).toHaveLength(1)
  })

  it("keeps an answer the page already has", async () => {
    cached = { data: { doc_uuid: "doc-b", doc_title: "fresher" } }
    prefetchDoc("doc-b")
    await vi.waitFor(() => expect(mutations).toHaveLength(1))
    expect(mutations[0].next).toBe(cached)
  })

  it("starts no live session for a folder, a file or a link the app knows is one: it has none (docs F1b)", () => {
    cached = { data: { doc_uuid: "folder-1", doc_node_kind: "folder" } }
    expect(prefetchDoc("folder-1")).toBe(false)
    expect(warmed).not.toContain("folder-1")
    expect(fetched).toEqual([])
  })

  it("does nothing without a doc", () => {
    expect(prefetchDoc("")).toBe(false)
  })
})

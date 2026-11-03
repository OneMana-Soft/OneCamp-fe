import { describe, expect, it } from "vitest"
import { projectStatusesKey } from "@/lib/projectStatusesKey"
import { placeLists, placePaths, type KeepHttp } from "@/lib/work/taskTemplatesKeep"

// This edition's template editor reads a place's fields, people and statuses, and nothing for the workspace's. A list
// this install doesn't serve (501, "not on this build") reads as none and says nothing failed; a list that fails in
// passing still says so.
function server(statusOf: (path: string) => number, asked: string[] = []): KeepHttp {
  return {
    get: async <T>(path: string) => {
      asked.push(path)
      const status = statusOf(path)
      if (status !== 200) throw Object.assign(new Error(`HTTP ${status}`), { response: { status } })
      return { data: { data: [] } as T }
    },
    post: async () => {
      throw new Error("the lists only read")
    },
  }
}

describe("placeLists", () => {
  it("reads a project's fields, people and statuses, and nothing more", async () => {
    const asked: string[] = []
    const lists = await placeLists(server(() => 200, asked), "p")
    expect([...asked].sort()).toEqual([placePaths.fields("p"), placePaths.people("p"), projectStatusesKey("p")].sort())
    expect(lists.teammates).toEqual([])
    expect(lists.partial).toBe(false)
  })

  it("reads nothing for the workspace's templates", async () => {
    const asked: string[] = []
    const lists = await placeLists(server(() => 200, asked))
    expect(asked).toEqual([])
    expect(lists).toMatchObject({ fields: [], people: [], teammates: [], statuses: null, partial: false })
  })

  it("reads a list the install doesn't serve (501) as none, and says nothing failed", async () => {
    const lists = await placeLists(server((path) => (path === placePaths.fields("p") ? 501 : 200)), "p")
    expect(lists.fields).toEqual([])
    expect(lists.partial).toBe(false)
  })

  it("says a list didn't load when it fails in passing", async () => {
    const lists = await placeLists(server((path) => (path === placePaths.fields("p") ? 503 : 200)), "p")
    expect(lists.fields).toEqual([])
    expect(lists.partial).toBe(true)
  })
})

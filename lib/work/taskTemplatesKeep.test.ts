import { describe, expect, it } from "vitest"
import { placeLists, placePaths, type KeepHttp } from "@/lib/work/taskTemplatesKeep"

// The AI-free edition has no AI teammates: its server answers their read with 501 ("not on this build"). The template
// editor then lists none and says nothing failed. A list that fails in passing still says so.
function server(statusOf: (path: string) => number): KeepHttp {
  return {
    get: async <T>(path: string) => {
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
  it("reads a list the install doesn't serve (501) as none, and says nothing failed", async () => {
    const lists = await placeLists(server((path) => (path === placePaths.teammates ? 501 : 200)), "p")
    expect(lists.teammates).toEqual([])
    expect(lists.partial).toBe(false)
  })

  it("says a list didn't load when it fails in passing", async () => {
    const lists = await placeLists(server((path) => (path === placePaths.teammates ? 503 : 200)), "p")
    expect(lists.teammates).toEqual([])
    expect(lists.partial).toBe(true)
  })
})

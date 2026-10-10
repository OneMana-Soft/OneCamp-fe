import { describe, expect, it } from "vitest"
import type { SearchResult } from "@/services/searchService"
import { searchResultKeys } from "./search"

// The top bar's results were keyed by position, so a refined query, which
// reorders them, re-rendered every row as another hit. Keys follow the hit.
describe("search result keys", () => {
  const doc = (id: string) => ({ type: "doc", doc: { doc_uuid: id } }) as SearchResult
  const task = (id: string) => ({ type: "task", task: { task_id: id } }) as SearchResult

  it("follow the hit when the order changes", () => {
    const first = searchResultKeys([doc("a"), task("b")])
    const second = searchResultKeys([task("b"), doc("a")])
    expect(second).toEqual([first[1], first[0]])
  })

  it("stay unique for a hit listed twice or one with no id", () => {
    const keys = searchResultKeys([doc("a"), doc("a"), { type: "user" } as SearchResult])
    expect(new Set(keys).size).toBe(3)
  })
})

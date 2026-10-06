import { describe, expect, it } from "vitest"
import { keepRecentlyLoaded } from "./recentlyLoaded"

describe("keepRecentlyLoaded", () => {
  it("forgets the conversation loaded least recently beyond the limit", () => {
    const lists: Record<string, number[]> = { a: [1], b: [2], c: [3] }
    const order: string[] = []
    for (const id of ["a", "b", "c"]) keepRecentlyLoaded(lists, order, id, 3)
    keepRecentlyLoaded(lists, order, "a", 3) // a again: now the most recent
    lists.d = [4]
    keepRecentlyLoaded(lists, order, "d", 3)
    expect(order).toEqual(["c", "a", "d"])
    expect(Object.keys(lists).sort()).toEqual(["a", "c", "d"])
  })
})

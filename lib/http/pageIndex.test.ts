import { describe, expect, it, vi } from "vitest"
import { readEveryByIndex } from "./pageIndex"

// A list paged by index, as the server's helpers.ListPaging answers it.
const list = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `t${i}` }))
const pagedBy = (all: { id: string }[]) => vi.fn(async (pageIndex: number, pageSize: number) => all.slice(pageIndex * pageSize, (pageIndex + 1) * pageSize))

describe("reading every page of a list paged by index", () => {
  it("asks page after page, each a whole page, until one comes back short", async () => {
    const read = pagedBy(list(250))
    const { items, ended } = await readEveryByIndex(read, { pageSize: 100, maxPages: 50, key: (t) => t.id })
    expect(read.mock.calls).toEqual([[0, 100], [1, 100], [2, 100]])
    expect(items).toHaveLength(250)
    expect(ended).toBe(true)
  })

  it("keeps an item two pages both gave once, and leaves out one without a key", async () => {
    const read = vi.fn(async (pageIndex: number) => (pageIndex === 0 ? [{ id: "a" }, { id: "b" }] : [{ id: "b" }, { id: "" }]))
    const { items } = await readEveryByIndex(read, { pageSize: 2, maxPages: 5, key: (t) => t.id })
    expect(items.map((t) => t.id)).toEqual(["a", "b"])
  })

  it("stops at its last page, and says the list went on", async () => {
    const read = pagedBy(list(30))
    const { items, ended } = await readEveryByIndex(read, { pageSize: 10, maxPages: 2, key: (t) => t.id })
    expect(read).toHaveBeenCalledTimes(2)
    expect(items).toHaveLength(20)
    expect(ended).toBe(false)
  })
})

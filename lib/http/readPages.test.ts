import { describe, expect, it, vi } from "vitest"
import { readPages } from "@/lib/http/readPages"

/** A list of n numbers the way an offset/limit endpoint answers it. */
const listOf = (n: number) => vi.fn(async (offset: number, limit: number) => Array.from({ length: Math.max(0, Math.min(limit, n - offset)) }, (_, i) => offset + i))

describe("reading a paged list", () => {
  it("reads page after page until one comes back short, and says it reached the end", async () => {
    const read = listOf(2500)
    const { items, ended } = await readPages(read, { pageSize: 1000 })
    expect(items).toHaveLength(2500)
    expect(items[2499]).toBe(2499)
    expect(ended).toBe(true)
    expect(read.mock.calls).toEqual([
      [0, 1000],
      [1000, 1000],
      [2000, 1000],
    ])
  })

  it("stops at the offset asked for, without saying the list ended", async () => {
    const read = listOf(5000)
    const { items, ended } = await readPages(read, { pageSize: 500, from: 500, to: 1200 })
    expect(items[0]).toBe(500)
    expect(items).toHaveLength(700)
    expect(ended).toBe(false)
    expect(read.mock.calls).toEqual([
      [500, 500],
      [1000, 200],
    ])
  })

  it("asks for at most `concurrency` pages at once, keeping their order", async () => {
    let inFlight = 0
    let most = 0
    const read = vi.fn(async (offset: number, limit: number) => {
      inFlight++
      most = Math.max(most, inFlight)
      await new Promise((r) => setTimeout(r, offset % 3))
      inFlight--
      return Array.from({ length: Math.min(limit, 1800 - offset) }, (_, i) => offset + i)
    })
    const { items } = await readPages(read, { pageSize: 100, concurrency: 4 })
    expect(most).toBeLessThanOrEqual(4)
    expect(items).toEqual(Array.from({ length: 1800 }, (_, i) => i))
  })

  it("says how many it has read after each round", async () => {
    const progress = vi.fn()
    await readPages(listOf(250), { pageSize: 100, onProgress: progress })
    expect(progress.mock.calls.map((c) => c[0])).toEqual([100, 200, 250])
  })

  it("stops when asked to", async () => {
    const stop = new AbortController()
    const read = vi.fn(async (offset: number) => {
      if (offset >= 100) stop.abort()
      return Array.from({ length: 100 }, (_, i) => offset + i)
    })
    await expect(readPages(read, { pageSize: 100, signal: stop.signal })).rejects.toThrow("stopped")
    expect(read).toHaveBeenCalledTimes(2)
  })
})

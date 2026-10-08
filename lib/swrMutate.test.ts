import { afterEach, describe, expect, it, vi } from "vitest"
import { appMutate, bindAppMutate, patchCached } from "./swrMutate"

// Code outside components (MQTT handlers, services) must revalidate the app's
// own cache, not SWR's default one, or live updates change nothing on screen.
describe("appMutate", () => {
  it("calls the mutate bound to the app's cache provider", async () => {
    const bound = vi.fn().mockResolvedValue(undefined)
    bindAppMutate(bound as never)
    await appMutate("/poll/abc")
    expect(bound).toHaveBeenCalledWith("/poll/abc")
    bindAppMutate(null)
  })
})

// SWR drops a response whose entry changed while it was on its way, so a
// correction must never land on one that hasn't arrived, and must ask again for
// one it would replace.
describe("patchCached", () => {
  type Entry = { data?: { n: number }; isValidating?: boolean }
  const setup = (entries: Record<string, Entry>) => {
    const cache = new Map(Object.entries(entries))
    const mutate = vi.fn(async (key: string, updater: (d: { n: number } | undefined) => unknown) => {
      const e = cache.get(key)
      if (e) cache.set(key, { ...e, data: updater(e.data) as { n: number } })
    })
    bindAppMutate(mutate as never, cache as never)
    return { cache, mutate }
  }
  const zero = (d: { n: number }) => ({ ...d, n: 0 })

  afterEach(() => bindAppMutate(null))

  it("corrects a response in hand without fetching it again", () => {
    const { cache, mutate } = setup({ "/a": { data: { n: 3 } } })
    patchCached("/a", zero)
    expect(cache.get("/a")?.data?.n).toBe(0)
    expect(mutate).toHaveBeenCalledWith("/a", expect.any(Function), { revalidate: false })
  })

  it("leaves an entry whose first response is on its way to arrive", () => {
    const { mutate } = setup({ "/a": { isValidating: true } })
    patchCached("/a", zero)
    patchCached("/missing", zero)
    expect(mutate).not.toHaveBeenCalled()
  })

  it("corrects an entry being fetched again, and asks again, as its answer is dropped", () => {
    const { cache, mutate } = setup({ "/a": { data: { n: 3 }, isValidating: true } })
    patchCached("/a", zero)
    expect(cache.get("/a")?.data?.n).toBe(0)
    expect(mutate).toHaveBeenCalledWith("/a", expect.any(Function), { revalidate: true })
  })

  it("corrects every page a test over keys matches, and nothing else", () => {
    const { cache } = setup({ "/list?page=0": { data: { n: 1 } }, "/list?page=1": { data: { n: 2 } }, "/other": { data: { n: 5 } } })
    patchCached((k) => k.startsWith("/list"), zero)
    expect([...cache.values()].map((e) => e.data?.n)).toEqual([0, 0, 5])
  })

  it("does nothing before the app's cache is bound", () => {
    const mutate = vi.fn()
    bindAppMutate(mutate as never)
    patchCached("/a", zero)
    expect(mutate).not.toHaveBeenCalled()
  })
})

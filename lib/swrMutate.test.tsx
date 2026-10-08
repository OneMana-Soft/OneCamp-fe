import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, render, screen, waitFor } from "@testing-library/react"
import { useEffect } from "react"
import useSWR, { SWRConfig } from "swr"
import { SWRMutateBridge } from "@/components/providers/SWRMutateBridge"
import { appMutate, bindAppMutate, dataToSeed, patchCached } from "./swrMutate"

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

type N = { n: number }
const zero = (d: N) => (d.n ? { ...d, n: 0 } : d)

// SWR drops a response whose entry changed while it was on its way, so a
// correction must never land on one that hasn't arrived, and must ask again for
// one it would replace.
describe("patchCached", () => {
  type Entry = { data?: N; isValidating?: boolean }
  const setup = (entries: Record<string, Entry>) => {
    const cache = new Map(Object.entries(entries))
    const mutate = vi.fn(async (key: string, updater: (d: N | undefined) => unknown) => {
      const e = cache.get(key)
      if (e) cache.set(key, { ...e, data: updater(e.data) as N })
    })
    bindAppMutate(mutate as never, cache as never)
    return { cache, mutate }
  }

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

  // A correction that changes nothing would still have SWR drop an answer on
  // its way, and hand every reader a new object.
  it("does nothing when there's nothing to correct", () => {
    const { mutate } = setup({ "/a": { data: { n: 0 } }, "/b": { data: { n: 0 }, isValidating: true } })
    patchCached("/a", zero)
    patchCached("/b", zero)
    expect(mutate).not.toHaveBeenCalled()
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

// The store is the live copy: seeded from an answer, then kept current by live
// updates the answer never sees.
describe("dataToSeed", () => {
  afterEach(() => bindAppMutate(null))

  it("hands each answer over once, so a remount doesn't bring back what changed since", () => {
    const answer = { n: 3 }
    expect(dataToSeed("/seed-once", answer)).toBe(answer)
    expect(dataToSeed("/seed-once", answer)).toBeNull()
    expect(dataToSeed("/seed-once", undefined)).toBeNull()
    const next = { n: 4 }
    expect(dataToSeed("/seed-once", next)).toBe(next)
  })

  // THE "SEEN" BUG. Each seen mark corrected the cached sidebar, the new object
  // re-seeded the store, and every badge that live updates had raised since
  // the last fetch went back to that fetch's count.
  it("doesn't hand over a correction of the answer the store already has", () => {
    const cache = new Map<string, { data?: N }>([["/seen", { data: { n: 3 } }]])
    const mutate = vi.fn(async (key: string, updater: (d: N | undefined) => unknown) => {
      const e = cache.get(key)
      if (e) cache.set(key, { ...e, data: updater(e.data) as N })
    })
    bindAppMutate(mutate as never, cache as never)
    expect(dataToSeed("/seen", cache.get("/seen")?.data)).toEqual({ n: 3 })
    patchCached("/seen", zero)
    const corrected = cache.get("/seen")?.data
    expect(corrected).toEqual({ n: 0 })
    expect(dataToSeed("/seen", corrected)).toBeNull()
  })

  it("drops a correction that waited longer than half a minute", () => {
    vi.useFakeTimers()
    try {
      bindAppMutate(vi.fn() as never, new Map([["/late", { isValidating: true }]]) as never)
      patchCached("/late", zero)
      vi.advanceTimersByTime(31_000)
      expect(dataToSeed("/late", { n: 3 })).toEqual({ n: 3 })
    } finally {
      vi.useRealTimers()
    }
  })
})

// The same, against SWR itself rather than a stand-in: what it drops, what it
// asks for again, and what the screen ends up showing.
describe("patchCached with SWR", () => {
  afterEach(cleanup)

  /** A fetcher whose answers are released by hand, in order. */
  const slow = () => {
    const pending: ((v: N) => void)[] = []
    const fetcher = vi.fn(() => new Promise<N>((resolve) => pending.push(resolve)))
    return { fetcher, answer: (v: N) => act(async () => pending.shift()?.(v)) }
  }

  function List({ k, fetcher, seeded }: { k: string; fetcher: () => Promise<N>; seeded: (d: N) => void }) {
    const { data } = useSWR(k, fetcher)
    useEffect(() => {
      const d = dataToSeed(k, data)
      if (d) seeded(d)
    }, [k, data, seeded])
    return <p data-testid="list">{data ? `n=${data.n}` : "loading"}</p>
  }

  const mount = (k: string, fetcher: () => Promise<N>, seeded: (d: N) => void) =>
    render(
      <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0, revalidateOnFocus: false }}>
        <SWRMutateBridge />
        <List k={k} fetcher={fetcher} seeded={seeded} />
      </SWRConfig>,
    )

  // THE DM LIST BUG, against SWR: the list's first answer must arrive, and the
  // read made while it was on its way is applied to it.
  it("lets a first answer arrive, and corrects it as it's seeded", async () => {
    const { fetcher, answer } = slow()
    const seeded = vi.fn()
    mount("/swr-first", fetcher, seeded)
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1))
    patchCached("/swr-first", zero)
    await answer({ n: 3 })
    await waitFor(() => expect(screen.getByTestId("list").textContent).toBe("n=0"))
    expect(seeded).toHaveBeenCalledTimes(1)
    expect(seeded).toHaveBeenCalledWith({ n: 0 })
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it("asks again for an answer it would drop, and keeps the new one", async () => {
    const { fetcher, answer } = slow()
    const seeded = vi.fn()
    mount("/swr-again", fetcher, seeded)
    await answer({ n: 3 })
    await waitFor(() => expect(screen.getByTestId("list").textContent).toBe("n=3"))
    // Fetched again, as a refresh would.
    await act(async () => {
      void appMutate("/swr-again")
    })
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2))
    patchCached("/swr-again", zero)
    await waitFor(() => expect(screen.getByTestId("list").textContent).toBe("n=0"))
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(3))
    await answer({ n: 4 }) // the dropped answer
    await answer({ n: 5 })
    await waitFor(() => expect(screen.getByTestId("list").textContent).toBe("n=5"))
    expect(seeded.mock.calls.map(([d]) => d.n)).toEqual([3, 5])
  })
})

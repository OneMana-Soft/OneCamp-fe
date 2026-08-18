import { describe, it, expect, vi } from "vitest"
import { dedupeInFlight, inFlightCount } from "./inFlight"

describe("dedupeInFlight", () => {
  it("runs the work once for concurrent callers and gives both the same result", async () => {
    // The case that prompted this: the admin panel opened and asked for the same provider's
    // models twice, 62ms apart. Each call reaches the provider's /models endpoint through the
    // backend, so the second one costs a real upstream request for a byte-identical answer.
    let runs = 0
    let release!: (value: string[]) => void
    const pending = new Promise<string[]>((resolve) => {
      release = resolve
    })
    const work = () => {
      runs++
      return pending
    }

    const first = dedupeInFlight("/models/groq", work)
    const second = dedupeInFlight("/models/groq", work)

    expect(runs).toBe(1)

    release(["llama3", "mixtral"])
    await expect(first).resolves.toEqual(["llama3", "mixtral"])
    await expect(second).resolves.toEqual(["llama3", "mixtral"])
  })

  it("does not cache: a call after the first settles hits the network again", async () => {
    // Caching would silently change what callers see. A refresh that returns a stale list is a
    // worse bug than the duplicate request it saves, so only concurrent calls are shared.
    let runs = 0
    const work = () => {
      runs++
      return Promise.resolve(runs)
    }

    await dedupeInFlight("/models/groq", work)
    await dedupeInFlight("/models/groq", work)

    expect(runs).toBe(2)
    expect(inFlightCount()).toBe(0)
  })

  it("clears the entry when the work REJECTS, so the next attempt is fresh", async () => {
    // The failure mode of a naive then()-only cleanup: one rejection pins a rejected promise
    // under the key and every later caller receives that stale error forever.
    const failing = vi.fn().mockRejectedValueOnce(new Error("boom")).mockResolvedValueOnce("ok")

    await expect(dedupeInFlight("/models/groq", failing)).rejects.toThrow("boom")
    expect(inFlightCount()).toBe(0)

    await expect(dedupeInFlight("/models/groq", failing)).resolves.toBe("ok")
    expect(failing).toHaveBeenCalledTimes(2)
  })

  it("shares one rejection between concurrent callers rather than running twice", async () => {
    let runs = 0
    let fail!: (reason: Error) => void
    const pending = new Promise<never>((_, reject) => {
      fail = reject
    })
    const work = () => {
      runs++
      return pending
    }

    const first = dedupeInFlight("/models/groq", work)
    const second = dedupeInFlight("/models/groq", work)
    fail(new Error("upstream down"))

    await expect(first).rejects.toThrow("upstream down")
    await expect(second).rejects.toThrow("upstream down")
    expect(runs).toBe(1)
  })

  it("keys by url, so refresh=true is never served a non-refresh promise", async () => {
    // The whole point of refresh is to bypass a cache. Sharing it with the plain request would
    // hand the caller exactly the stale answer it asked to avoid.
    const seen: string[] = []
    const work = (label: string) => () => {
      seen.push(label)
      return Promise.resolve(label)
    }

    const plain = dedupeInFlight("/models/groq", work("plain"))
    const refreshed = dedupeInFlight("/models/groq?refresh=true", work("refresh"))

    await Promise.all([plain, refreshed])
    expect(seen).toEqual(["plain", "refresh"])
  })
})

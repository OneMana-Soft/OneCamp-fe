import { describe, expect, it, vi } from "vitest"
import { once } from "./once"

describe("a load made once", () => {
  it("is asked for once, however many ask, and all have its answer", async () => {
    const load = vi.fn(() => Promise.resolve("chunk"))
    const get = once(load)
    const [a, b] = [get(), get()]
    expect(a).toBe(b)
    await expect(a).resolves.toBe("chunk")
    await expect(get()).resolves.toBe("chunk")
    expect(load).toHaveBeenCalledTimes(1)
  })

  it("forgets a load that failed, so the next ask tries again", async () => {
    const load = vi.fn().mockRejectedValueOnce(new Error("ChunkLoadError")).mockResolvedValueOnce("chunk")
    const get = once(load)
    await expect(get()).rejects.toThrow("ChunkLoadError")
    await expect(get()).resolves.toBe("chunk")
    await expect(get()).resolves.toBe("chunk")
    expect(load).toHaveBeenCalledTimes(2)
  })
})

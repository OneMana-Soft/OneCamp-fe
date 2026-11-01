import { describe, expect, it } from "vitest"
import { trackLoad } from "@/lib/testing/lazyCode"

// V-138: trackLoad is the registry's one entry (vitest.config.ts hands it every app import()), and it only watches:
// what it returns settles as the load does, and a failed load nobody handles is still reported.

describe("trackLoad", () => {
  it("settles with the load's own value", async () => {
    const code = { default: () => null }
    await expect(trackLoad(() => Promise.resolve(code))).resolves.toBe(code)
  })

  it("settles with the load's own rejection", async () => {
    const failure = new TypeError("Failed to fetch dynamically imported module: /piece.js")
    await expect(trackLoad(() => Promise.reject(failure))).rejects.toBe(failure)
  })

  it("leaves a failed load that nobody handles reported, as the load's own would be", async () => {
    const failure = new Error("nobody handles this load")
    const reported: unknown[] = []
    const listen = (reason: unknown) => void reported.push(reason)
    // Vitest's own listeners stand aside for a moment, or this report would fail the run.
    const vitests = process.listeners("unhandledRejection")
    process.removeAllListeners("unhandledRejection")
    process.on("unhandledRejection", listen)
    try {
      void trackLoad(() => Promise.reject(failure))
      await new Promise((resolve) => setTimeout(resolve, 50))
    } finally {
      process.off("unhandledRejection", listen)
      for (const listener of vitests) process.on("unhandledRejection", listener)
    }
    expect(reported).toEqual([failure])
  })

  it("is what the transformed import()s call", () => {
    expect((globalThis as { __trackLoad?: unknown }).__trackLoad).toBe(trackLoad)
  })
})

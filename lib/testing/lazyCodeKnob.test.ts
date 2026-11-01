import { afterAll, describe, expect, it, vi } from "vitest"

// V-138's knob (LAZY_CODE_DELAY_MS) is the proofs' busy machine. It charges a module's first arrival in a file, as a
// cold transform costs, and hands a module that has arrived at once, as a cached one comes; so a file's warm-ups (rule
// 2) take what they warmed out of its tests. The knob is read when lazyCode loads, so this file loads its own copy.
// Every race here is decided by order, never by speed: an arrived module comes through promises alone, before any timer.
const appTrackLoad = (globalThis as { __trackLoad?: unknown }).__trackLoad
vi.stubEnv("LAZY_CODE_DELAY_MS", "400")
vi.resetModules()
const knob = await import("@/lib/testing/lazyCode")
afterAll(() => {
  vi.unstubAllEnvs()
  Object.assign(globalThis, { __trackLoad: appTrackLoad })
})

const realTimeout = globalThis.setTimeout
const after = (ms: number) => new Promise<"later">((resolve) => void realTimeout(() => resolve("later"), ms))
const comes = (loading: Promise<unknown>) => Promise.race([loading.then(() => "now" as const), after(200)])

const warmed = { piece: "warmed before the tests" }
knob.warmBeforeTests(async () => warmed)

describe("the knob's busy machine", () => {
  it("charges a module's first arrival in a file, and every load of it that comes while it arrives", async () => {
    const piece = { piece: "cold" }
    const first = knob.trackLoad(async () => piece)
    const meanwhile = knob.trackLoad(async () => piece)
    // Each raced from the start against its own timer, so neither reads a race the other already decided.
    expect(await Promise.all([comes(first), comes(meanwhile)])).toEqual(["later", "later"])
    expect([await first, await meanwhile]).toEqual([piece, piece])
  })

  it("hands a module that has arrived at once", async () => {
    const piece = { piece: "arrived" }
    await knob.trackLoad(async () => piece)
    expect(await comes(knob.trackLoad(async () => piece))).toBe("now")
  })

  // A control leg (LAZY_CODE_WARM=off) runs no warm-ups.
  it.skipIf(process.env.LAZY_CODE_WARM === "off")("hands what a file's warm-ups loaded at once, so it costs a test nothing", async () => {
    expect(await comes(knob.trackLoad(async () => warmed))).toBe("now")
  })

  it("charges a load that fails every time, with its own failure", async () => {
    const gone = new Error("chunk gone")
    const failing = knob.trackLoad(() => Promise.reject(gone))
    expect(await comes(failing.catch(() => undefined))).toBe("later")
    await expect(failing).rejects.toBe(gone)
  })
})

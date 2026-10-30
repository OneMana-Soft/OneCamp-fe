import { afterEach, describe, expect, it, vi } from "vitest"

// The one probe (lib/newBuild's reloadForNewBuild): true when the server says the chunk is gone and the page reloads.
const reload = vi.fn<(cause: unknown) => Promise<boolean>>(async () => false)
vi.mock("@/lib/newBuild", async (actual) => ({ ...(await actual<typeof import("@/lib/newBuild")>()), reloadForNewBuild: (cause: unknown) => reload(cause) }))
// vitest.setup.ts preloads the combobox, and its Button reaches this file (a disabled button's tip is a lazy piece),
// so the copy loaded then calls the real probe: this file's subject is loaded again, after the mock.
vi.resetModules()
const { lazyChunk } = await import("./loadChunk")

afterEach(() => reload.mockReset().mockImplementation(async () => false))

describe("code fetched when it's needed", () => {
  it("is asked for once, however often it's warmed and used", async () => {
    const load = vi.fn(async () => ({ parse: (s: string) => s.trim() }))
    const chunk = lazyChunk(load)
    chunk.warm()
    chunk.warm()
    const said = vi.fn()
    expect((await chunk.use(said))?.parse(" a ")).toBe("a")
    expect(load).toHaveBeenCalledTimes(1)
    expect(said).not.toHaveBeenCalled()
  })

  it("never rejects a warm, says a failed use, and asks again after a failure", async () => {
    const load = vi.fn().mockRejectedValueOnce(new TypeError("Failed to fetch")).mockResolvedValue({ ok: true })
    const chunk = lazyChunk(load)
    chunk.warm()
    await Promise.resolve()
    const said = vi.fn()
    // The warm's failure was dropped, so this use asks again, and gets it.
    expect(await chunk.use(said)).toEqual({ ok: true })
    expect(said).not.toHaveBeenCalled()
    expect(load).toHaveBeenCalledTimes(2)
    const broken = lazyChunk(() => Promise.reject(new TypeError("Failed to fetch")))
    expect(await broken.use(said)).toBeNull()
    expect(said).toHaveBeenCalledTimes(1)
  })

  it("after a deploy, reloads once for the new build instead of saying so, through the one probe with what failed", async () => {
    reload.mockImplementation(async () => true)
    const said = vi.fn()
    const failure = Object.assign(new Error("Loading chunk 812 failed."), { name: "ChunkLoadError" })
    const gone = lazyChunk(() => Promise.reject(failure))
    expect(await gone.use(said)).toBeNull()
    expect(reload).toHaveBeenCalledTimes(1)
    expect(reload).toHaveBeenCalledWith(failure)
    expect(said).not.toHaveBeenCalled()
  })
})

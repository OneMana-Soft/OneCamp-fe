import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, renderHook } from "@testing-library/react"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { isNewerBuild, useUpdateReady, UPDATE_POLL_MS } from "@/hooks/useUpdateReady"

// Design v3 (shell T3): "A new version is ready" shows when the server runs
// another build than the page came from, polled every ten minutes and on
// focus. Never when the ids match; Reload reloads.

const root = join(__dirname, "..")

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_BUILD_ID", "build-a")
  vi.stubEnv("NODE_ENV", "production")
  vi.useFakeTimers()
})
afterEach(() => {
  vi.unstubAllEnvs()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

function serverRuns(id: string) {
  vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ id }), { status: 200 }))
}

describe("the update pill's check", () => {
  it("compares the page's build with the server's", () => {
    expect(isNewerBuild("a", "b")).toBe(true)
    expect(isNewerBuild("a", "a")).toBe(false)
    expect(isNewerBuild(undefined, "b")).toBe(false)
    expect(isNewerBuild("a", undefined)).toBe(false)
  })

  it("shows once the server's build id changes", async () => {
    serverRuns("build-b")
    const { result } = renderHook(() => useUpdateReady())
    expect(result.current.ready).toBe(false)
    await act(async () => {
      vi.advanceTimersByTime(UPDATE_POLL_MS)
    })
    await act(async () => {})
    expect(result.current.ready).toBe(true)
  })

  it("never shows while the ids match, and asks again on focus", async () => {
    serverRuns("build-a")
    const { result } = renderHook(() => useUpdateReady())
    await act(async () => {
      window.dispatchEvent(new Event("focus"))
    })
    await act(async () => {})
    expect(globalThis.fetch).toHaveBeenCalledWith("/build-id", { cache: "no-store" })
    expect(result.current.ready).toBe(false)
  })

  it("reloads the page on Reload", () => {
    const reload = vi.fn()
    vi.spyOn(window, "location", "get").mockReturnValue({ ...window.location, reload } as Location)
    const { result } = renderHook(() => useUpdateReady())
    result.current.reload()
    expect(reload).toHaveBeenCalled()
  })

  it("is fed by the build id Next is given and the route that reads it", () => {
    const config = readFileSync(join(root, "next.config.ts"), "utf8")
    expect(config).toMatch(/generateBuildId: async \(\) => buildId/)
    expect(config).toMatch(/NEXT_PUBLIC_BUILD_ID: buildId/)
    const route = readFileSync(join(root, "app/build-id/route.ts"), "utf8")
    expect(route).toMatch(/BUILD_ID/)
    expect(route).toMatch(/no-store/)
  })
})

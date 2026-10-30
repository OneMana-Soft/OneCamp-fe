import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, renderHook, waitFor } from "@testing-library/react"
import { SWRConfig } from "swr"
import type { ReactNode } from "react"
import { pinTestClock } from "@/lib/testing/testClock"

const get = vi.hoisted(() => vi.fn())
vi.mock("@/lib/axiosInstance", async () => (await import("@/lib/testing/axiosInstance")).axiosInstanceModule({ default: { get: (...a: unknown[]) => get(...a) } }))
vi.mock("@/lib/utils/timeZone", () => ({ browserTZ: () => "Asia/Kolkata" }))

const { FORECASTS_PAGE } = await import("@/lib/work/forecastsRead")
const { useProjectForecasts } = await import("./useProjectForecasts")

// The answers carry days: the clock they're read by is the tests' own.
pinTestClock()

// Every project the read brought, by id, whichever page it came in.
const brought = (pages: Record<string, { date: string | null }>[] | undefined) => new Map((pages ?? []).flatMap((page) => Object.entries(page)))

// Each test its own cache, so no answer carries over.
const fresh = ({ children }: { children: ReactNode }) => <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>{children}</SWRConfig>
const id = (n: number) => `${`0000000${n}`.slice(-8)}-aaaa-4aaa-8aaa-aaaaaaaaaaaa`
// The server answers each id it was asked for with a forecast of its own.
get.mockImplementation(async (path: string) => {
  const ids = new URL(path, "http://x").searchParams.get("ids")!.split(",")
  return { data: { data: { forecasts: Object.fromEntries(ids.map((p) => [p, { project_uuid: p, state: "forecast", date: "2026-11-18" }])) } } }
})

afterEach(() => {
  cleanup()
  get.mockClear()
})

describe("the forecasts of a list's projects", () => {
  it("are ONE read for the list, never one a row, keyed by the project's id in lower case, as the read brought them", async () => {
    const ids = Array.from({ length: 12 }, (_, n) => id(n).toUpperCase())
    const { result } = renderHook(() => useProjectForecasts(ids), { wrapper: fresh })
    await waitFor(() => expect(brought(result.current).size).toBe(12))
    expect(result.current).toHaveLength(1)
    expect(get).toHaveBeenCalledTimes(1)
    expect(get.mock.calls[0][0]).toMatch(/^\/project\/forecasts\?ids=[^&]+&tz=Asia%2FKolkata$/)
    expect(brought(result.current).get(id(3))?.date).toBe("2026-11-18")
  })

  it("past what the server takes at once, are read in pages, and every project gets its own", async () => {
    const ids = Array.from({ length: FORECASTS_PAGE + 20 }, (_, n) => id(n))
    const { result } = renderHook(() => useProjectForecasts(ids), { wrapper: fresh })
    await waitFor(() => expect(brought(result.current).size).toBe(FORECASTS_PAGE + 20))
    expect(get).toHaveBeenCalledTimes(2)
    expect(result.current).toHaveLength(2)
    expect(brought(result.current).has(id(0)) && brought(result.current).has(id(FORECASTS_PAGE + 19))).toBe(true)
  })

  it("ask nothing with no projects, and a failed read leaves the rows as they are", async () => {
    const none = renderHook(() => useProjectForecasts([]), { wrapper: fresh })
    expect(none.result.current).toBeUndefined()
    expect(get).not.toHaveBeenCalled()
    get.mockRejectedValueOnce(new Error("offline"))
    const failed = renderHook(() => useProjectForecasts([id(1)]), { wrapper: fresh })
    await waitFor(() => expect(get).toHaveBeenCalledTimes(1))
    expect(failed.result.current).toBeUndefined()
  })
})

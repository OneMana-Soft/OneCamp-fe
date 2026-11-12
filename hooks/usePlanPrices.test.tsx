import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, renderHook } from "@testing-library/react"

afterEach(cleanup)

const fetchState: { data: unknown; calls: { url: string; config: Record<string, unknown> | undefined }[] } = { data: undefined, calls: [] }
vi.mock("@/hooks/useFetch", () => ({
  useFetch: (url: string, _schema: unknown, config?: Record<string, unknown>) => {
    fetchState.calls.push({ url, config })
    return { data: url ? fetchState.data : undefined }
  },
}))

import { usePlanPrices } from "@/hooks/usePlanPrices"

describe("usePlanPrices", () => {
  // CR-248 row 3004 F1: the address is named once, in services/endPoints.ts (ADMIN-PLAN:1010).
  it("reads GetEndpointUrl.PlanPrices", async () => {
    const { GetEndpointUrl } = await import("@/services/endPoints")
    expect(GetEndpointUrl.PlanPrices).toBe("/plan/prices")
    const { readFileSync } = await import("node:fs")
    expect(readFileSync("hooks/usePlanPrices.ts", "utf8")).not.toContain('"/plan/prices"')
  })

  it("is unavailable until the server answers, so nothing types a price", () => {
    fetchState.data = undefined
    const { result } = renderHook(() => usePlanPrices())
    expect(result.current.available).toBe(false)
    expect(result.current.licence).toBeUndefined()
  })

  // The server fetches them from the storefront, an hour at a time: the page
  // reads them once and never again on focus or reconnect.
  it("reads /plan/prices once, and passes the storefront's figures on", () => {
    fetchState.calls = []
    fetchState.data = {
      data: {
        available: true,
        licence: { usd: 261, inr: 24999 },
        cloud: { usd: 105, inr: 9999, seats: 30 },
        business: { usd: 261, inr: 24999, seats: 100 },
        charged_in: "INR",
      },
    }
    const { result } = renderHook(() => usePlanPrices())
    expect(fetchState.calls[0].url).toBe("/plan/prices")
    expect(fetchState.calls[0].config).toMatchObject({ revalidateOnFocus: false, revalidateOnReconnect: false, revalidateIfStale: false })
    expect(result.current).toMatchObject({ available: true, licence: { usd: 261, inr: 24999 }, cloud: { seats: 30 }, chargedIn: "INR" })
  })

  it("asks nothing for someone who may not (a member)", () => {
    fetchState.calls = []
    renderHook(() => usePlanPrices({ enabled: false }))
    expect(fetchState.calls[0].url).toBe("")
  })
})

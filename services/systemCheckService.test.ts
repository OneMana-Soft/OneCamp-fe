import { afterEach, describe, expect, it, vi } from "vitest"

// The health card says a failure to reach the checker in place, beside the
// rest of the page. The request also raised the global error toast, so one
// failure was said twice.

const http = vi.hoisted(() => ({ get: vi.fn() }))
vi.mock("@/lib/axiosInstance", () => ({ default: http, OWN_ERRORS: { suppressErrorToast: true } }))

const { runSystemCheck } = await import("@/services/systemCheckService")

afterEach(() => {
  http.get.mockReset()
})

describe("the health check's request", () => {
  it("leaves its failure to the card", async () => {
    http.get.mockResolvedValue({ data: { data: {} } })
    await runSystemCheck()
    expect(http.get.mock.calls[0][1]).toEqual({ suppressErrorToast: true })
  })
})

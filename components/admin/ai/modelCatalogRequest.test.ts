import { afterEach, describe, expect, it, vi } from "vitest"

// The model catalog says its own failure in a toast with the provider's
// reason. The request also raised the global error toast, so one failure was
// said twice, the later replacing the earlier.

const http = vi.hoisted(() => ({ get: vi.fn() }))
vi.mock("@/lib/axiosInstance", () => ({ default: http, OWN_ERRORS: { suppressErrorToast: true } }))

const { getOllamaCatalog } = await import("@/services/aiModelService")

afterEach(() => {
  http.get.mockReset()
})

describe("the model catalog's request", () => {
  it("leaves its failure to the catalog", async () => {
    http.get.mockResolvedValue({ data: { data: { models: [] } } })
    await getOllamaCatalog("p1")
    expect(http.get.mock.calls[0][1]).toEqual({ suppressErrorToast: true })
  })
})

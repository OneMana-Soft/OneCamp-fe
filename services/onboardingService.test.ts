import { afterEach, describe, expect, it, vi } from "vitest"

// The setup checklist is a hint on Home. When its status couldn't load, Home
// went on without it, as it should, but the global error toast still said
// "Something went wrong" about a request the person never made.

const http = vi.hoisted(() => ({ get: vi.fn() }))
vi.mock("@/lib/axiosInstance", () => ({ default: http, OWN_ERRORS: { suppressErrorToast: true } }))

const { getOnboardingStatus } = await import("@/services/onboardingService")

afterEach(() => {
  http.get.mockReset()
})

describe("the setup checklist's status request", () => {
  it("leaves a failure to Home, which goes on without the card", async () => {
    http.get.mockResolvedValue({ data: { data: { steps: [] } } })
    await getOnboardingStatus()
    expect(http.get.mock.calls[0][1]).toEqual({ suppressErrorToast: true })
  })
})

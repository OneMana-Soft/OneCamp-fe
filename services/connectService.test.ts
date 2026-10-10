import { afterEach, describe, expect, it, vi } from "vitest"

// The agent sign-in page says every failure in place ("This sign-in can't
// continue", "It couldn't be connected"). Since the one Toaster moved to the
// root, the global error toast said the same failure again over it.

const http = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }))
vi.mock("@/lib/axiosInstance", () => ({ default: http, OWN_ERRORS: { suppressErrorToast: true } }))

const { getConsent, approveConsent, denyConsent } = await import("@/services/connectService")

afterEach(() => {
  http.get.mockReset()
  http.post.mockReset()
})

describe("the agent sign-in's requests", () => {
  it("leave their failures to the page", async () => {
    http.get.mockResolvedValue({ data: { data: {} } })
    http.post.mockResolvedValue({ data: { data: { redirect: "x" } } })
    await getConsent("r1")
    await approveConsent("r1", { agent_id: "", scopes: [] })
    await denyConsent("r1")
    expect(http.get.mock.calls[0][1]).toEqual({ suppressErrorToast: true })
    expect(http.post.mock.calls[0][2]).toEqual({ suppressErrorToast: true })
    expect(http.post.mock.calls[1][2]).toEqual({ suppressErrorToast: true })
  })
})

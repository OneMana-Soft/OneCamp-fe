import { afterEach, describe, expect, it, vi } from "vitest"

// Creating a token says what went wrong inside its dialog, under the field
// it is about. The request raised the global error toast as well, so the same
// refusal was said twice, once over the dialog that was saying it.

const post = vi.hoisted(() => vi.fn())
vi.mock("@/lib/axiosInstance", () => ({ default: { post, get: vi.fn(), delete: vi.fn() }, OWN_ERRORS: { suppressErrorToast: true } }))

const { createApiToken } = await import("@/services/apiTokenService")

afterEach(() => post.mockReset())

describe("creating an API token", () => {
  it("leaves its failures to the dialog, not the global toast", async () => {
    post.mockResolvedValue({ data: { data: { token: "t", id: "1" } } })
    await createApiToken({ name: "CI", scopes: ["read"] })
    expect(post.mock.calls[0][2]).toEqual({ suppressErrorToast: true })
  })
})

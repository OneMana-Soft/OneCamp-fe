import { describe, expect, it, vi } from "vitest"

const post = vi.fn().mockResolvedValue({ data: { data: { enabled: true, query: "q", groups: [] } } })
vi.mock("@/lib/axiosInstance", () => ({ default: { post: (...a: unknown[]) => post(...a) } }))

const { unifiedSearch, unifiedSearchAnswer } = await import("@/services/aiSearchService")

describe("the AI search", () => {
  // A search that got no answer said "Your change wasn't saved."
  it("is sent as a read: no write's toast when it fails", async () => {
    await unifiedSearch("launch")
    await unifiedSearchAnswer("launch")
    for (const call of post.mock.calls) expect(call[2]).toMatchObject({ suppressErrorToast: true })
  })
})

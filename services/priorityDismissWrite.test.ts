import { describe, expect, it, vi } from "vitest"

// POST /activity/dismiss takes at most 20 keys (a 21st is a 400): a row that
// stands for more mentions than that writes them twenty at a time. Its own
// failure is said by the Inbox, so the app-wide error toast stays out.
const post = vi.fn<(url: string, body: unknown, config: unknown) => Promise<{ data: { msg: string } }>>(async () => ({ data: { msg: "ok" } }))
vi.mock("@/lib/axiosInstance", async () => (await import("@/lib/testing/axiosInstance")).axiosInstanceModule({ default: { post: (url: string, body: unknown, config: unknown) => post(url, body, config) } }))

const { setPriorityDismissed, DISMISS_KEYS_MAX } = await import("@/services/activityService")

describe("setPriorityDismissed", () => {
  it("writes the keys twenty to a write, each without the app's error toast", async () => {
    const keys = Array.from({ length: 45 }, (_, i) => `mention:${i}`)
    await setPriorityDismissed(keys, true)
    expect(post.mock.calls.map(([url, body]) => [url, (body as { keys: string[] }).keys.length, (body as { dismissed: boolean }).dismissed])).toEqual([
      ["/activity/dismiss", 20, true],
      ["/activity/dismiss", 20, true],
      ["/activity/dismiss", 5, true],
    ])
    expect(post.mock.calls.flatMap(([, body]) => (body as { keys: string[] }).keys)).toEqual(keys)
    expect(post.mock.calls.every(([, , config]) => (config as { suppressErrorToast?: boolean }).suppressErrorToast === true)).toBe(true)
    expect(DISMISS_KEYS_MAX).toBe(20)
  })
})

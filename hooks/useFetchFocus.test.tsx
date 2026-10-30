import { describe, expect, it, vi } from "vitest"
import { renderHook } from "@testing-library/react"

// MQTT keeps what's on screen live, so a tab's focus refetches at most once a
// minute: SWR's own 5 s let every return to the tab ask for every key on
// screen again, a herd against the API (components/admin/GitHubWebhookHealth
// counts on it too). What every useFetch hands SWR, read off its call.
const configs: Record<string, unknown>[] = []
vi.mock("swr", async (orig) => ({
  ...(await orig<typeof import("swr")>()),
  default: (_key: unknown, _fetch: unknown, config: Record<string, unknown>) => {
    configs.push(config)
    return { data: undefined, error: undefined, isLoading: false, mutate: () => {} }
  },
}))

const { useFetch } = await import("@/hooks/useFetch")

describe("useFetch", () => {
  it("refetches on a tab's focus at most once a minute, and never while hidden or offline", () => {
    renderHook(() => useFetch("/po/latestPosts/c1"))
    expect(configs.at(-1)).toMatchObject({ focusThrottleInterval: 60_000, refreshWhenHidden: false, refreshWhenOffline: false })
  })

  it("lets a caller choose otherwise", () => {
    renderHook(() => useFetch("/po/latestPosts/c1", undefined, { revalidateOnFocus: false }))
    expect(configs.at(-1)).toMatchObject({ focusThrottleInterval: 60_000, revalidateOnFocus: false })
  })
})

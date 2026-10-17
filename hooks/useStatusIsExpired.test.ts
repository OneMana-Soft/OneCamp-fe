import { afterEach, describe, expect, it } from "vitest"
import { cleanup, renderHook } from "@testing-library/react"
import { pinTestClock, TEST_TODAY } from "@/lib/testing/testClock"
import { useStatusIsExpired } from "@/hooks/useStatusIsExpired"
import type { UserEmojiStatus } from "@/types/user"

pinTestClock()
afterEach(cleanup)

const at = (minutes: number) => new Date(TEST_TODAY.getTime() + minutes * 60_000).toISOString()
const status = (expiresInMinutes: number, desc = "Lunch"): UserEmojiStatus => ({
  status_user_emoji_id: "sandwich",
  status_user_emoji_desc: desc,
  status_user_emoji_expiry_in: "30m",
  status_user_emoji_expiry_at: at(expiresInMinutes),
})

describe("whether a status has run out", () => {
  it("reads a status set after one that ran out, with the same Clear after, as current", () => {
    // Lunch ran out 10 minutes ago; a new 30-minute status takes its place.
    const { result, rerender } = renderHook(({ s }) => useStatusIsExpired(s), { initialProps: { s: status(-10) } })
    expect(result.current).toBe(true)
    rerender({ s: status(30, "Back at 3") })
    expect(result.current).toBe(false)
  })
})

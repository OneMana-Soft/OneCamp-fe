import { describe, expect, it, vi } from "vitest"
import { pinTestClock } from "@/lib/testing/testClock"

vi.mock("@/hooks/useFetch", () => ({ useFetch: () => ({ data: undefined }), useFetchOnlyOnce: () => ({ data: undefined }) }))
const { channelOrigin } = await import("./emptyConversations")

// Today is pinned (app/testClock.test.ts): a day in this year is written without its year, and these are 2026's.
pinTestClock()

// Where a channel's history begins, when no topic says more: who made it and
// when, as Slack's channel intro does, in the app's one date style ("19 Sep").
describe("a channel's origin", () => {
  const sept = "2026-09-19T09:00:00-04:00"

  it("names the maker and the day", () => {
    expect(channelOrigin("Maya Chen", sept, false)).toBe("Maya Chen created this channel on 19 Sep.")
  })

  it("says you when it was you", () => {
    expect(channelOrigin("Sam Rivera", sept, true)).toBe("You created this channel on 19 Sep.")
  })

  it("leaves out a day it doesn't know, and falls back without a maker", () => {
    expect(channelOrigin("Maya Chen", undefined, false)).toBe("Maya Chen created this channel.")
    expect(channelOrigin(undefined, "not a date", false)).toBe("What you write below starts the conversation.")
  })
})

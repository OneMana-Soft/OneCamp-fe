import { describe, expect, it } from "vitest"
import { callLength, elapsed } from "./callCard"
import { pinTestClock } from "@/lib/testing/testClock"

pinTestClock(new Date("2026-11-05T09:30:00Z"))

// slack-06's card: how long a call ran or has been on, and who came, in words.
describe("a huddle card's words", () => {
  it("say how long an ended call ran", () => {
    expect(callLength(20)).toBe("under a minute")
    expect(callLength(240)).toBe("4 min")
    expect(callLength(3600)).toBe("1 h")
    expect(callLength(3900)).toBe("1 h 5 min")
  })

  it("count the time a call has been on", () => {
    const start = "2026-11-05T09:00:00Z"
    const at = (s: number) => Date.parse(start) + s * 1000
    expect(elapsed(start, at(42))).toBe("0:42")
    expect(elapsed(start, at(245))).toBe("4:05")
    expect(elapsed(start, at(3729))).toBe("1:02:09")
    // A clock a little behind the server's, or no start, reads as just begun.
    expect(elapsed(start, at(-3))).toBe("0:00")
    expect(elapsed(undefined, at(5))).toBe("0:00")
  })
})

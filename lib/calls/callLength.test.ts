import { describe, expect, it } from "vitest"
import { callLength } from "@/lib/calls/callLength"

describe("how long a call ran", () => {
  it("says minutes, then hours and minutes, and under a minute below half of one", () => {
    expect(callLength(20)).toBe("under a minute")
    expect(callLength(240)).toBe("4 min")
    expect(callLength(3600)).toBe("1 h")
    expect(callLength(3900)).toBe("1 h 5 min")
  })
})

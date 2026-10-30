import { describe, expect, it } from "vitest"

import { MAX_FORWARD_PLACES, forwardCountNote } from "@/lib/chat/forwardLimit"

describe("the forward picker's count", () => {
  it("is the server's limit", () => {
    expect(MAX_FORWARD_PLACES).toBe(100)
  })

  it("says nothing before a place is chosen, counts to the limit, and says why it stops there", () => {
    expect(forwardCountNote(0)).toBeNull()
    expect(forwardCountNote(1)).toBe("1 of 100 places")
    expect(forwardCountNote(99)).toBe("99 of 100 places")
    expect(forwardCountNote(100)).toBe("100 of 100: that's the most one forward can go to. Remove one to add another.")
    expect(forwardCountNote(2, 2)).toContain("the most one forward can go to")
  })
})

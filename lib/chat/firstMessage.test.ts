import { beforeEach, describe, expect, it } from "vitest"
import { claimFirstMessage, isFirstMessage } from "./firstMessage"

// A first message is celebrated only when it is certain: none of the sender's
// among the messages held, and the server's latest page is all there is. And
// once per conversation.

describe("a first message", () => {
  beforeEach(() => localStorage.clear())

  it("is one only when none of theirs is held and nothing older exists", () => {
    expect(isFirstMessage({ mine: false, wholeHistory: true })).toBe(true)
    expect(isFirstMessage({ mine: true, wholeHistory: true })).toBe(false)
    // Older messages not loaded might hold one of theirs.
    expect(isFirstMessage({ mine: false, wholeHistory: false })).toBe(false)
  })

  it("is celebrated once per conversation", () => {
    expect(claimFirstMessage("channel:c1")).toBe(true)
    expect(claimFirstMessage("channel:c1")).toBe(false)
    expect(claimFirstMessage("dm:maya")).toBe(true)
  })
})

import { describe, expect, it } from "vitest"
import { pinTestClock } from "@/lib/testing/testClock"
import { FULL_EVERY, callThreadTargetOf, messageProblem, sinceFor, type CallThreadRead } from "./callThread"

pinTestClock(new Date("2026-10-22T09:30:00Z"))

const channel = "4f0c2a1e-3b7d-4c55-9a51-0d8b1f6a2c33"
const dm = "0b6f1d8e-1111-4c55-9a51-0d8b1f6a2c33 4f0c2a1e-3b7d-4c55-9a51-0d8b1f6a2c33"
const group = "0123456789abcdef0123456789abcdef"

// A conversation's call has a chat, for a member by the call's id and for a
// guest by their call token; a meeting has none.
describe("the call's chat, by the call's room", () => {
  it("is a conversation's call's, asked as whoever is in it", () => {
    for (const room of [channel, dm, group]) {
      expect(callThreadTargetOf({ room, guest: false, sessionId: "s1" })).toEqual({ sessionId: "s1" })
      expect(callThreadTargetOf({ room, guest: true, callToken: "tok" })).toEqual({ callToken: "tok" })
    }
  })

  it("is nobody's in a meeting, or before the call is known", () => {
    expect(callThreadTargetOf({ room: "meet-abc", guest: false, sessionId: "s1" })).toBeUndefined()
    expect(callThreadTargetOf({ room: "meet-abc", guest: true, callToken: "tok" })).toBeUndefined()
    expect(callThreadTargetOf({ room: "", guest: false, sessionId: "s1" })).toBeUndefined()
    expect(callThreadTargetOf({ room: channel, guest: false })).toBeUndefined()
    // A guest never asks by a member's call id.
    expect(callThreadTargetOf({ room: channel, guest: true, sessionId: "s1" })).toBeUndefined()
  })
})

describe("what a poll asks for", () => {
  const read = { latest: "2026-10-22T09:30:00.123456789Z" } as CallThreadRead
  it("asks for everything first, then only what came after the last read, and everything again every minute", () => {
    expect(sinceFor(0, null)).toBeUndefined()
    expect(sinceFor(1, null)).toBeUndefined()
    expect(sinceFor(1, read)).toBe(read.latest)
    expect(sinceFor(FULL_EVERY - 1, read)).toBe(read.latest)
    expect(sinceFor(FULL_EVERY, read)).toBeUndefined()
  })
})

describe("a message the chat takes", () => {
  it("is some text, up to 4,000 characters", () => {
    expect(messageProblem("  ")).toBe("Write a message first.")
    expect(messageProblem("hi")).toBeNull()
    expect(messageProblem("é".repeat(4000))).toBeNull()
    expect(messageProblem("é".repeat(4001))).toBe("Keep messages under 4,000 characters.")
  })
})

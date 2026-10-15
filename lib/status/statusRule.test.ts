import { describe, expect, it } from "vitest"
import { STATUS_TEXT_MAX, statusEndOf, statusTextLength, statusTextProblem } from "@/lib/status/statusRule"

// The server's one rule for a status (business/User/emojiStatus.go), as the
// menu keeps it: the same limit, counted the same way, in the same words.
describe("a status's words", () => {
  it("count characters as the server does: an emoji, even a joined one, once per code point", () => {
    expect(statusTextLength("  Lunch  ")).toBe(5)
    expect(statusTextLength("🍕".repeat(STATUS_TEXT_MAX))).toBe(STATUS_TEXT_MAX)
    // 👩‍💻 is three code points joined (woman, ZWJ, laptop); Go counts three too.
    expect(statusTextLength("👩‍💻")).toBe(3)
  })

  it("say what is wrong in the server's words", () => {
    expect(statusTextProblem("   ")).toBe("Write a few words for your status.")
    expect(statusTextProblem("a".repeat(STATUS_TEXT_MAX + 1))).toBe("Keep your status to 100 characters.")
    expect(statusTextProblem("🍕".repeat(STATUS_TEXT_MAX))).toBe("")
  })
})

describe("a status's end in the store", () => {
  it("is an ISO date, or nothing while the server counts it", () => {
    expect(statusEndOf(new Date("2026-10-15T18:30:00Z"))).toBe("2026-10-15T18:30:00.000Z")
    expect(statusEndOf(undefined)).toBeUndefined()
    expect(statusEndOf(new Date("not a date"))).toBeUndefined()
  })
})

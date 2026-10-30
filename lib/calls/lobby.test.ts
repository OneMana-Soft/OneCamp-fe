import { describe, expect, it } from "vitest"
import { pinTestClock } from "@/lib/testing/testClock"
import { knockNotice, waitedFor } from "./lobby"

pinTestClock()

// CALLS-2: the lobby, said to whoever may let people in.

const k = (ticket: string, name: string, knocked_at = "2026-10-20T10:00:00Z") => ({ ticket, name, knocked_at })

describe("knockNotice", () => {
  it("names one person, with them to admit", () => {
    expect(knockNotice([k("a", "Priya")])).toEqual({ title: "Priya is waiting to join", one: k("a", "Priya") })
  })
  it("counts several, with nobody singled out", () => {
    expect(knockNotice([k("a", "Priya"), k("b", "Jonas"), k("c", "Lee")])).toEqual({ title: "3 people are waiting to join" })
  })
  it("says nothing of nobody", () => {
    expect(knockNotice([])).toBeNull()
  })
})

describe("waitedFor", () => {
  const at = Date.parse("2026-10-20T10:00:00Z")
  it("words the wait in minutes, then hours", () => {
    expect(waitedFor("2026-10-20T10:00:00Z", at + 20_000)).toBe("Just now")
    expect(waitedFor("2026-10-20T10:00:00Z", at + 60_000)).toBe("1 min")
    expect(waitedFor("2026-10-20T10:00:00Z", at + 12 * 60_000)).toBe("12 min")
    expect(waitedFor("2026-10-20T10:00:00Z", at + 61 * 60_000)).toBe("1 hr")
  })
  it("never says a negative wait, and nothing for a time it can't read", () => {
    expect(waitedFor("2026-10-20T10:00:00Z", at - 90_000)).toBe("Just now")
    expect(waitedFor("soon", at)).toBe("")
  })
})

import { describe, expect, it } from "vitest"
import { googleSyncLine, googleSyncNext, googleSyncWords, type GoogleSync } from "./googleSync"
import { pinTestClock } from "@/lib/testing/testClock"

// Today is TEST_TODAY wherever the code under test reads the time.
pinTestClock()

const at = Date.UTC(2026, 9, 19, 12, 0)
const sync = (p: Partial<GoogleSync>): GoogleSync => ({ provider: "google", state: "synced", progress: 100, moved: 0, unchanged: 0, ...p })

// Calendar B6: what the Calendars panel says of the move and the sync.
describe("Google sync in words", () => {
  it("says the move's progress, then how long since it was last in step", () => {
    expect(googleSyncWords(undefined)).toBe("")
    expect(googleSyncWords(sync({ state: "none" }))).toBe("")
    expect(googleSyncWords(sync({ state: "moving", progress: 45 }))).toBe("Moving from Google · 45%")
    expect(googleSyncWords(sync({ last_synced_at: new Date(at - 2 * 60000).toISOString() }), at)).toBe("In step with Google · 2m ago")
    expect(googleSyncWords(sync({ state: "failed", error: "Your Google calendars couldn't be read." }))).toBe("Your Google calendars couldn't be read.")
  })

  // C9: Google stopped answering for the account, so connecting it again is
  // what's next, not a move.
  it("says when Google stopped answering, and what the person can do next", () => {
    // DESIGN-BUILD-8 (C9 SF1): said once, short, on the account line; the action beside it says what to do.
    expect(googleSyncWords(sync({ state: "broken", error: "Google stopped answering for this account. Connect it again." }))).toBe("Google stopped answering")
    expect(googleSyncNext(sync({ state: "broken" }))).toEqual({ label: "Connect Google again", reconnect: true })
    expect(googleSyncNext(sync({ state: "failed" }))).toEqual({ label: "Try the move from Google again", reconnect: false })
    expect(googleSyncNext(sync({ state: "none" }))).toEqual({ label: "Move everything from Google", reconnect: false })
    expect(googleSyncNext(undefined)?.label).toBe("Move everything from Google")
    expect(googleSyncNext(sync({ state: "moving" }))).toBeUndefined()
    expect(googleSyncNext(sync({}))).toBeUndefined()
  })
})

// C9 SF1: the Google row's one status line, on the computer and the phone.
describe("the Google row's status line", () => {
  it("names the account and how the sync stands, and leaves a failed move's why to its action", () => {
    expect(googleSyncLine("sam@gmail.com", sync({ state: "broken" }))).toBe("sam@gmail.com · Google stopped answering")
    expect(googleSyncLine("sam@gmail.com", sync({}))).toBe("sam@gmail.com · In step with Google")
    expect(googleSyncLine("sam@gmail.com", sync({ state: "moving", progress: 45 }))).toBe("sam@gmail.com · Moving from Google · 45%")
    expect(googleSyncLine("sam@gmail.com", sync({ state: "failed", error: "Your Google calendars couldn't be read." }))).toBe("sam@gmail.com")
    expect(googleSyncLine("sam@gmail.com", undefined)).toBe("sam@gmail.com")
    expect(googleSyncLine(undefined, sync({ state: "broken" }))).toBe("Google stopped answering")
  })
})

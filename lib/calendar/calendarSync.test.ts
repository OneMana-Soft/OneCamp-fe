import { describe, expect, it } from "vitest"
import { SYNC, syncLine, syncNext, syncWords, type CalendarSync } from "./calendarSync"
import { pinTestClock, TEST_TODAY } from "@/lib/testing/testClock"
import { clockTime, dayAndTime } from "@/lib/utils/date/clock"

pinTestClock()

const at = Date.UTC(2026, 9, 19, 12, 0)
const outlook = (p: Partial<CalendarSync>): CalendarSync => ({ provider: "microsoft", state: "synced", progress: 100, moved: 0, unchanged: 0, ...p })

// Calendar B7: Outlook's tile says what Google's says, in Outlook's name, from the one table.
describe("a calendar link in words, for each provider", () => {
  it("names each provider and its connector once", () => {
    expect(SYNC.google).toMatchObject({ name: "Google", calendar: "Google Calendar", connector: "google_calendar" })
    expect(SYNC.microsoft).toMatchObject({ name: "Outlook", calendar: "Outlook Calendar", connector: "microsoft_calendar" })
  })

  it("says Outlook's move, its sync and a broken link as Google's are said", () => {
    expect(syncWords("microsoft", outlook({ state: "moving", progress: 30 }))).toBe("Moving from Outlook · 30%")
    expect(syncWords("microsoft", outlook({ last_synced_at: new Date(at - 5 * 60000).toISOString() }), at)).toBe("In step with Outlook · 5m ago")
    expect(syncWords("microsoft", outlook({ state: "broken", error: "Microsoft stopped answering for this account. Connect it again." }))).toBe("Outlook stopped answering")
    expect(syncLine("microsoft", "maya@contoso.com", outlook({ state: "broken" }))).toBe("maya@contoso.com · Outlook stopped answering")
    expect(syncNext("microsoft", outlook({ state: "broken" }))).toEqual({ label: "Connect Outlook again", reconnect: true })
    expect(syncNext("microsoft", outlook({ state: "none" }))).toEqual({ label: "Move everything from Outlook", reconnect: false })
    expect(syncNext("microsoft", outlook({ state: "failed" }))?.label).toBe("Try the move from Outlook again")
  })

  it("keeps Google's words as they were", () => {
    const google = { ...outlook({ state: "moving", progress: 45 }), provider: "google" as const }
    expect(syncWords("google", google)).toBe("Moving from Google · 45%")
    expect(syncNext("google", undefined)?.label).toBe("Move everything from Google")
  })
})

// gcal-18: a sync the provider can't be read for (down, timing out, slowing us down) for over half an
// hour says so in one calm sentence, with the time it was last in step; one blip is not news.
describe("a sync that stopped following the provider", () => {
  const since = new Date(at - 2 * 3600_000).toISOString()
  const google = (p: Partial<CalendarSync>): CalendarSync => ({ ...outlook(p), provider: "google" })
  const t = clockTime(since)

  it("says why, in one sentence for each class, with the time it was last in step", () => {
    expect(syncWords("google", google({ stale_since: since, read_error: "unreachable" }), at)).toBe(`Google hasn't answered since ${t}`)
    expect(syncWords("google", google({ stale_since: since, read_error: "rate_limited" }), at)).toBe(`Google asked us to slow down · last in step ${t}`)
    expect(syncWords("google", google({ stale_since: since, read_error: "provider_error" }), at)).toBe(`Google had a problem on its side · last in step ${t}`)
    expect(syncWords("google", google({ stale_since: since }), at)).toBe(`Not in step with Google since ${t}`)
    expect(syncWords("microsoft", outlook({ stale_since: since, read_error: "unreachable" }), at)).toBe(`Outlook hasn't answered since ${t}`)
  })

  it("names the day too once the time it was last in step isn't today", () => {
    const old = new Date(at - 3 * 86400_000).toISOString()
    expect(syncWords("google", google({ stale_since: old, read_error: "unreachable" }), at)).toBe(`Google hasn't answered since ${dayAndTime(new Date(old))}`)
  })

  it("says it on the account's line, and offers nothing to do", () => {
    const today = new Date(TEST_TODAY.getTime() - 3600_000).toISOString()
    const s = google({ stale_since: today, read_error: "unreachable" })
    expect(syncLine("google", "sam@gmail.com", s)).toBe(`sam@gmail.com · Google hasn't answered since ${clockTime(today)}`)
    expect(syncNext("google", s)).toBeUndefined()
  })

  it("keeps one failed read quiet while the sync is still in step", () => {
    const s = google({ stale_since: null, read_error: "unreachable", last_synced_at: new Date(at - 12 * 60000).toISOString() })
    expect(syncWords("google", s, at)).toBe("In step with Google · 12m ago")
  })

  it("leaves a moving, failed or broken sync's words as they were", () => {
    const more = { stale_since: since, read_error: "unreachable" as const }
    expect(syncWords("google", google({ ...more, state: "moving", progress: 45 }), at)).toBe("Moving from Google · 45%")
    expect(syncWords("google", google({ ...more, state: "failed", error: "Google said no." }), at)).toBe("Google said no.")
    expect(syncWords("google", google({ ...more, state: "broken" }), at)).toBe("Google stopped answering")
  })
})

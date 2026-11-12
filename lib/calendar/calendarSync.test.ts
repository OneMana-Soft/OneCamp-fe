import { describe, expect, it } from "vitest"
import { SYNC, syncLine, syncNext, syncWords, type CalendarSync } from "./calendarSync"
import { pinTestClock } from "@/lib/testing/testClock"

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

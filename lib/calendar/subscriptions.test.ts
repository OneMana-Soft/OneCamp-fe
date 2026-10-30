import { describe, expect, it } from "vitest"
import { HOLIDAY_CALENDARS, looksLikeAddress, subscriptionWords } from "./subscriptions"
import { pinTestClock } from "@/lib/testing/testClock"

// Today is TEST_TODAY wherever the code under test reads the time.
pinTestClock()

// Calendar B8: calendars read from an address.
describe("an address someone pastes", () => {
  it("is https, http or webcal with a host", () => {
    for (const ok of ["https://calendar.example/team.ics", " webcal://calendar.example/team.ics ", "http://calendar.example/x"]) {
      expect(looksLikeAddress(ok), ok).toBe(true)
    }
    for (const bad of ["calendar.example/team.ics", "ftp://calendar.example/x", "https://", "Team calendar", ""]) {
      expect(looksLikeAddress(bad), bad).toBe(false)
    }
  })
})

describe("public holidays", () => {
  it("lists India first, then each country once by name, each read by its own https address", () => {
    expect(HOLIDAY_CALENDARS[0].country).toBe("India")
    const rest = HOLIDAY_CALENDARS.slice(1).map((h) => h.country)
    expect(rest).toEqual([...rest].sort((a, b) => a.localeCompare(b)))
    expect(new Set(HOLIDAY_CALENDARS.map((h) => h.country)).size).toBe(HOLIDAY_CALENDARS.length)
    for (const h of HOLIDAY_CALENDARS) {
      expect(h.address).toMatch(/^https:\/\/calendar\.google\.com\/calendar\/ical\/en\.[a-z_]+%23holiday%40group\.v\.calendar\.google\.com\/public\/basic\.ics$/)
    }
  })
})

describe("what a subscribed calendar's menu says", () => {
  const now = Date.parse("2026-10-21T10:00:00Z")
  it("says where it is read from and when, that its first read is under way, or why it couldn't be read", () => {
    expect(subscriptionWords({ calendar_id: "c", name: "Team", host: "calendar.example", read_at: "2026-10-21T09:55:00Z" }, now)).toBe("Read from calendar.example · 5m ago")
    expect(subscriptionWords({ calendar_id: "c", name: "Team", host: "calendar.example", reading: true }, now)).toBe("Bringing its events in")
    expect(subscriptionWords({ calendar_id: "c", name: "Team", host: "calendar.example", error: "The address took too long to answer." }, now)).toBe("The address took too long to answer.")
    expect(subscriptionWords(undefined, now)).toBe("")
  })
})

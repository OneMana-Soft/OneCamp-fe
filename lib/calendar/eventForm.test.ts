import { describe, expect, it } from "vitest"

import { pinTestClock } from "@/lib/testing/testClock"
import type { ApiEvent } from "@/lib/calendar/eventsApi"
import {
  daysSpanned,
  eventInput,
  eventPatch,
  eventValues,
  formProblem,
  newEventValues,
  nextHour,
  patchChanges,
  remindersChanged,
  whenOf,
  withAllDay,
  withStart,
} from "./eventForm"

// The reader's day: Thu 15 Oct 2026, 10:20 on their clock.
pinTestClock(new Date(2026, 9, 15, 10, 20))
const NOW = new Date(2026, 9, 15, 10, 20)

const api = (extra: Partial<ApiEvent> = {}): ApiEvent => ({
  id: "0b8a3c1e-1d2f-4a5b-8c7d-9e0f1a2b3c4d",
  kind: "event",
  title: "Design review",
  notes: "Bring the pricing page",
  location: "Studio",
  start: { at: new Date(2026, 9, 16, 9, 15).toISOString(), zone: "Europe/London" },
  end: { at: new Date(2026, 9, 16, 10).toISOString() },
  all_day: false,
  sequence: 4,
  organiser: { user_uuid: "sam" },
  attendees: [
    { user_uuid: "maya", user_name: "Maya Chen", role: "required", response: "accepted" },
    { email: "alex@example.com", user_name: "Alex Kim", role: "optional", response: "needs_action" },
  ],
  hue: "moss",
  transparency: "opaque",
  visibility: "default",
  guests_can_modify: false,
  guests_can_invite: true,
  guests_can_see_guests: true,
  ...extra,
})

describe("a new event's values", () => {
  it("start at the next round hour, for an hour, in the reader's zone", () => {
    const v = newEventValues("Europe/London", NOW)
    expect(v.start).toEqual(new Date(2026, 9, 15, 11))
    expect(v.end).toEqual(new Date(2026, 9, 15, 12))
    expect(v.zone).toBe("Europe/London")
    expect(v.guestsCanInvite).toBe(true)
    expect(nextHour(new Date(2026, 9, 15, 11, 0)).start).toEqual(new Date(2026, 9, 15, 12))
  })

  it("start where a slot put them", () => {
    const v = newEventValues("UTC", NOW, { start: new Date(2026, 9, 20, 14, 30) })
    expect(v.end).toEqual(new Date(2026, 9, 20, 15, 30))
  })
})

describe("an event's values", () => {
  it("read every field the API sends", () => {
    const v = eventValues(api(), [30], "UTC")
    expect(v).toMatchObject({ kind: "event", title: "Design review", location: "Studio", zone: "Europe/London", endZone: "", hue: "moss", showAs: "busy", reminders: [30] })
    expect(v.guests).toEqual([
      { uuid: "maya", email: "", name: "Maya Chen", optional: false, response: "accepted" },
      { uuid: "", email: "alex@example.com", name: "Alex Kim", optional: true, response: "needs_action" },
    ])
  })

  it("read an all-day event's last day, the day before its end date", () => {
    const v = eventValues(api({ all_day: true, start: { date: "2026-10-20" }, end: { date: "2026-10-23" } }), null, "UTC")
    expect(v.allDay).toBe(true)
    expect([v.startDate, v.lastDate]).toEqual(["2026-10-20", "2026-10-22"])
    expect(daysSpanned(v)).toBe(3)
  })

  it("keep a flight's end zone when it lands elsewhere", () => {
    const v = eventValues(api({ end: { at: new Date(2026, 9, 16, 18).toISOString(), zone: "America/New_York" } }), null, "UTC")
    expect(v.endZone).toBe("America/New_York")
  })
})

describe("what the form saves", () => {
  it("refuses a missing title, an end before the start and whole days of focus", () => {
    const v = newEventValues("UTC", NOW)
    expect(formProblem(v)).toEqual({ field: "title", message: "Give it a title" })
    expect(formProblem({ ...v, title: "Sync", end: v.start })?.message).toBe("It has to end after it starts")
    expect(formProblem({ ...v, title: "Deep work", kind: "focus", allDay: true })?.message).toBe("Focus time runs from a time to a time, not whole days")
    expect(formProblem({ ...v, title: "Sync" })).toBeNull()
  })

  it("sends dates for all day, the end the day after the last, and instants in their zones otherwise", () => {
    const v = { ...newEventValues("Europe/London", NOW), title: "Offsite", allDay: true, startDate: "2026-10-20", lastDate: "2026-10-21" }
    expect(whenOf(v)).toEqual({ start: { date: "2026-10-20" }, end: { date: "2026-10-22" } })
    const timed = { ...newEventValues("Europe/London", NOW), endZone: "America/New_York" }
    expect(whenOf(timed).start.zone).toBe("Europe/London")
    expect(whenOf(timed).end.zone).toBe("America/New_York")
  })

  it("sends a new event with its guests in their roles, its colour and what guests may do", () => {
    const v = {
      ...newEventValues("UTC", NOW),
      title: " Launch review ",
      rule: "FREQ=WEEKLY",
      hue: "sun",
      showAs: "free" as const,
      guestsCanModify: true,
      guestsCanInvite: false,
      guests: [
        { uuid: "maya", email: "", name: "Maya", optional: false },
        { uuid: "", email: "alex@example.com", name: "Alex Kim", optional: true },
      ],
    }
    const input = eventInput(v)
    expect(input).toMatchObject({ title: "Launch review", recurrence: { rule: "FREQ=WEEKLY" }, hue: "sun", transparency: "transparent", guests_can_modify: true })
    // Changing an event lets a guest invite others too.
    expect(input.guests_can_invite).toBe(true)
    expect(input.attendees).toEqual([
      { user_uuid: "maya", role: "required" },
      { email: "alex@example.com", name: "Alex Kim", role: "optional" },
    ])
  })

  it("sends focus time and time off with nobody on them, never repeating, time off as whole days", () => {
    const v = { ...newEventValues("UTC", NOW), title: "Away", kind: "out_of_office" as const, rule: "FREQ=DAILY", guests: [{ uuid: "maya", email: "", name: "Maya", optional: false }] }
    const input = eventInput(v)
    expect(input.attendees).toEqual([])
    expect(input.recurrence).toBeUndefined()
    expect(new Date(input.start.at!).getHours()).toBe(0)
  })
})

describe("a change", () => {
  const was = eventValues(api(), null, "UTC")

  it("names only what differs, at the version it was opened on", () => {
    const p = eventPatch({ ...was, title: "Design review, round 2" }, was, 4, true)
    expect(p).toEqual({ sequence: 4, title: "Design review, round 2" })
    expect(patchChanges(eventPatch(was, was, 4, true))).toBe(false)
  })

  it("names the guests when a role changes, and the times together", () => {
    const guests = was.guests.map((g) => (g.uuid === "maya" ? { ...g, optional: true } : g))
    const p = eventPatch({ ...was, guests, start: withStart(was, new Date(2026, 9, 16, 11)).start, end: withStart(was, new Date(2026, 9, 16, 11)).end }, was, 4, true)
    expect(p.attendees).toEqual([
      { user_uuid: "maya", role: "optional" },
      { email: "alex@example.com", name: "Alex Kim", role: "optional" },
    ])
    expect(p.start?.at).toBe(new Date(2026, 9, 16, 11).toISOString())
    expect(p.end?.at).toBe(new Date(2026, 9, 16, 11, 45).toISOString())
  })

  it("leaves what guests may do and Email me to the organiser", () => {
    const changed = { ...was, guestsCanSeeGuests: false, emailOnAnswers: true }
    expect(eventPatch(changed, was, 4, true)).toMatchObject({ guests_can_see_guests: false, email_on_answers: true })
    expect(eventPatch(changed, was, 4, false)).toEqual({ sequence: 4 })
  })

  it("stops a repeat with an empty rule", () => {
    const series = eventValues(api({ recurrence: { rule: "FREQ=WEEKLY" } }), null, "UTC")
    expect(eventPatch({ ...series, rule: "" }, series, 4, true).recurrence).toEqual({ rule: "" })
  })

  it("says when the reader's reminders changed", () => {
    expect(remindersChanged({ ...was, reminders: [10] }, { ...was, reminders: null })).toBe(true)
    expect(remindersChanged({ ...was, reminders: [10, 60] }, { ...was, reminders: [10, 60] })).toBe(false)
    expect(remindersChanged({ ...was, reminders: [] }, { ...was, reminders: [10] })).toBe(true)
  })
})

describe("all day", () => {
  it("turns times into their days, and days back into the times they had", () => {
    const v = { ...newEventValues("UTC", NOW, { start: new Date(2026, 9, 20, 14), end: new Date(2026, 9, 20, 15) }), title: "Offsite" }
    const on = withAllDay(v, true)
    expect([on.startDate, on.lastDate]).toEqual(["2026-10-20", "2026-10-20"])
    const off = withAllDay({ ...on, startDate: "2026-10-22", lastDate: "2026-10-23" }, false)
    expect(off.start).toEqual(new Date(2026, 9, 22, 14))
    expect(off.end).toEqual(new Date(2026, 9, 22, 15))
  })

  it("keeps an event that ends at midnight on its own day", () => {
    const v = newEventValues("UTC", NOW, { start: new Date(2026, 9, 20, 22), end: new Date(2026, 9, 21, 0) })
    expect(withAllDay(v, true).lastDate).toBe("2026-10-20")
  })
})

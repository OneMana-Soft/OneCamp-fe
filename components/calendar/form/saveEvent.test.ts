import { describe, expect, it, vi } from "vitest"

import { createEvent, saveEventChange, saveLegacyChange, type SaveDeps } from "./saveEvent"
import { eventValues, newEventValues, type EventFormValues } from "@/lib/calendar/eventForm"
import type { ApiEvent } from "@/lib/calendar/eventsApi"
import { pinTestClock } from "@/lib/testing/testClock"

// The reader's day: Thu 15 Oct 2026, 10:20.
pinTestClock(new Date(2026, 9, 15, 10, 20))

const deps = (over: Partial<SaveDeps> = {}) => {
  const makeRequest = vi.fn(async (req: { method?: string; payload?: unknown; appendToUrl?: string }) => (req.method === "POST" ? { id: "new-1" } : {}))
  return { makeRequest, askScope: vi.fn(async () => "this" as const), askTell: vi.fn(async () => "send" as const), ...over } as SaveDeps & { makeRequest: typeof makeRequest }
}

const values = (extra: Partial<EventFormValues> = {}): EventFormValues => ({ ...newEventValues("Europe/London", new Date(2026, 9, 15, 10, 20)), title: "Design review", ...extra })

const api = (extra: Partial<ApiEvent> = {}): ApiEvent => ({
  id: "0b8a3c1e-1d2f-4a5b-8c7d-9e0f1a2b3c4d",
  kind: "event",
  title: "Design review",
  notes: "",
  location: "",
  start: { at: new Date(2026, 9, 16, 9).toISOString(), zone: "Europe/London" },
  end: { at: new Date(2026, 9, 16, 10).toISOString() },
  all_day: false,
  sequence: 7,
  organiser: { user_uuid: "sam" },
  attendees: [{ user_uuid: "maya", user_name: "Maya", role: "required", response: "accepted" }],
  ...extra,
})

describe("creating an event", () => {
  it("asks before emailing a guest invited by address, and keeps Don't send", async () => {
    const d = deps({ askTell: vi.fn(async () => "none" as const) })
    const r = await createEvent(d, values({ guests: [{ uuid: "", email: "alex@example.com", name: "Alex", optional: true }] }), true)
    expect(r.saved).toBe(true)
    expect(d.askTell).toHaveBeenCalledWith("invite")
    expect(d.makeRequest.mock.calls[0][0]).toMatchObject({ method: "POST", apiEndpoint: "/calendar/events", payload: { notify: "none", attendees: [{ email: "alex@example.com", role: "optional" }] } })
  })

  it("creates nothing when the question is closed", async () => {
    const d = deps({ askTell: vi.fn(async () => null) })
    const r = await createEvent(d, values({ guests: [{ uuid: "", email: "alex@example.com", name: "Alex", optional: false }] }), true)
    expect(r).toEqual({ saved: false, why: "cancelled" })
    expect(d.makeRequest).not.toHaveBeenCalled()
  })

  it("sets the reader's own reminders on the new event, through their own route", async () => {
    const d = deps()
    await createEvent(d, values({ reminders: [30, 1440] }), true)
    expect(d.makeRequest.mock.calls[1][0]).toMatchObject({ method: "PUT", appendToUrl: "/new-1/reminders", payload: { minutes: [30, 1440] } })
  })

  it("leaves the default reminders as they are", async () => {
    const d = deps()
    await createEvent(d, values(), true)
    expect(d.makeRequest).toHaveBeenCalledTimes(1)
  })

  it("keeps to the /event routes on a server with the old stores", async () => {
    const d = deps()
    await createEvent(d, values({ kind: "focus", guests: [{ uuid: "maya", email: "", name: "Maya", optional: false }] }), false)
    expect(d.makeRequest.mock.calls[0][0]).toMatchObject({ apiEndpoint: "/event/createEvent", payload: { title: "Design review", isFocus: true, participants: [] } })
  })
})

describe("changing an event", () => {
  const was = eventValues(api(), null, "Europe/London")

  it("sends only what changed, at the version opened, after telling its guests", async () => {
    const d = deps()
    const r = await saveEventChange(d, { v: { ...was, title: "Design review, round 2" }, was, api: api(), organiser: true })
    expect(r).toEqual({ saved: true, moved: false })
    expect(d.askScope).not.toHaveBeenCalled()
    expect(d.askTell).toHaveBeenCalledWith("change")
    expect(d.makeRequest.mock.calls[0][0]).toMatchObject({ method: "PATCH", appendToUrl: `/${api().id}`, payload: { sequence: 7, title: "Design review, round 2" } })
    expect((d.makeRequest.mock.calls[0][0].payload as { attendees?: unknown }).attendees).toBeUndefined()
  })

  it("asks which of a series an instance's change is for, and closes when it moves others", async () => {
    const d = deps({ askScope: vi.fn(async () => "following" as const) })
    const instance = api({ id: `${api().id}_20261016T080000Z` })
    const r = await saveEventChange(d, { v: { ...was, notes: "Agenda" }, was, api: instance, organiser: true })
    expect(r).toEqual({ saved: true, moved: true })
    expect(d.makeRequest.mock.calls[0][0].payload).toMatchObject({ scope: "following", notes: "Agenda" })
  })

  it("sends nothing when the scope question is closed", async () => {
    const d = deps({ askScope: vi.fn(async () => null) })
    const r = await saveEventChange(d, { v: { ...was, notes: "Agenda" }, was, api: api({ id: `${api().id}_20261016T080000Z` }), organiser: true })
    expect(r).toEqual({ saved: false, why: "cancelled" })
    expect(d.makeRequest).not.toHaveBeenCalled()
  })

  it("says when someone changed it meanwhile", async () => {
    const d = deps({ makeRequest: vi.fn(async () => Promise.reject({ response: { status: 409 } })) })
    const r = await saveEventChange(d, { v: { ...was, title: "Mine" }, was, api: api(), organiser: true })
    expect(r).toEqual({ saved: false, why: "stale" })
  })

  it("saves the reader's reminders alone when nothing else changed", async () => {
    const d = deps()
    await saveEventChange(d, { v: { ...was, reminders: [60] }, was, api: api(), organiser: true })
    expect(d.makeRequest).toHaveBeenCalledTimes(1)
    expect(d.makeRequest.mock.calls[0][0]).toMatchObject({ method: "PUT", payload: { minutes: [60] } })
  })

  it("keeps to the /event routes' fields for the old stores", async () => {
    const d = deps()
    await saveLegacyChange(d, "e1", values({ guests: [{ uuid: "maya", email: "", name: "Maya", optional: true }, { uuid: "", email: "alex@example.com", name: "Alex", optional: false }] }))
    expect(d.makeRequest.mock.calls[0][0]).toMatchObject({ apiEndpoint: "/event/updateEvent/e1", payload: { participants: ["maya"] }, failureTitle: "Couldn't save the event" })
  })
})

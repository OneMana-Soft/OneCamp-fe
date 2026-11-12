import { describe, expect, it, vi } from "vitest"
import { act, renderHook } from "@testing-library/react"
import { AxiosError, type AxiosAdapter, type InternalAxiosRequestConfig } from "axios"

import { createEvent, saveEventChange, saveLegacyChange, type SaveDeps } from "./saveEvent"
import { eventValues, newEventValues, type EventFormValues } from "@/lib/calendar/eventForm"
import type { ApiEvent } from "@/lib/calendar/eventsApi"
import { MAX_EVENT_FILES } from "@/lib/calendar/eventFiles"
import { pinTestClock } from "@/lib/testing/testClock"
import axiosInstance from "@/lib/axiosInstance"
import { usePost } from "@/hooks/usePost"
import { useToast, useToastState } from "@/hooks/use-toast"

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
  it("says a calendar read-only in its provider in the server's words, and any other refusal as before (V-594)", async () => {
    const msg = "This calendar is read-only in Outlook. Put the event on another calendar."
    const refused = deps({ makeRequest: vi.fn(async () => Promise.reject({ response: { status: 409, data: { code: "calendar_read_only", msg } } })) })
    expect(await createEvent(refused, values({ calendarId: "cal-o" }), true)).toEqual({ saved: false, why: "read_only", message: msg })
    const failed = deps({ makeRequest: vi.fn(async () => Promise.reject({ response: { status: 500, data: { msg: "boom" } } })) })
    expect(await createEvent(failed, values(), true)).toEqual({ saved: false, why: "failed" })
  })

  // DESIGN-BUILD-123 F2: the form's Calendar row says that refusal, so no toast says it again (at 390 one covered
  // the Title); any other refusal is said once, in a toast. Through the real usePost, request interceptor and toasts.
  it("says a read-only calendar's refusal at the row alone, and any other refusal in exactly one toast", async () => {
    let answer = { status: 409, data: { code: "calendar_read_only", msg: "This calendar is read-only in Google. Put the event on another calendar." } as object }
    const adapter: AxiosAdapter = async (config: InternalAxiosRequestConfig) => {
      throw new AxiosError(`Request failed with status code ${answer.status}`, "ERR_BAD_RESPONSE", config, null, { status: answer.status, statusText: "", data: answer.data, headers: {}, config })
    }
    const before = axiosInstance.defaults.adapter
    axiosInstance.defaults.adapter = adapter
    const toasts = renderHook(() => useToastState())
    const { result: post } = renderHook(() => usePost())
    const { result: tray } = renderHook(() => useToast())
    const refuse = async (calendarId: string) => {
      act(() => tray.current.dismiss())
      let done: unknown
      await act(async () => {
        done = await createEvent(deps({ makeRequest: post.current.makeRequest }), values({ calendarId }), true)
      })
      // A turn later, as the shared write-failure toast comes (V-397).
      await act(() => new Promise<void>((r) => setTimeout(r, 0)))
      return { done, shown: toasts.result.current.toasts.filter((t) => t.open).map((t) => `${t.title}: ${t.description}`) }
    }
    const readOnly = await refuse("cal-g")
    expect(readOnly.done).toMatchObject({ saved: false, why: "read_only" })
    expect(readOnly.shown).toEqual([])
    answer = { status: 500, data: { msg: "The calendar store didn't answer." } }
    const other = await refuse("cal-w")
    expect(other.done).toEqual({ saved: false, why: "failed" })
    expect(other.shown).toEqual([expect.stringContaining("The calendar store didn't answer.")])
    axiosInstance.defaults.adapter = before
  })

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

  it("says a refused link in the app's error toast, and keeps what saved, so the panel reads again what the event links", async () => {
    // An older server refuses a task (EVLINK head B lands after head A; a 400 is never dropped in silence).
    const adapter: AxiosAdapter = async (config: InternalAxiosRequestConfig) => {
      if (config.method === "post") {
        const data = { msg: "A file on an event is a doc or a board." }
        throw new AxiosError("Request failed with status code 400", "ERR_BAD_REQUEST", config, null, { status: 400, statusText: "", data, headers: {}, config })
      }
      return { status: 200, statusText: "", data: { msg: "ok", data: {} }, headers: {}, config }
    }
    const before = axiosInstance.defaults.adapter
    axiosInstance.defaults.adapter = adapter
    const toasts = renderHook(() => useToastState())
    const { result: post } = renderHook(() => usePost())
    // The toasts are the app's one tray: a toast an earlier test left open isn't this save's.
    const { result: tray } = renderHook(() => useToast())
    act(() => tray.current.dismiss())
    let done: unknown
    await act(async () => {
      done = await saveEventChange(deps({ makeRequest: post.current.makeRequest }), { v: { ...was, files: [{ kind: "task", uuid: "9d1c0000-0000-4000-8000-000000000003" }] }, was, api: api(), organiser: true })
    })
    await act(() => new Promise<void>((r) => setTimeout(r, 0)))
    axiosInstance.defaults.adapter = before
    expect(done).toEqual({ saved: true, moved: false })
    expect(toasts.result.current.toasts.filter((t) => t.open).map((t) => `${t.title}: ${t.description}`)).toEqual(["Couldn't link it to the event: A file on an event is a doc or a board."])
  })

  it("takes a link off before it adds one, so an event holding all it can takes a swap", async () => {
    const full = Array.from({ length: MAX_EVENT_FILES }, (_, i) => ({ kind: "doc" as const, uuid: `d0c00000-0000-4000-8000-${String(i).padStart(12, "0")}` }))
    const task = { kind: "task" as const, uuid: "9d1c0000-0000-4000-8000-000000000003" }
    const d = deps()
    const r = await saveEventChange(d, { v: { ...was, files: [...full.slice(1), task] }, was: { ...was, files: full }, api: api(), organiser: true })
    expect(r).toEqual({ saved: true, moved: false })
    expect(d.makeRequest.mock.calls.map(([req]) => `${req.method} ${req.appendToUrl}`)).toEqual([`DELETE /${api().id}/files/doc/${full[0].uuid}`, `POST /${api().id}/files`])
    expect(d.makeRequest.mock.calls[1][0].payload).toEqual(task)
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

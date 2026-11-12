import { afterEach, describe, expect, it, vi } from "vitest"
import type { CalendarEventInterface } from "@/types/calendar"
import { pinTestClock } from "@/lib/testing/testClock"
import { bookedMeetingConfirm } from "./bookedMeeting"
import { deleteEventRequest } from "./confirmDelete"
import { deleteEvent, trashRoute, type DeleteDeps } from "./deleteEvent"
import { calendarPlace } from "./route"
import type { RepeatScope } from "./repeat"
import type { TellChoice } from "@/components/calendar/tellGuestsDialog"

pinTestClock()

// The shared Undo toast (components/ui/undoToast) says through the app's own toast.
const said = vi.hoisted(() => vi.fn())
vi.mock("@/hooks/use-toast", () => ({ toast: said, useToast: () => ({ toast: said }) }))

describe("the request that deletes an event", () => {
  it("goes to the event's own address, and a refusal says what didn't happen", () => {
    const request = deleteEventRequest("e1")
    expect(`${request.apiEndpoint}${request.appendToUrl}`).toBe("/event/deleteEvent/e1")
    expect(request).toMatchObject({ method: "DELETE", showErrorToast: true, failureTitle: "Couldn't delete the event" })
  })
})

// CAL-40: a delete said "This can't be undone." though the event goes to the
// Trash, offered no Undo, and never asked whether to tell its guests.
describe("deleting an event", () => {
  const SERIES = "6f1c2a9e-3b7d-4c5e-9a1f-2b3c4d5e6f70"
  const dentist = { event_uuid: "e1", event_title: "Dentist", event_start_time: "2026-10-15T09:00:00.000Z", event_end_time: "2026-10-15T10:00:00.000Z", event_created_by: { user_uuid: "me", user_name: "Sam" } }
  const review = { ...dentist, event_uuid: "e2", event_title: "Design review", event_guests: [{ user_uuid: "me", role: "required", response: "accepted" }, { email: "alex@example.com", role: "required", response: "needs_action" }] }
  const booked = { ...dentist, event_uuid: "e3", event_title: "Intro call", event_booking: { guest_name: "Alex Kim", page_title: "Intro call", guest_told: true } }
  const instance = { ...dentist, event_uuid: `${SERIES}_20261015T090000Z`, event_title: "Standup" }

  type Asked = { title: string; description?: string; action?: { label: string; onClick: () => void }; onConfirm: () => Promise<void> }
  /** The calendar's side of a delete, each part a mock: the one store, nobody asked anything closed. */
  const depsWith = (full = true) => ({
    makeRequest: vi.fn<(req: unknown) => Promise<unknown>>(async () => ({})),
    askScope: vi.fn<(action: "delete") => Promise<RepeatScope | null>>(async () => "this"),
    askTell: vi.fn<(action: string) => Promise<TellChoice | null>>(async () => "send"),
    confirm: vi.fn<(c: Asked) => void>(),
    toast: vi.fn<(t: Asked) => object>(() => ({})),
    action: vi.fn((label: string, alt: string, onClick: () => void) => ({ label, alt, onClick })),
    gone: vi.fn<(id: string) => void>(),
    back: vi.fn(async () => undefined),
    openTrash: vi.fn(),
    full,
  })
  const run = (deps: ReturnType<typeof depsWith>, ev: object) => deleteEvent(deps as unknown as DeleteDeps, ev as CalendarEventInterface)
  /** Every word a delete put in front of the person: its questions and its toasts. */
  const wordsOf = (deps: ReturnType<typeof depsWith>) =>
    [...deps.confirm.mock.calls, ...deps.toast.mock.calls, ...said.mock.calls].map(([c]) => `${c.title} ${c.description ?? ""}`)
  const requests = (deps: ReturnType<typeof depsWith>) => deps.makeRequest.mock.calls.map(([r]) => r as { method: string; apiEndpoint: string; appendToUrl: string })
  const undoOf = () => (said.mock.calls.at(-1)![0].action as { props: { onClick: () => Promise<void> } }).props.onClick

  afterEach(() => said.mockReset())

  it("on the one store nothing says it can't be undone", async () => {
    const all = []
    for (const ev of [dentist, review, booked, instance]) {
      const deps = depsWith()
      await run(deps, ev)
      await deps.confirm.mock.calls[0]?.[0].onConfirm()
      await vi.waitFor(() => expect(said.mock.calls.length + deps.toast.mock.calls.length).toBeGreaterThan(0))
      all.push(...wordsOf(deps))
      said.mockReset()
    }
    expect(all.length).toBeGreaterThanOrEqual(4)
    for (const w of all) expect(w).not.toMatch(/can't be undone|for good/i)
  })

  it("sends the version read with it, where the event's panel has one", async () => {
    const deps = depsWith()
    await deleteEvent(deps as unknown as DeleteDeps, dentist as unknown as CalendarEventInterface, 4)
    expect(requests(deps)).toEqual([expect.objectContaining({ appendToUrl: "/e1?scope=all&sequence=4" })])
    // Its Undo's toast comes once its chunk is in: waited for, so it is no later test's.
    await vi.waitFor(() => expect(said).toHaveBeenCalled())
  })

  it("with nobody else on it, goes to the Trash at once, and Undo brings it back", async () => {
    const deps = depsWith()
    await run(deps, dentist)
    expect(deps.confirm).not.toHaveBeenCalled()
    expect(deps.askTell).not.toHaveBeenCalled()
    expect(requests(deps)).toEqual([expect.objectContaining({ method: "DELETE", apiEndpoint: "/calendar/events", appendToUrl: "/e1?scope=all" })])
    expect(deps.gone).toHaveBeenCalledWith("e1")
    await vi.waitFor(() => expect(said).toHaveBeenCalledWith(expect.objectContaining({ title: "Deleted “Dentist”" })))
    await undoOf()()
    expect(requests(deps)[1]).toMatchObject({ method: "POST", apiEndpoint: "/calendar/events", appendToUrl: "/e1/restore" })
    expect(deps.back).toHaveBeenCalled()
    expect(said).toHaveBeenLastCalledWith(expect.objectContaining({ title: "Undone" }))
  })

  it("with guests, asks Tell your guests it's cancelled? as its one question: Don't send deletes without emailing them", async () => {
    const deps = depsWith()
    deps.askTell.mockResolvedValue("none")
    await run(deps, review)
    expect(deps.askTell).toHaveBeenCalledWith("delete")
    expect(deps.confirm).not.toHaveBeenCalled()
    expect(requests(deps)[0].appendToUrl).toBe("/e2?scope=all&notify=none")
    await vi.waitFor(() => expect(said).toHaveBeenCalledWith(expect.objectContaining({ title: "Deleted “Design review”", description: "Guests weren't emailed." })))
  })

  it("keeps a meeting with guests when Tell your guests is closed", async () => {
    const deps = depsWith()
    deps.askTell.mockResolvedValue(null)
    await run(deps, review)
    expect(deps.makeRequest).not.toHaveBeenCalled()
    expect(deps.gone).not.toHaveBeenCalled()
  })

  it("asks first for a booked meeting, naming its guest, and offers its Trash rather than Undo", async () => {
    const deps = depsWith()
    await run(deps, booked)
    expect(deps.confirm).toHaveBeenCalledWith(expect.objectContaining({ ...bookedMeetingConfirm(booked.event_booking, "delete"), destructive: true }))
    expect(deps.makeRequest).not.toHaveBeenCalled()
    await deps.confirm.mock.calls[0][0].onConfirm()
    expect(requests(deps)[0].appendToUrl).toBe("/e3?scope=all")
    expect(deps.toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Deleted “Intro call”", action: expect.objectContaining({ label: "Open Trash" }) }))
    expect(said).not.toHaveBeenCalled()
  })

  it("sends a booked meeting's delete at the version read, where the event's panel has one", async () => {
    const deps = depsWith()
    await deleteEvent(deps as unknown as DeleteDeps, booked as unknown as CalendarEventInterface, 4)
    await deps.confirm.mock.calls[0][0].onConfirm()
    expect(requests(deps)).toEqual([expect.objectContaining({ method: "DELETE", appendToUrl: "/e3?scope=all&sequence=4" })])
  })

  it("asks which of a series go, and says they wait in the Trash", async () => {
    const deps = depsWith()
    deps.askScope.mockResolvedValue("following")
    await run(deps, instance)
    expect(requests(deps)[0].appendToUrl).toBe(`/${instance.event_uuid}?scope=following`)
    expect(deps.toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Moved “Standup” to the Trash", action: expect.objectContaining({ label: "Open Trash" }) }))
    deps.toast.mock.calls[0][0].action!.onClick()
    expect(deps.openTrash).toHaveBeenCalled()
  })

  it("keeps the event when the request is refused, as the request's toast says", async () => {
    const deps = depsWith()
    deps.makeRequest.mockRejectedValue(new Error("403"))
    await run(deps, dentist)
    expect(deps.gone).not.toHaveBeenCalled()
    expect(said).not.toHaveBeenCalled()
  })

  it("on the old stores asks first, through their own route, without saying it can't be undone", async () => {
    const deps = depsWith(false)
    await run(deps, review)
    expect(deps.askTell).not.toHaveBeenCalled()
    expect(deps.confirm).toHaveBeenCalledWith(expect.objectContaining({ title: "Delete “Design review”?", description: "It's removed from everyone's calendar.", destructive: true }))
    await deps.confirm.mock.calls[0][0].onConfirm()
    expect(requests(deps)).toEqual([deleteEventRequest("e2")])
    expect(deps.gone).toHaveBeenCalledWith("e2")
  })
})

// CAL-40: a delete's Open Trash from the event's panel or page opens the calendar's Trash by its address.
describe("Open Trash's address", () => {
  it("opens the calendar where it is, its Trash open, the event deleted no longer beside it", () => {
    expect(trashRoute({ pathname: "/app/calendar", search: "?date=2026-10-19&view=week&event=e1" })).toBe("/app/calendar?date=2026-10-19&view=week&trash=1")
    expect(trashRoute({ pathname: "/app/calendar/event/e1", search: "?edit=1" })).toBe("/app/calendar?trash=1")
    expect(trashRoute({ pathname: "/app/home", search: "" })).toBe("/app/calendar?trash=1")
    // The calendar reads it as written.
    expect(calendarPlace(new URL(trashRoute({ pathname: "/app/home", search: "" }), "https://x.test").searchParams)).toEqual({ trash: true })
  })
})

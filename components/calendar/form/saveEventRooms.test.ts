import { describe, expect, it, vi } from "vitest"
import { createEvent, saveEventChange, type SaveDeps } from "@/components/calendar/form/saveEvent"
import { newEventValues } from "@/lib/calendar/eventForm"
import type { ApiEvent } from "@/lib/calendar/eventsApi"
import { pinTestClock } from "@/lib/testing/testClock"

// A fixed day, so nothing here reads the machine's clock.
pinTestClock()

// A save a room stops (gcal-6) is said at the form's Rooms row, in the
// server's words: never read as the event changed meanwhile or gone.
const ATLAS = { id: "r-atlas", name: "Atlas", building: "", floor: "", capacity: 8, features: [] }
const taken = { response: { status: 409, data: { code: "room_taken", msg: "Atlas is booked on 2026-10-21 (Design crit).", data: { room_id: "r-atlas", room: "Atlas", date: "2026-10-21", event_id: "e2", title: "Design crit" } } } }
const gone = { response: { status: 404, data: { msg: "That room isn't available." } } }
const deps = (error: unknown) => ({
  makeRequest: vi.fn(async () => {
    throw error
  }),
  askScope: vi.fn(async () => "all" as const),
  askTell: vi.fn(async () => "all" as const),
}) as unknown as SaveDeps
const values = () => ({ ...newEventValues("Europe/London", new Date("2026-10-21T10:00:00Z")), title: "Crit", rooms: [ATLAS] })

describe("saving rooms", () => {
  it("a new event's room refusal is the server's words, a taken room marked for its way forward", async () => {
    await expect(createEvent(deps(taken), values(), true)).resolves.toEqual({ saved: false, why: "room", message: "Atlas is booked on 2026-10-21 (Design crit).", taken: true })
    await expect(createEvent(deps(gone), values(), true)).resolves.toEqual({ saved: false, why: "room", message: "That room isn't available." })
  })

  it("a change's room refusal is the room's, not a stale or gone event", async () => {
    const v = values()
    const was = { ...v, rooms: [] }
    const api = { id: "e1", sequence: 2 } as ApiEvent
    await expect(saveEventChange(deps(taken), { v, was, api, organiser: true })).resolves.toEqual({ saved: false, why: "room", message: "Atlas is booked on 2026-10-21 (Design crit).", taken: true })
    await expect(saveEventChange(deps(gone), { v, was, api, organiser: true })).resolves.toEqual({ saved: false, why: "room", message: "That room isn't available." })
    const stale = { response: { status: 409, data: { msg: "Changed meanwhile." } } }
    await expect(saveEventChange(deps(stale), { v, was, api, organiser: true })).resolves.toEqual({ saved: false, why: "stale" })
  })

  it("rooms changed on one event of a series ask the scope without \"This event\", which a series' rooms can't take", async () => {
    const v = values()
    const series = "0b1c2d3e-4f50-4a6b-8c7d-9e0f1a2b3c4d"
    const api = { id: `${series}_20261021T100000Z`, sequence: 2 } as ApiEvent
    const d = { ...deps(null), makeRequest: vi.fn(async () => undefined) } as unknown as SaveDeps
    await expect(saveEventChange(d, { v, was: { ...v, rooms: [] }, api, organiser: true })).resolves.toMatchObject({ saved: true })
    expect(d.askScope).toHaveBeenCalledWith("rooms")
    // Any other change to the one event keeps the full prompt, "This event" first.
    const other = { ...deps(null), makeRequest: vi.fn(async () => undefined) } as unknown as SaveDeps
    await saveEventChange(other, { v: { ...v, title: "Crit 2" }, was: v, api, organiser: true })
    expect(other.askScope).toHaveBeenCalledWith("change")
    // Letting every room go is a rooms change too.
    const cleared = { ...deps(null), makeRequest: vi.fn(async () => undefined) } as unknown as SaveDeps
    await saveEventChange(cleared, { v: { ...v, rooms: [] }, was: v, api, organiser: true })
    expect(cleared.askScope).toHaveBeenCalledWith("rooms")
  })
})

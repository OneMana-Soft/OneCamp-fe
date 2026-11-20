import { describe, expect, it, vi } from "vitest"
import {
  addRoom,
  draftOf,
  featuresOf,
  freeRoomsUrl,
  listRooms,
  retireRoom,
  roomBookingsUrl,
  roomChange,
  roomInputOf,
  roomRefusal,
  roomWhere,
  sameRooms,
  type Room,
  type RoomsHttp,
} from "@/lib/calendar/rooms"
import { eventInput, eventPatch, newEventValues } from "@/lib/calendar/eventForm"
import { pinTestClock } from "@/lib/testing/testClock"

// A fixed day, so nothing here reads the machine's clock.
pinTestClock()

const ATLAS: Room = { id: "r-atlas", name: "Atlas", building: "North wing", floor: "2", capacity: 8, features: ["Screen", "Whiteboard"], retired: false }
const refusal = (status: number, data: unknown) => ({ response: { status, data } })

describe("rooms (gcal-6)", () => {
  it("asks for the rooms free for a slot, sized for its people", () => {
    const from = new Date("2026-10-21T14:00:00Z")
    const to = new Date("2026-10-21T15:00:00Z")
    expect(freeRoomsUrl(from, to, 3)).toBe("/calendar/rooms/free?from=2026-10-21T14%3A00%3A00.000Z&to=2026-10-21T15%3A00%3A00.000Z&capacity=3")
    // Nobody named yet: any size.
    expect(freeRoomsUrl(from, to, 0)).toBe("/calendar/rooms/free?from=2026-10-21T14%3A00%3A00.000Z&to=2026-10-21T15%3A00%3A00.000Z")
    expect(roomBookingsUrl("r 1", from, to)).toBe("/calendar/rooms/r%201/bookings?from=2026-10-21T14%3A00%3A00.000Z&to=2026-10-21T15%3A00%3A00.000Z")
  })

  it("says where a room is and how many it seats, leaving out what it wasn't given", () => {
    expect(roomWhere(ATLAS)).toBe("North wing · Floor 2 · Seats 8")
    expect(roomWhere({ building: "", floor: "", capacity: 0 })).toBe("")
    expect(roomWhere({ building: "", floor: "Ground", capacity: 1 })).toBe("Floor Ground · Seats 1")
  })

  it("reads features as a list, once each", () => {
    expect(featuresOf(" Screen, whiteboard,,screen , Phone ")).toEqual(["Screen", "whiteboard", "Phone"])
    expect(featuresOf("")).toEqual([])
  })

  it("takes a room as typed, and names what stops it", () => {
    expect(roomInputOf({ ...draftOf(), name: "  " })).toEqual({ problem: "Give the room a name." })
    expect(roomInputOf({ ...draftOf(), name: "Atlas", capacity: "two" })).toEqual({ problem: "Say how many it seats as a whole number." })
    expect(roomInputOf({ ...draftOf(), name: "Atlas", capacity: "0" })).toEqual({ problem: "Say how many it seats as a whole number." })
    expect(roomInputOf({ name: " Atlas ", building: "North wing", floor: "2", capacity: "8", features: "Screen, Whiteboard" })).toEqual({
      input: { name: "Atlas", building: "North wing", floor: "2", capacity: 8, features: ["Screen", "Whiteboard"] },
    })
    // Seats left blank: the server keeps none.
    expect(roomInputOf({ ...draftOf(), name: "Booth" })).toEqual({ input: { name: "Booth", building: "", floor: "", capacity: 0, features: [] } })
  })

  it("sends a change as only what differs", () => {
    const d = draftOf(ATLAS)
    expect(d).toEqual({ name: "Atlas", building: "North wing", floor: "2", capacity: "8", features: "Screen, Whiteboard" })
    expect(roomChange({ ...d, capacity: "10" }, ATLAS)).toEqual({ capacity: 10 })
    expect(roomChange({ ...d, features: "Screen" }, ATLAS)).toEqual({ features: ["Screen"] })
    expect(roomChange(d, ATLAS)).toEqual({})
  })

  it("puts a room refusal in the server's words alone (which name the other event only to who may read it), a taken room marked", () => {
    const taken = refusal(409, { code: "room_taken", msg: "Atlas is booked on 2026-10-21.", data: { room_id: "r-atlas", room: "Atlas", date: "2026-10-21" } })
    expect(roomRefusal(taken)).toEqual({ message: "Atlas is booked on 2026-10-21.", taken: true })
    const seen = refusal(409, { code: "room_taken", msg: "Atlas is booked on 2026-10-21 (Design crit).", data: { room_id: "r-atlas", room: "Atlas", date: "2026-10-21", event_id: "e2", title: "Design crit" } })
    expect(roomRefusal(seen)).toEqual({ message: "Atlas is booked on 2026-10-21 (Design crit).", taken: true })
    expect(roomRefusal(refusal(409, { code: "rooms_too_many", msg: "An event books at most 5 rooms." }))).toEqual({ message: "An event books at most 5 rooms." })
    expect(roomRefusal(refusal(404, { msg: "That room isn't available." }))).toEqual({ message: "That room isn't available." })
    // Not a room's: the event's own 409 and 404 stay theirs.
    expect(roomRefusal(refusal(409, { code: "stale", msg: "Changed meanwhile." }))).toBeNull()
    expect(roomRefusal(refusal(404, { msg: "No such event." }))).toBeNull()
    expect(roomRefusal(new Error("offline"))).toBeNull()
  })

  it("compares rooms by id alone, in any order", () => {
    expect(sameRooms([{ id: "a" }, { id: "b" }], [{ id: "b" }, { id: "a" }])).toBe(true)
    expect(sameRooms([{ id: "a" }], [{ id: "a" }, { id: "b" }])).toBe(false)
  })

  it("books the chosen rooms on a new event and sends them again only when they change", () => {
    const v = { ...newEventValues("Europe/London", new Date("2026-10-21T10:00:00Z")), title: "Crit", rooms: [ATLAS] }
    expect(eventInput(v).rooms).toEqual(["r-atlas"])
    expect(eventInput({ ...v, rooms: [] }).rooms).toBeUndefined()
    // Focus time books no room.
    expect(eventInput({ ...v, kind: "focus" }).rooms).toBeUndefined()
    expect(eventPatch(v, v, 1, true).rooms).toBeUndefined()
    expect(eventPatch({ ...v, rooms: [] }, v, 1, true).rooms).toEqual([])
    expect(eventPatch(v, { ...v, rooms: [] }, 1, false).rooms).toEqual(["r-atlas"])
  })

  it("keeps rooms through the page's own client: list, add and a soft retire", async () => {
    const http = {
      get: vi.fn(async () => ({ data: { data: [ATLAS] } })),
      post: vi.fn(async (url: string) => ({ data: { data: url.endsWith("/retire") ? { ...ATLAS, retired: true } : ATLAS } })),
      patch: vi.fn(),
    }
    const client = http as unknown as RoomsHttp
    await expect(listRooms(client)).resolves.toEqual([ATLAS])
    expect(http.get).toHaveBeenCalledWith("/calendar/rooms", expect.anything())
    await addRoom(client, { name: "Atlas" })
    expect(http.post).toHaveBeenCalledWith("/admin/calendar/rooms", { name: "Atlas" }, expect.anything())
    await expect(retireRoom(client, "r-atlas")).resolves.toMatchObject({ retired: true })
    expect(http.post).toHaveBeenLastCalledWith("/admin/calendar/rooms/r-atlas/retire", {}, expect.anything())
  })
})

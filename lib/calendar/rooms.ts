// Rooms (gcal-6): the workspace's Resource Directory, kept by its admins, and
// the rooms an event books, by id. Members read the live rooms and the ones
// free for a slot; a room's bookings are busy blocks, with the event only to
// someone who may read it. Pure, and with the page's own client for the
// admin card, so a lazy chunk reaches no shared core.

import type { AxiosInstance } from "axios"

export interface Room {
  id: string
  name: string
  building: string
  floor: string
  capacity: number
  features: string[]
  retired?: boolean
}

export interface RoomInput {
  name?: string
  building?: string
  floor?: string
  capacity?: number
  features?: string[]
}

/** One booking on a room's calendar: when, and the event only to someone who may read it. */
export interface RoomBooking {
  start: string
  end: string
  busy: boolean
  event_id?: string
  title?: string
  rooms?: Room[]
}

export const ROOMS = "/calendar/rooms"
export const ADMIN_ROOMS = "/admin/calendar/rooms"
/** The server's 404 for a room that is retired or was never there. */
export const ROOM_GONE = "That room isn't available."

const span = (from: Date, to: Date) => `from=${encodeURIComponent(from.toISOString())}&to=${encodeURIComponent(to.toISOString())}`

/** The rooms free from `from` to `to` that seat `capacity` (any size below 1). */
export const freeRoomsUrl = (from: Date, to: Date, capacity: number) => `${ROOMS}/free?${span(from, to)}${capacity >= 1 ? `&capacity=${capacity}` : ""}`

export const roomBookingsUrl = (id: string, from: Date, to: Date) => `${ROOMS}/${encodeURIComponent(id)}/bookings?${span(from, to)}`

/** "North wing · Floor 2 · Seats 8", leaving out what it wasn't given. */
export function roomWhere(r: Pick<Room, "building" | "floor" | "capacity">): string {
  return [r.building.trim(), r.floor.trim() && `Floor ${r.floor.trim()}`, r.capacity > 0 && `Seats ${r.capacity}`].filter(Boolean).join(" · ")
}

/** Features typed as a list: split at commas, trimmed, once each whatever the case. */
export function featuresOf(text: string): string[] {
  const seen = new Set<string>()
  return text
    .split(",")
    .map((f) => f.trim())
    .filter((f) => f && !seen.has(f.toLowerCase()) && seen.add(f.toLowerCase()))
}

/** A room as its form holds it: text, as typed. */
export interface RoomDraft {
  name: string
  building: string
  floor: string
  capacity: string
  features: string
}

export const draftOf = (r?: Room): RoomDraft => ({
  name: r?.name ?? "",
  building: r?.building ?? "",
  floor: r?.floor ?? "",
  capacity: r && r.capacity > 0 ? String(r.capacity) : "",
  features: r?.features.join(", ") ?? "",
})

/** The room as the API takes it, or what stops it, in words. */
export function roomInputOf(d: RoomDraft): { input: Required<RoomInput> } | { problem: string } {
  const name = d.name.trim()
  if (!name) return { problem: "Give the room a name." }
  const seats = d.capacity.trim()
  if (seats && !/^\d+$/.test(seats)) return { problem: "Say how many it seats as a whole number." }
  if (seats && Number(seats) < 1) return { problem: "Say how many it seats as a whole number." }
  return { input: { name, building: d.building.trim(), floor: d.floor.trim(), capacity: seats ? Number(seats) : 0, features: featuresOf(d.features) } }
}

/** A change as the API takes it: only what differs from the room as it was. */
export function roomChange(d: RoomDraft, was: Room): RoomInput {
  const read = roomInputOf(d)
  if (!("input" in read)) return {}
  const now = read.input
  const p: RoomInput = {}
  if (now.name !== was.name) p.name = now.name
  if (now.building !== was.building) p.building = now.building
  if (now.floor !== was.floor) p.floor = now.floor
  if (now.capacity !== was.capacity) p.capacity = now.capacity
  if (now.features.join("\n") !== was.features.join("\n")) p.features = now.features
  return p
}

/**
 * A save a room stopped, in the server's words alone: its room_taken msg
 * already names the other event, and only to someone who may read it. A
 * taken room is marked, so the row can say the way forward.
 */
export interface RoomRefusal {
  message: string
  taken?: boolean
}

export function roomRefusal(e: unknown): RoomRefusal | null {
  const res = (e as { response?: { status?: number; data?: { code?: unknown; msg?: unknown } } })?.response
  const msg = typeof res?.data?.msg === "string" ? res.data.msg : ""
  if (!res || !msg) return null
  if (res.status === 404) return msg === ROOM_GONE ? { message: msg } : null
  if (res.status !== 409) return null
  if (res.data?.code === "room_taken") return { message: msg, taken: true }
  return res.data?.code === "rooms_too_many" ? { message: msg } : null
}

export const roomIds = (rooms: Pick<Room, "id">[]) => rooms.map((r) => r.id)

export function sameRooms(a: Pick<Room, "id">[], b: Pick<Room, "id">[]): boolean {
  const ka = roomIds(a).sort()
  const kb = roomIds(b).sort()
  return ka.length === kb.length && ka.every((k, i) => k === kb[i])
}

// The page's own client: the admin card takes it, and says each refusal itself.
export type RoomsHttp = Pick<AxiosInstance, "get" | "post" | "patch">
const QUIET = { suppressErrorToast: true } as const

export async function listRooms(http: RoomsHttp): Promise<Room[]> {
  const res = await http.get<{ data: Room[] }>(ROOMS, QUIET)
  return res.data?.data ?? []
}

export async function addRoom(http: RoomsHttp, input: RoomInput): Promise<Room> {
  return (await http.post<{ data: Room }>(ADMIN_ROOMS, input, QUIET)).data.data
}

export async function changeRoom(http: RoomsHttp, id: string, input: RoomInput): Promise<Room> {
  return (await http.patch<{ data: Room }>(`${ADMIN_ROOMS}/${encodeURIComponent(id)}`, input, QUIET)).data.data
}

/** Soft: the room leaves the directory and keeps its bookings. */
export async function retireRoom(http: RoomsHttp, id: string): Promise<Room> {
  return (await http.post<{ data: Room }>(`${ADMIN_ROOMS}/${encodeURIComponent(id)}/retire`, {}, QUIET)).data.data
}

export async function roomBookings(http: RoomsHttp, id: string, from: Date, to: Date): Promise<RoomBooking[]> {
  const res = await http.get<{ data: { room: Room; bookings: RoomBooking[] } }>(roomBookingsUrl(id, from, to), QUIET)
  return res.data?.data?.bookings ?? []
}

// Breakout rooms (calls package C), from the room metadata's "breakouts"
// (business/CallControl breakoutsMeta).

/** One of a call's rooms: its number, from 1, and its name. */
export interface BreakoutRoom {
  n: number
  name: string
}

/** The breakout room you're in: its number and name. */
export interface InBreakout {
  n: number
  name: string
}

/** A call's breakout rooms. */
export interface CallBreakouts {
  open: boolean
  choose: boolean
  rooms: BreakoutRoom[]
  /** Who is in which room, by call identity. */
  assigned: Readonly<Record<string, number>>
  /** When the rooms close, and when everyone is called back (ms). */
  endsAt?: number
  closingAt?: number
  /** Which room this metadata is in: 0 is the call's own room. */
  room: number
}

const MAX_ROOMS = 50

/** The "breakouts" metadata, or nothing when the call has no rooms. Pure. */
export function readBreakouts(raw: unknown): CallBreakouts | undefined {
  if (!raw || typeof raw !== "object") return undefined
  const m = raw as Record<string, unknown>
  const rooms: BreakoutRoom[] = []
  for (const r of Array.isArray(m.rooms) ? m.rooms.slice(0, MAX_ROOMS) : []) {
    const room = r as Record<string, unknown> | null
    if (room && Number.isInteger(room.n) && (room.n as number) > 0 && typeof room.name === "string" && room.name) rooms.push({ n: room.n as number, name: room.name })
  }
  if (rooms.length === 0) return undefined
  const assigned: Record<string, number> = {}
  if (m.assigned && typeof m.assigned === "object") {
    for (const [id, n] of Object.entries(m.assigned as Record<string, unknown>)) {
      if (rooms.some((r) => r.n === n)) assigned[id] = n as number
    }
  }
  const ms = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : undefined)
  const out: CallBreakouts = { open: m.open === true, choose: m.choose === true, rooms, assigned, room: Number.isInteger(m.room) ? (m.room as number) : 0 }
  const endsAt = ms(m.endsAt)
  const closingAt = ms(m.closingAt)
  if (endsAt !== undefined) out.endsAt = endsAt
  if (closingAt !== undefined) out.closingAt = closingAt
  return out
}

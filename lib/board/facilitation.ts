/**
 * Running a session on a board, as Miro does it: a timer everyone sees, dot
 * voting, and following whoever presents. The shared state lives in the
 * board's Yjs document (map "facilitation", votes in map "votes"); these are
 * the rules, pure so they are tested.
 */
import type { BoardElementLike } from "@/lib/board/notes"

export interface BoardTimer {
  /** Epoch ms when it ends; when paused, how much was left. */
  endsAt: number
  durationMs: number
  pausedLeftMs?: number
  byName: string
}

export interface BoardVoting {
  id: string
  perPerson: number
  byId: string
  byName: string
  /** Set when voting closed: counts are shown from then on. */
  closedAt?: number
}

export interface Votable {
  id: string
  text: string
  x: number
  y: number
  width: number
}

type Placed = BoardElementLike & { x?: number; y?: number; width?: number }

/** What can be voted on: notes (a shape with text in it) and loose text. */
export function votableNotes(elements: readonly Placed[]): Votable[] {
  const byId = new Map(elements.map((e) => [e.id, e]))
  const out: Votable[] = []
  for (const el of elements) {
    if (el.isDeleted) continue
    let text: string | undefined
    if (el.type === "text") {
      if (el.containerId && byId.get(el.containerId) && !byId.get(el.containerId)!.isDeleted) continue
      text = el.text
    } else {
      const bound = el.boundElements?.find((b) => b.type === "text")
      const t = bound && byId.get(bound.id)
      if (!t || t.isDeleted) continue
      text = t.text
    }
    const clean = (text ?? "").replace(/\s+/g, " ").trim()
    if (!clean) continue
    out.push({ id: el.id, text: clean.slice(0, 120), x: el.x ?? 0, y: el.y ?? 0, width: el.width ?? 0 })
  }
  return out
}

/** The votes key for a person in a round: rounds never mix. */
export const voteKey = (votingId: string, userId: string) => `${votingId}:${userId}`

/** Adds or removes one vote: one per note, perPerson in all. Null when full. */
export function toggleVote(mine: readonly string[], noteId: string, perPerson: number): string[] | null {
  if (mine.includes(noteId)) return mine.filter((id) => id !== noteId)
  if (mine.length >= perPerson) return null
  return [...mine, noteId]
}

/** Votes per note for one round, most first; notes since deleted drop out. */
export function tally(
  votes: Iterable<[string, unknown]>,
  votingId: string,
  live: ReadonlySet<string>,
): { id: string; count: number }[] {
  const counts = new Map<string, number>()
  const prefix = `${votingId}:`
  for (const [key, value] of votes) {
    if (!key.startsWith(prefix) || !Array.isArray(value)) continue
    for (const id of new Set(value.filter((v): v is string => typeof v === "string"))) {
      if (live.has(id)) counts.set(id, (counts.get(id) ?? 0) + 1)
    }
  }
  return [...counts].map(([id, count]) => ({ id, count })).sort((a, b) => b.count - a.count || a.id.localeCompare(b.id))
}

/** How long is left, never below zero. */
export function timeLeft(t: BoardTimer, now: number): number {
  return Math.max(0, t.pausedLeftMs ?? t.endsAt - now)
}

/** "4:05", "0:09", "1:00:00". */
export function formatClock(ms: number): string {
  const s = Math.ceil(ms / 1000)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = String(s % 60).padStart(2, "0")
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${m}:${sec}`
}

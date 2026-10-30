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

/**
 * A vote for each of some notes at once (the notes bar's Vote, miro-07 6): when
 * every one already has the person's vote it takes them all back, otherwise it
 * adds the ones missing. Null when that would pass perPerson; nothing changes.
 */
export function toggleVotes(mine: readonly string[], noteIds: readonly string[], perPerson: number): string[] | null {
  const ids = [...new Set(noteIds)]
  if (ids.length > 0 && ids.every((id) => mine.includes(id))) return mine.filter((id) => !ids.includes(id))
  const next = [...mine, ...ids.filter((id) => !mine.includes(id))]
  return next.length > perPerson ? null : next
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

/**
 * The compact facilitation bar's one priority (design review, 29 Oct): the steps by which its segments
 * give way when its row is short of room, first to last, each one segment's next shorter form. A name
 * gives way before any step, by itself, down to its first letter and "…"; a step comes only when that
 * isn't enough (components/board/useGiveWay measures it):
 *   followIcon     following someone, the segment is its icon: the frame's label names them;
 *   votingWord     a round someone else started says "Voting", without their name;
 *   presenterName  someone presenting is their name beside the icon, without "is presenting";
 *   votingIcon     that round is its icon;
 *   presenterIcon  someone presenting is the icon.
 * Your own state ("Presenting") and an editor's votes left never give way.
 */
export const GIVE_WAY = ["followIcon", "votingWord", "presenterName", "votingIcon", "presenterIcon"] as const
export type GiveWayStep = (typeof GIVE_WAY)[number]

/** What a compact bar says: who its presenting segment is about, and how its open round reads. */
export interface CompactBar {
  /** You present; you follow someone; someone presents and you don't follow; nobody presents. */
  presenter: "you" | "following" | "someone" | null
  /** An editor's votes left; a round someone else started, as a viewer is told it; no open round. */
  voting: "count" | "named" | null
}

const TAKES: Record<GiveWayStep, (bar: CompactBar) => boolean> = {
  followIcon: (bar) => bar.presenter === "following",
  votingWord: (bar) => bar.voting === "named",
  presenterName: (bar) => bar.presenter === "someone",
  votingIcon: (bar) => bar.voting === "named",
  presenterIcon: (bar) => bar.presenter === "someone",
}

/** The steps that change something on this bar, in GIVE_WAY's order. */
export function giveWaySteps(bar: CompactBar): GiveWayStep[] {
  return GIVE_WAY.filter((step) => TAKES[step](bar))
}

/** Each segment's form: whole, shortened, or its icon alone. */
export interface BarForms {
  /** "Following ann" or "ann is presenting"; "ann" beside the icon; the icon. */
  presenter: "full" | "name" | "icon"
  /** "Lee started voting"; "Voting"; the icon. */
  voting: "full" | "word" | "icon"
}

/** The forms of this bar's segments once its first `given` steps are taken. */
export function barForms(bar: CompactBar, given: number): BarForms {
  const taken = new Set(giveWaySteps(bar).slice(0, Math.max(0, given)))
  return {
    presenter: taken.has("followIcon") || taken.has("presenterIcon") ? "icon" : taken.has("presenterName") ? "name" : "full",
    voting: taken.has("votingIcon") ? "icon" : taken.has("votingWord") ? "word" : "full",
  }
}

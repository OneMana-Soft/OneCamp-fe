/**
 * Presenter notes (miro-28 2a), the web's one way to them: a frame's notes are read by whoever may present the board
 * (its edit right, as Present is) and written with the edit right, each write naming the version it read. The server
 * refuses a stale write (409 stale_note) with the note as it now is, so the person is told "Someone else changed these
 * notes" and keeps their text. Followers, share-link guests and call guests never ask (the server refuses them too).
 */
import { BoardsGet } from "@/services/endpoints/boards"
import { apiErrorCode } from "@/lib/utils/apiError"

/** A frame's note as the API answers it; version 0 is no note yet. */
export interface FrameNote {
  frame_id: string
  body: string
  version: number
  updated_by?: string
  updated_at?: string
}

/** The server's cap on a note's text. */
export const NOTE_MAX = 10_000

/** Where a board's notes are read; "" (no request) for anyone who may not present it. */
export function frameNotesUrl(board: string, mayPresent: boolean): string {
  return mayPresent && board ? `${BoardsGet.GetFrameNotes}/${board}` : ""
}

/** The notes in an answer, or in the cache that holds it: one that isn't a list (a proxy's or a stub's {}) is none,
 * never a throw that takes the Frames panel's rows, the slides or a save's cache update with it (V-854). */
function noteList(list: unknown): readonly FrameNote[] {
  return Array.isArray(list) ? list : []
}

/** Each frame's note by the frame's id. */
export function notesByFrame(list: readonly FrameNote[] | undefined): Map<string, FrameNote> {
  return new Map(noteList(list).map((n) => [n.frame_id, n]))
}

/** The list once `frame`'s note is saved as `saved`: in its place, or out of it when emptied (its soft delete). */
export function noteSaved(list: readonly FrameNote[] | undefined, frame: string, saved: FrameNote | null): FrameNote[] {
  const rest = noteList(list)
  if (!saved) return rest.filter((n) => n.frame_id !== frame)
  return rest.some((n) => n.frame_id === frame) ? rest.map((n) => (n.frame_id === frame ? saved : n)) : [...rest, saved]
}

/** A write refused as stale: the note as it now is (null when emptied meanwhile); null for any other failure. */
export function staleNote(error: unknown): { current: FrameNote | null } | null {
  if (apiErrorCode(error) !== "stale_note") return null
  const data = (error as { response?: { data?: { data?: FrameNote | null } } }).response?.data?.data
  return { current: data ?? null }
}

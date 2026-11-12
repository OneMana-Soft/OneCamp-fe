/**
 * The board a call was started from, handed to that call (miro-27, calls with the board): the board's "Start a call
 * in..." writes it in this tab's sessionStorage just before it opens the conversation's call page, and the call, once
 * in, reads it ONCE for its own room (the call's room is its conversation's id, services/callInviteService
 * callRefOfRoom) within two minutes, then puts it up through Call Control, whose server checks again that its
 * presenter may edit and share it. Never a URL parameter, so a crafted link can't put a board up; dropped by its one
 * read whatever it said, as the instant meeting's start hands its token (components/livekit/instantMeeting).
 */

export const BOARD_HANDOFF_KEY = "onecamp.call.board"
/** How long a handoff stays good: the call page's green room and Join, not a later call. */
export const BOARD_HANDOFF_MS = 2 * 60_000

/** Hands `board` to the call in `room` that this tab opens next. */
export function handOffBoard(room: string, board: string, now = Date.now()): void {
  if (!room || !board) return
  try {
    window.sessionStorage.setItem(BOARD_HANDOFF_KEY, JSON.stringify({ room, board, at: now }))
  } catch {
    /* a private window: the call starts with no board, which Share puts up */
  }
}

/** The board handed to the call in `room`, or "": read once, for its own room, within two minutes; dropped either way. */
export function takeBoardHandoff(room: string, now = Date.now()): string {
  let raw: string | null = null
  try {
    raw = window.sessionStorage.getItem(BOARD_HANDOFF_KEY)
    window.sessionStorage.removeItem(BOARD_HANDOFF_KEY)
  } catch {
    return ""
  }
  if (!raw || !room) return ""
  try {
    const h = JSON.parse(raw) as { room?: unknown; board?: unknown; at?: unknown } | null
    if (!h || h.room !== room || typeof h.board !== "string" || !h.board || typeof h.at !== "number") return ""
    const age = now - h.at
    return age >= 0 && age <= BOARD_HANDOFF_MS ? h.board : ""
  } catch {
    return ""
  }
}

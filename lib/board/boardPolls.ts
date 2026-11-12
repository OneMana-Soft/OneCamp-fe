import type { AxiosInstance } from "axios"
import { OWN_ERRORS } from "@/lib/http/ownErrors"
import type { Poll } from "@/lib/polls/poll"
import { MqttMessageType } from "@/services/mqttService"

// Polls on a board's slides (miro-28 to_win 4): chat's polls, each on a frame of a board. An editor starts one on the
// frame of the slide that's up; the board's list is read by whoever may open it (a share link's guest through its own
// list: the question and the tally, mine [] and can_close false); a vote, a close or a start is said on the board's
// topic as MESSAGE_POLL_UPDATE. Pure, but for the start, which takes the client it goes through.

export interface BoardPoll extends Poll {
  board_uuid: string
  frame_id: string
  created_by: string
}

export const boardPollsUrl = (board: string) => `/board/polls/${encodeURIComponent(board)}`

export const guestBoardPollsPath = (token: string) => `/guest/board-polls/${encodeURIComponent(token)}`

/** The polls in an answer (anything else is none). */
export function readPolls(data: unknown): BoardPoll[] {
  if (!Array.isArray(data)) return []
  return data.filter((p): p is BoardPoll => !!p && typeof p === "object" && typeof (p as BoardPoll).id === "string" && Array.isArray((p as BoardPoll).options))
}

/** The poll a slide shows: its frame's newest (the list is oldest first). */
export function slidePollOf(polls: readonly BoardPoll[] | undefined, frame: string): BoardPoll | undefined {
  if (!polls || !frame) return undefined
  for (let i = polls.length - 1; i >= 0; i--) if (polls[i].frame_id === frame) return polls[i]
  return undefined
}

/** The list with a poll the server sent back (a vote, a close, a start) in its place, or at its end when it's new. */
export function withPoll(polls: readonly BoardPoll[] | undefined, poll: BoardPoll): BoardPoll[] {
  const list = polls ?? []
  return list.some((p) => p.id === poll.id) ? list.map((p) => (p.id === poll.id ? poll : p)) : [...list, poll]
}

/** Whether a message on the board's topic says one of this board's polls started, or was voted in or closed. */
export function pollHeard(message: string, board: string): boolean {
  try {
    const m = JSON.parse(message) as { type?: unknown; data?: { board_uuid?: unknown } }
    return m?.type === MqttMessageType.Poll_Update && !!board && m.data?.board_uuid === board
  } catch {
    return false
  }
}

export interface NewBoardPoll {
  board_uuid: string
  frame_id: string
  question: string
  options: string[]
  multiple: boolean
}

/** Starts a poll on a frame (an editor's; 403 otherwise, 409 frame_not_on_board for a frame drawn in the last half minute). */
export async function startBoardPoll(http: Pick<AxiosInstance, "post">, poll: NewBoardPoll): Promise<BoardPoll> {
  const res = await http.post("/board/polls", poll, OWN_ERRORS)
  return res.data?.data as BoardPoll
}

import type { AxiosInstance } from "axios"
import { OWN_ERRORS } from "@/lib/http/ownErrors"

// A poll's shape and its pure parts, with the vote and the close taking the client they go through: chat's
// services/pollService wraps them with the app's axios instance, and a lazy piece (a board slide's poll) is handed
// its page's, so neither reaches the shared core through here.

export interface PollOption {
  id: string
  text: string
  votes: number
}

export interface Poll {
  id: string
  channel_uuid: string
  post_uuid?: string
  question: string
  multiple: boolean
  options: PollOption[]
  voters: number
  mine: string[]
  closes_at?: string
  closed: boolean
  can_close: boolean
}

/** What a poll's writes go through. */
export type PollClient = Pick<AxiosInstance, "post">

/** The URL a poll is read from; also its SWR key, which live updates revalidate. */
export const pollUrl = (id: string) => `/poll/${encodeURIComponent(id)}`

/** Votes `optionIds` (none takes the vote back); the poll as it now is for the voter. */
export async function sendVote<P extends Poll = Poll>(http: PollClient, id: string, optionIds: string[]): Promise<P> {
  const res = await http.post(`${pollUrl(id)}/vote`, { option_ids: optionIds }, OWN_ERRORS)
  return res.data?.data as P
}

/** Closes the poll (whoever the server lets); the poll as it now is. */
export async function sendClose<P extends Poll = Poll>(http: PollClient, id: string): Promise<P> {
  const res = await http.post(`${pollUrl(id)}/close`, undefined, OWN_ERRORS)
  return res.data?.data as P
}

/** The choice after clicking an option: toggles in a multiple-choice poll, replaces otherwise. Pure. */
export function nextChoice(poll: Pick<Poll, "multiple" | "mine">, optionId: string): string[] {
  const has = poll.mine.includes(optionId)
  if (poll.multiple) return has ? poll.mine.filter((o) => o !== optionId) : [...poll.mine, optionId]
  return has ? [] : [optionId]
}

/** Each option's share of the votes cast, rounded, for the bars. Pure. */
export function shares(options: PollOption[]): number[] {
  const total = options.reduce((n, o) => n + o.votes, 0)
  return options.map((o) => (total === 0 ? 0 : Math.round((o.votes * 100) / total)))
}

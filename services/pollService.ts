import axiosInstance, { OWN_ERRORS } from "@/lib/axiosInstance"

// Polls in channels: a message carries a poll block, and the poll itself (its
// options and votes) is read and voted on here. Every call is held to the
// reader's channel membership on the server.

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

/** The URL a poll is read from; also its SWR key, which live updates revalidate. */
export const pollUrl = (id: string) => `/poll/${encodeURIComponent(id)}`

export async function votePoll(id: string, optionIds: string[]): Promise<Poll> {
  const res = await axiosInstance.post(`${pollUrl(id)}/vote`, { option_ids: optionIds }, OWN_ERRORS)
  return res.data?.data as Poll
}

export async function closePoll(id: string): Promise<Poll> {
  const res = await axiosInstance.post(`${pollUrl(id)}/close`, undefined, OWN_ERRORS)
  return res.data?.data as Poll
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

import axiosInstance from "@/lib/axiosInstance"
import { sendClose, sendVote, type Poll } from "@/lib/polls/poll"

// Polls in channels: a message carries a poll block, and the poll itself (its
// options and votes) is read and voted on here. Every call is held to the
// reader's channel membership on the server. The shape and the pure parts are
// lib/polls/poll's, which a lazy piece reaches without the app's client.

export { nextChoice, pollUrl, shares, type Poll, type PollOption } from "@/lib/polls/poll"

export const votePoll = (id: string, optionIds: string[]): Promise<Poll> => sendVote(axiosInstance, id, optionIds)

export const closePoll = (id: string): Promise<Poll> => sendClose(axiosInstance, id)

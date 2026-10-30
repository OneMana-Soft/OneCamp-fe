"use client"

// Dot voting's shared state (miro-07 6), one hook for every place that votes:
// the facilitation bar and its dots on the notes (components/board/
// boardFacilitation), and the notes bar's Vote (components/board/notesBar).
// The round is in the board's Yjs document (map "facilitation", key
// "voting"), each person's votes in map "votes" under voteKey; the rules are
// lib/board/facilitation's, tested.

import * as React from "react"
import type { HocuspocusProvider } from "@hocuspocus/provider"
import { useToast } from "@/hooks/use-toast"
import { toggleVotes, voteKey, type BoardVoting } from "@/lib/board/facilitation"
import { ROUND_KEY, facilitationOf, roundIn } from "@/components/board/facilitationDock"

const newId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`

export interface BoardVotes {
  /** The round, open or closed; null when there's none. */
  voting: BoardVoting | null
  /** Every person's votes, as the shared map holds them, for the tally. */
  votes: [string, unknown][]
  /** This person's votes in the round. */
  myVotes: string[]
  /** How many this person has left to give. */
  votesLeft: number
  /** A round is on and this person can vote in it. */
  canVote: boolean
  /** Votes for each of these notes, or takes them all back when each has one (toggleVotes). */
  vote: (noteIds: readonly string[]) => void
  startVoting: (perPerson: number) => void
  endVoting: () => void
  clearVoting: () => void
}

export function useBoardVoting(provider: HocuspocusProvider, user: { id: string; name: string }, editable: boolean): BoardVotes {
  const yDoc = provider.document
  const yFac = React.useMemo(() => facilitationOf(yDoc), [yDoc])
  const yVotes = React.useMemo(() => yDoc.getMap<unknown>("votes"), [yDoc])
  const { toast } = useToast()

  const [voting, setVoting] = React.useState<BoardVoting | null>(() => roundIn(yFac))
  const [votes, setVotes] = React.useState<[string, unknown][]>(() => Array.from(yVotes.entries()))
  React.useEffect(() => {
    const sync = () => setVoting(roundIn(yFac))
    sync()
    yFac.observe(sync)
    return () => yFac.unobserve(sync)
  }, [yFac])
  React.useEffect(() => {
    const sync = () => setVotes(Array.from(yVotes.entries()))
    sync()
    yVotes.observe(sync)
    return () => yVotes.unobserve(sync)
  }, [yVotes])

  const myVotes = React.useMemo(() => {
    if (!voting) return [] as string[]
    const v = votes.find(([k]) => k === voteKey(voting.id, user.id))?.[1]
    return Array.isArray(v) ? (v as string[]) : []
  }, [votes, voting, user.id])
  const votesLeft = voting ? Math.max(0, voting.perPerson - myVotes.length) : 0
  const canVote = editable && !!voting && !voting.closedAt

  const vote = (noteIds: readonly string[]) => {
    if (!voting || !canVote || noteIds.length === 0) return
    const next = toggleVotes(myVotes, noteIds, voting.perPerson)
    if (!next) {
      // A refusal reads neutral: the info tile, never the success tick.
      toast(
        votesLeft === 0
          ? { title: `You've used all ${voting.perPerson} votes`, description: "Take one back to vote for something else.", tone: "info" }
          : { title: `${votesLeft} ${votesLeft === 1 ? "vote" : "votes"} left`, description: "Pick fewer notes, or take a vote back.", tone: "info" },
      )
      return
    }
    yDoc.transact(() => yVotes.set(voteKey(voting.id, user.id), next))
  }
  const startVoting = (perPerson: number) =>
    yDoc.transact(() => {
      yFac.set(ROUND_KEY, { id: newId(), perPerson, byId: user.id, byName: user.name } satisfies BoardVoting)
    })
  const endVoting = () => {
    if (voting) yDoc.transact(() => yFac.set(ROUND_KEY, { ...voting, closedAt: Date.now() }))
  }
  const clearVoting = () =>
    yDoc.transact(() => {
      if (voting) for (const k of Array.from(yVotes.keys())) if (k.startsWith(`${voting.id}:`)) yVotes.delete(k)
      yFac.delete(ROUND_KEY)
    })

  return { voting, votes, myVotes, votesLeft, canVote, vote, startVoting, endVoting, clearVoting }
}

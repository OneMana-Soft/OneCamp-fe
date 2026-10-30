import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, renderHook } from "@testing-library/react"
import * as Y from "yjs"
import { useBoardVoting } from "./useBoardVoting"
import { voteKey } from "@/lib/board/facilitation"

const toast = vi.fn()
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast }) }))

// Dot voting's shared state (miro-07 6), one hook for the facilitation bar and
// the notes bar's Vote: a round in map "facilitation", each person's votes in
// map "votes", in the board's own Yjs document.

afterEach(() => {
  cleanup()
  toast.mockReset()
})

const SAM = { id: "sam", name: "Sam" }
const LEE = { id: "lee", name: "Lee" }

function onBoard(doc: Y.Doc, user = SAM, editable = true) {
  return renderHook(() => useBoardVoting({ document: doc } as never, user, editable))
}

describe("a board's dot voting", () => {
  it("starts a round everyone sees, votes for several notes at once, and takes them back", () => {
    const doc = new Y.Doc()
    const sam = onBoard(doc)
    const lee = onBoard(doc, LEE)
    act(() => sam.result.current.startVoting(3))
    // The round is in the board's document: Lee's screen has it too.
    expect(lee.result.current.voting).toMatchObject({ perPerson: 3, byId: "sam", byName: "Sam" })
    expect(lee.result.current.canVote).toBe(true)
    act(() => sam.result.current.vote(["a", "b"]))
    expect(sam.result.current.myVotes).toEqual(["a", "b"])
    expect(sam.result.current.votesLeft).toBe(1)
    // Kept under Sam's key in the round, where Lee's tally reads it.
    const id = sam.result.current.voting!.id
    expect(doc.getMap("votes").get(voteKey(id, "sam"))).toEqual(["a", "b"])
    expect(lee.result.current.votes).toEqual([[voteKey(id, "sam"), ["a", "b"]]])
    act(() => sam.result.current.vote(["a", "b"]))
    expect(sam.result.current.myVotes).toEqual([])
  })

  it("says how many votes are left when a vote asks for more, and changes nothing", () => {
    const doc = new Y.Doc()
    const sam = onBoard(doc)
    act(() => sam.result.current.startVoting(2))
    act(() => sam.result.current.vote(["a"]))
    act(() => sam.result.current.vote(["b", "c"]))
    expect(sam.result.current.myVotes).toEqual(["a"])
    expect(toast).toHaveBeenLastCalledWith({ title: "1 vote left", description: "Pick fewer notes, or take a vote back.", tone: "info" })
    act(() => sam.result.current.vote(["b"]))
    act(() => sam.result.current.vote(["c"]))
    expect(toast).toHaveBeenLastCalledWith({ title: "You've used all 2 votes", description: "Take one back to vote for something else.", tone: "info" })
  })

  it("lets no one vote once the round has ended, or who can only view the board", () => {
    const doc = new Y.Doc()
    const sam = onBoard(doc)
    const viewer = onBoard(doc, LEE, false)
    act(() => sam.result.current.startVoting(3))
    expect(viewer.result.current.canVote).toBe(false)
    act(() => viewer.result.current.vote(["a"]))
    expect(viewer.result.current.myVotes).toEqual([])
    act(() => sam.result.current.endVoting())
    expect(sam.result.current.canVote).toBe(false)
    act(() => sam.result.current.vote(["a"]))
    expect(sam.result.current.myVotes).toEqual([])
    // Clearing ends the round and drops its votes.
    act(() => sam.result.current.clearVoting())
    expect(sam.result.current.voting).toBeNull()
  })
})

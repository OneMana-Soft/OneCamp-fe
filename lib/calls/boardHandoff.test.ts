import { afterEach, describe, expect, it } from "vitest"
import { BOARD_HANDOFF_KEY, BOARD_HANDOFF_MS, handOffBoard, takeBoardHandoff } from "@/lib/calls/boardHandoff"
import { pinTestClock } from "@/lib/testing/testClock"

// miro-27 H5b2: the board a call was started from goes up on its stage through a one-shot handoff in this tab's
// sessionStorage, never a URL, so a crafted link can't put a board up. The call reads it once, for its own room, within
// two minutes, and it is gone after that read whatever it said.
const CH = "0b6e5d4c-3b2a-4190-8f7e-6d5c4b3a2910"
const BOARD = "b0a4d000-0000-4000-8000-0000000000d4"
const T = Date.parse("2026-11-07T10:00:00Z")

pinTestClock(new Date(T))

afterEach(() => window.sessionStorage.clear())

describe("the board's handoff to the call it starts", () => {
  it("is written for the call's room and read once by that room within two minutes", () => {
    handOffBoard(CH, BOARD, T)
    expect(JSON.parse(window.sessionStorage.getItem(BOARD_HANDOFF_KEY) ?? "null")).toEqual({ room: CH, board: BOARD, at: T })
    expect(takeBoardHandoff(CH, T + BOARD_HANDOFF_MS)).toBe(BOARD)
    expect(window.sessionStorage.getItem(BOARD_HANDOFF_KEY)).toBeNull()
    expect(takeBoardHandoff(CH, T + 1)).toBe("")
  })

  it("puts nothing up in another room, and is dropped by that read", () => {
    handOffBoard(CH, BOARD, T)
    expect(takeBoardHandoff("3e9b8a7f6e5d4c439b8a9f8e7d6c5243", T + 1)).toBe("")
    expect(takeBoardHandoff(CH, T + 2)).toBe("")
  })

  it("is stale after two minutes, or when it says it was written later than now, and dropped either way", () => {
    handOffBoard(CH, BOARD, T)
    expect(takeBoardHandoff(CH, T + BOARD_HANDOFF_MS + 1)).toBe("")
    expect(window.sessionStorage.getItem(BOARD_HANDOFF_KEY)).toBeNull()
    handOffBoard(CH, BOARD, T + 60_000)
    expect(takeBoardHandoff(CH, T)).toBe("")
  })

  it("reads anything else in its place as nothing, and drops it", () => {
    for (const junk of ["not json", "null", "[]", JSON.stringify({ room: CH, board: 7, at: T }), JSON.stringify({ room: CH, board: "", at: T }), JSON.stringify({ room: CH, board: BOARD, at: "soon" })]) {
      window.sessionStorage.setItem(BOARD_HANDOFF_KEY, junk)
      expect(takeBoardHandoff(CH, T), junk).toBe("")
      expect(window.sessionStorage.getItem(BOARD_HANDOFF_KEY), junk).toBeNull()
    }
  })

  it("writes nothing without a room or a board, and leaves an earlier one in place", () => {
    handOffBoard("", BOARD, T)
    handOffBoard(CH, "", T)
    expect(window.sessionStorage.getItem(BOARD_HANDOFF_KEY)).toBeNull()
  })
})

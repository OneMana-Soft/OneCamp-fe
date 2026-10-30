import { describe, expect, it } from "vitest"
import { boardNotice, readBoardPacket } from "./callState"
import { actionDone } from "./callHosting"

// Calls package B: what the server tells the room about the board on its
// stage (business/CallControl's board packets), believed from the server only,
// and the notices a person reads for what the stage alone doesn't say.

const packet = (o: object) => new TextEncoder().encode(JSON.stringify({ v: 1, ...o }))

describe("the server's board packets", () => {
  it("believes them only from the server, never a participant", () => {
    const stopped = packet({ t: "board_stopped", by: "Priya", reason: "share_held" })
    expect(readBoardPacket(stopped, { identity: "jonas" })).toBeNull()
    expect(readBoardPacket(stopped, undefined)).toEqual({ t: "board_stopped", by: "Priya", reason: "share_held" })
  })

  it("reads a board put up and taken down, and why it left, and drops anything else", () => {
    expect(readBoardPacket(packet({ t: "board", by: "Priya" }), undefined)).toEqual({ t: "board", by: "Priya" })
    expect(readBoardPacket(packet({ t: "board_stopped", by: "Sam" }), undefined)).toEqual({ t: "board_stopped", by: "Sam" })
    expect(readBoardPacket(packet({ t: "board_stopped", by: "Priya", reason: "presenter_left" }), undefined)).toEqual({ t: "board_stopped", by: "Priya", reason: "presenter_left" })
    expect(readBoardPacket(packet({ t: "board_stopped", reason: "bored" }), undefined)).toEqual({ t: "board_stopped" })
    expect(readBoardPacket(packet({ t: "muted", by: "Sam" }), undefined)).toBeNull()
  })
})

describe("what a person reads when the board leaves the stage", () => {
  it("says hosts turned off sharing, to its presenter in their own words", () => {
    expect(boardNotice({ t: "board_stopped", by: "Priya", reason: "share_held" }, { mine: false, myName: "Sam" })).toEqual({ title: "Hosts turned off sharing, so Priya's board left the stage" })
    expect(boardNotice({ t: "board_stopped", by: "Priya", reason: "share_held" }, { mine: true, myName: "Priya" })).toEqual({ title: "Your board left the stage: hosts turned off sharing" })
  })

  it("says its presenter left the call", () => {
    expect(boardNotice({ t: "board_stopped", by: "Priya", reason: "presenter_left" }, { mine: false, myName: "Sam" })).toEqual({ title: "Priya left the call, so their board left the stage" })
  })

  it("tells a presenter someone took their board down, and nobody else, nor whoever did it", () => {
    expect(boardNotice({ t: "board_stopped", by: "Sam" }, { mine: true, myName: "Priya" })).toEqual({ title: "Sam took your board off the stage" })
    expect(boardNotice({ t: "board_stopped", by: "Priya" }, { mine: true, myName: "Priya" })).toBeNull()
    expect(boardNotice({ t: "board_stopped", by: "Sam" }, { mine: false, myName: "Jonas" })).toBeNull()
  })

  it("says nothing when a board goes up: the stage shows it", () => {
    expect(boardNotice({ t: "board", by: "Priya" }, { mine: false, myName: "Sam" })).toBeNull()
  })

  it("names nobody it wasn't told", () => {
    expect(boardNotice({ t: "board_stopped", reason: "share_held" }, { mine: false })).toEqual({ title: "Hosts turned off sharing, so the board left the stage" })
    expect(boardNotice({ t: "board_stopped", reason: "presenter_left" }, { mine: false })).toEqual({ title: "Its presenter left the call, so the board left the stage" })
    expect(boardNotice({ t: "board_stopped" }, { mine: true, myName: "Priya" })).toEqual({ title: "Someone running the call took your board off the stage" })
  })
})

describe("what undoing guests' drawing did", () => {
  it("counts the changes taken back, and says when guests changed nothing", () => {
    expect(actionDone("undo_guests", undefined, 3)).toBe("Took back 3 changes guests made")
    expect(actionDone("undo_guests", undefined, 1)).toBe("Took back 1 change guests made")
    expect(actionDone("undo_guests", undefined, 0)).toBe("Guests haven't changed the board")
  })
})

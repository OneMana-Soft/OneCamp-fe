import { describe, expect, it } from "vitest"
import { pinTestClock } from "@/lib/testing/testClock"
import { lengthOf, readBoardCalls, whereOf } from "@/lib/calls/boardCall"

pinTestClock()

const CH = "0b6e5d4c-3b2a-4190-8f7e-6d5c4b3a2910"
const ME = "1c7f6e5d-4c3b-4a21-9f8e-7d6c5b4a3021"
const LEE = "2d8a7f6e-5d4c-4b32-8a9f-8e7d6c5b4132"
const GROUP = "9f3c2b1a0e9d8c7b6a5f4e3d2c1b0a99"

const call = (o: Record<string, unknown>) => ({
  session_id: "s1", kind: "channel", conversation: CH, started_at: "2026-11-05T10:00:00Z", ended_at: "2026-11-05T10:42:00Z",
  live: false, on_stage: false, shown_by: "Maya Chen", shown_at: "2026-11-05T10:05:00Z", people: 3, artefacts: [], ...o,
})

// miro-27 H5b1: a board's calls as GET /board/getBoardCalls/{board} answers them (the latest shown first, at most 30).
describe("a board's calls", () => {
  it("splits the calls going on from the ones that ended, each with where it was, who showed the board and what it kept", () => {
    const got = readBoardCalls({
      data: {
        calls: [
          call({ session_id: "live", kind: "dm", conversation: `${ME} ${LEE}`, started_at: "2026-11-06T09:00:00Z", ended_at: undefined, live: true, on_stage: true, shown_at: "2026-11-06T09:01:00Z" }),
          call({ artefacts: [{ key: "call-s1", lines: 12, notes_doc: "doc-1", recap_chat: CH, recorded: false }, { key: "EG_1", lines: 12, recorded: true }, { lines: 3 }] }),
        ],
      },
    })
    expect(got.live).toEqual([
      { session: "live", ref: { kind: "dm", id: `${ME} ${LEE}` }, startedAt: "2026-11-06T09:00:00Z", live: true, onStage: true, shownBy: "Maya Chen", shownAt: "2026-11-06T09:01:00Z", people: 3, artefacts: [] },
    ])
    expect(got.past).toHaveLength(1)
    expect(got.past[0]).toMatchObject({ session: "s1", ref: { kind: "channel", id: CH }, live: false, onStage: false, endedAt: "2026-11-05T10:42:00Z" })
    // The one artefact parse (lib/calls/callArtefacts): a row without its key is left out.
    expect(got.past[0].artefacts).toEqual([
      { key: "call-s1", lines: 12, notes_doc: "doc-1", recap_chat: CH, recorded: false },
      { key: "EG_1", lines: 12, recorded: true },
    ])
  })

  it("leaves out a malformed call: no session, an unknown kind (a meeting), no conversation, no start, or one listed twice", () => {
    const got = readBoardCalls({
      data: {
        calls: [
          call({ session_id: "" }),
          call({ session_id: "m", kind: "meeting" }),
          call({ session_id: "n", conversation: "" }),
          call({ session_id: "t", started_at: "not a time" }),
          call({ session_id: "ok", kind: "group", conversation: GROUP, people: -2, shown_by: 7, artefacts: "none" }),
          call({ session_id: "ok", kind: "channel" }),
          null,
          "a call",
        ],
      },
    })
    expect(got.live).toEqual([])
    expect(got.past.map((c) => [c.session, c.ref.kind, c.people, c.shownBy, c.artefacts])).toEqual([["ok", "group", 0, "", []]])
  })

  it("answers nothing for an answer that isn't a list of calls", () => {
    for (const body of [undefined, null, {}, { data: null }, { data: { calls: {} } }, "calls"]) expect(readBoardCalls(body)).toEqual({ live: [], past: [] })
  })

  it("takes a call that says it is live but has an end as over, and keeps on_stage only for a live one", () => {
    const got = readBoardCalls({ data: { calls: [call({ live: true, on_stage: true })] } })
    expect(got.live).toEqual([])
    expect(got.past[0]).toMatchObject({ live: false, onStage: false })
  })

  it("lists the calls that ended newest first, and the live ones by who showed the board latest", () => {
    const got = readBoardCalls({
      data: {
        calls: [
          call({ session_id: "old", started_at: "2026-10-01T10:00:00Z", ended_at: "2026-10-01T10:30:00Z" }),
          call({ session_id: "new", started_at: "2026-11-04T10:00:00Z", ended_at: "2026-11-04T10:30:00Z" }),
          call({ session_id: "mid", started_at: "2026-10-20T10:00:00Z", ended_at: "2026-10-20T10:30:00Z" }),
          call({ session_id: "l1", live: true, ended_at: undefined, shown_at: "2026-11-06T09:00:00Z" }),
          call({ session_id: "l2", live: true, ended_at: undefined, shown_at: "2026-11-06T09:30:00Z" }),
        ],
      },
    })
    expect(got.past.map((c) => c.session)).toEqual(["new", "mid", "old"])
    expect(got.live.map((c) => c.session)).toEqual(["l2", "l1"])
  })

  it("says where a call was and how long it ran", () => {
    expect(whereOf({ kind: "channel", id: CH })).toBe("In a channel")
    expect(whereOf({ kind: "dm", id: `${ME} ${LEE}` })).toBe("In a direct message")
    expect(whereOf({ kind: "group", id: GROUP })).toBe("In a group chat")
    expect(lengthOf({ startedAt: "2026-11-05T10:00:00Z", endedAt: "2026-11-05T10:42:00Z" })).toBe("42 min")
    expect(lengthOf({ startedAt: "2026-11-05T10:00:00Z", endedAt: "2026-11-05T11:05:00Z" })).toBe("1 h 5 min")
    expect(lengthOf({ startedAt: "2026-11-05T10:00:00Z", endedAt: "2026-11-05T12:00:00Z" })).toBe("2 h")
    expect(lengthOf({ startedAt: "2026-11-05T10:00:00Z", endedAt: "2026-11-05T10:00:10Z" })).toBe("under a minute")
    expect(lengthOf({ startedAt: "2026-11-05T10:00:00Z" })).toBe("")
  })
})

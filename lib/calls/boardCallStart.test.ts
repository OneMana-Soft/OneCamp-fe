import { describe, expect, it } from "vitest"
import { readBoardCalls } from "@/lib/calls/boardCall"
import { pastPlaces, startOf } from "@/lib/calls/boardCallStart"
import { searchPlacesOf } from "@/lib/search/userAndChannel"
import { pinTestClock } from "@/lib/testing/testClock"

// miro-27 H5b2: "Start a call in..." on the board's Call. The conversations the board was called in before come first,
// from the board's own calls (only the reader's own: the server answers no other); then the search's picks: one person
// is their DM, several are a group of them, a channel or a group is itself.
const ME = "1c7f6e5d-4c3b-4a21-9f8e-7d6c5b4a3021"
const LEE = "2d8a7f6e-5d4c-4b32-8a9f-8e7d6c5b4132"
const MAYA = "4fac9b80-7f6e-4d54-8c9b-af9e8d7c6354"
const CH = "0b6e5d4c-3b2a-4190-8f7e-6d5c4b3a2910"
const GRP = "3e9b8a7f6e5d4c439b8a9f8e7d6c5243"
const call = (session: string, kind: string, conversation: string, started: string, live = false) => ({
  session_id: session, kind, conversation, started_at: started, ...(live ? { live: true } : { ended_at: started }), shown_by: "", shown_at: started, artefacts: [],
})
const answer = (calls: unknown[]) => ({ data: { calls } })

pinTestClock()

describe("the conversations a board was called in before", () => {
  it("lists each once, the latest call first, live ones too", () => {
    const calls = readBoardCalls(answer([
      call("a", "channel", CH, "2026-11-01T10:00:00Z"),
      call("b", "dm", `${ME} ${LEE}`, "2026-11-05T10:00:00Z"),
      call("c", "channel", CH, "2026-11-06T10:00:00Z", true),
      call("d", "group", GRP, "2026-11-03T10:00:00Z"),
    ]))
    expect(pastPlaces(calls).map((p) => [p.ref.kind, p.ref.id, p.at])).toEqual([
      ["channel", CH, "2026-11-06T10:00:00Z"],
      ["dm", `${ME} ${LEE}`, "2026-11-05T10:00:00Z"],
      ["group", GRP, "2026-11-03T10:00:00Z"],
    ])
  })

  it("is empty with no calls, or none read yet", () => {
    expect(pastPlaces(null)).toEqual([])
    expect(pastPlaces(readBoardCalls(answer([])))).toEqual([])
  })
})

describe("where the search's picks start a call", () => {
  const places = searchPlacesOf([
    { user_uuid: LEE, user_name: "Lee Park", user_dgraph_uid: "0x1" },
    { user_uuid: MAYA, user_name: "Maya Chen", user_dgraph_uid: "0x2" },
    { user_uuid: ME, user_name: "Me", user_dgraph_uid: "0x3" },
    { channel_uuid: CH, channel_name: "launch", channel_dgraph_uid: "0x4" },
    { grp_id: GRP, grp_name: "Design crew", grp_dgraph_uid: "0x5" },
  ] as never)
  const [lee, maya, me, channel, group] = places

  it("reads the search's answer as people, channels and groups, by their names", () => {
    expect(places.map((p) => [p.type, p.id, p.name])).toEqual([
      ["user", LEE, "Lee Park"],
      ["user", MAYA, "Maya Chen"],
      ["user", ME, "Me"],
      ["channel", CH, "launch"],
      ["groupChat", GRP, "Design crew"],
    ])
    expect(searchPlacesOf(null)).toEqual([])
    expect(searchPlacesOf([{ user_name: "no id" }] as never)).toEqual([])
  })

  it("makes one person a DM, by both people's ids as the call names it", () => {
    expect(startOf([lee], ME)).toEqual({ ref: { kind: "dm", id: [LEE, ME].sort().join(" ") } })
    expect(startOf([lee, me], ME)).toEqual({ ref: { kind: "dm", id: [LEE, ME].sort().join(" ") } })
  })

  it("makes several people a group of them, made the chat's own way", () => {
    expect(startOf([lee, maya], ME)).toEqual({ people: [LEE, MAYA] })
  })

  it("starts a channel or a group in itself", () => {
    expect(startOf([channel], ME)).toEqual({ ref: { kind: "channel", id: CH } })
    expect(startOf([group], ME)).toEqual({ ref: { kind: "group", id: GRP } })
  })

  it("starts nothing for no pick, yourself alone, or a channel mixed with anything", () => {
    expect(startOf([], ME)).toBeNull()
    expect(startOf([me], ME)).toBeNull()
    expect(startOf([channel, lee], ME)).toBeNull()
    expect(startOf([channel, group], ME)).toBeNull()
    expect(startOf([lee], "")).toBeNull()
  })
})

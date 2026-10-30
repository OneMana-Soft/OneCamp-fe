import { describe, expect, it } from "vitest"
import { readCallMetadata } from "@/components/livekit/callState"
import { breakoutChoices, myBreakout, panelPeople, secondsUntil } from "./breakoutRooms"

// Breakout rooms (calls package C, meet-10 and zoom-02): the server writes a
// call's rooms into its room's metadata under "breakouts", in the call's own
// room and in each of its rooms (business/CallControl breakoutsMeta). Every
// screen reads them from there: the rooms, who is in which, whether they are
// open, whether people choose, when they close by themselves, and when
// everyone is called back.
const meta = (breakouts: unknown) => JSON.stringify({ breakouts })

describe("a call's breakout rooms, as its metadata says", () => {
  it("reads open rooms, who is in which, and when they close", () => {
    const b = readCallMetadata(meta({ open: true, choose: false, endsAt: 1_800_000, closingAt: 1_830_000, rooms: [{ n: 1, name: "Design" }, { n: 2, name: "Build" }], assigned: { ana: 1, lee: 2 } })).breakouts
    expect(b).toEqual({ open: true, choose: false, endsAt: 1_800_000, closingAt: 1_830_000, rooms: [{ n: 1, name: "Design" }, { n: 2, name: "Build" }], assigned: { ana: 1, lee: 2 }, room: 0 })
  })

  it("reads which room this is, inside one of them", () => {
    expect(readCallMetadata(meta({ open: true, rooms: [{ n: 1, name: "Design" }], assigned: {}, room: 1 })).breakouts?.room).toBe(1)
  })

  it("has none when the call has no rooms, and drops what isn't a room", () => {
    expect(readCallMetadata(JSON.stringify({})).breakouts).toBeUndefined()
    expect(readCallMetadata(meta({ open: false, rooms: [], assigned: {} })).breakouts).toBeUndefined()
    const b = readCallMetadata(meta({ open: false, rooms: [{ n: 1, name: "Design" }, { n: "2", name: "Build" }, { n: 3 }, "x"], assigned: { ana: 1, bad: "2", far: 9 } })).breakouts
    expect(b?.rooms).toEqual([{ n: 1, name: "Design" }])
    expect(b?.assigned).toEqual({ ana: 1 })
  })
})

describe("someone's room", () => {
  const b = readCallMetadata(meta({ open: true, choose: false, rooms: [{ n: 1, name: "Design" }, { n: 2, name: "Build" }], assigned: { ana: 1 } })).breakouts!

  it("is the one they're assigned to, or none", () => {
    expect(myBreakout(b, "ana")).toEqual({ n: 1, name: "Design" })
    expect(myBreakout(b, "kai")).toBeUndefined()
  })

  it("is the only one offered while people don't choose; every room while they do, or for whoever runs the call", () => {
    expect(breakoutChoices(b, "ana", false).map((r) => r.n)).toEqual([1])
    expect(breakoutChoices(b, "kai", false)).toEqual([])
    expect(breakoutChoices(b, "kai", true).map((r) => r.n)).toEqual([1, 2])
    expect(breakoutChoices({ ...b, choose: true }, "kai", false).map((r) => r.n)).toEqual([1, 2])
  })

  it("offers nothing while the rooms are closed", () => {
    expect(breakoutChoices({ ...b, open: false }, "ana", true)).toEqual([])
  })
})

describe("a countdown", () => {
  it("counts whole seconds up to a moment, never below none", () => {
    expect(secondsUntil(31_000, 1_000)).toBe(30)
    expect(secondsUntil(1_500, 1_000)).toBe(1)
    expect(secondsUntil(1_000, 2_000)).toBe(0)
    expect(secondsUntil(undefined, 2_000)).toBeUndefined()
  })
})

// The host's rooms panel names everyone, wherever they are (the live walk of
// 28 Oct read "Design · 2 people · 2 more"): someone who went to a room is
// no longer in the host's own room, so their name comes from when they were.
describe("whom the rooms panel names and places", () => {
  const ana = { identity: "ana", name: "Ana Diaz" }
  const lee = { identity: "lee", name: "Lee Park" }
  const kai = { identity: "guest-kai", name: "Kai Lin" }
  const b = readCallMetadata(meta({ open: true, rooms: [{ n: 1, name: "Design" }, { n: 2, name: "Build" }], assigned: { ana: 1, "guest-kai": 2, sam: 1 } })).breakouts

  it("is everyone in your room, then everyone in a room whom this screen has seen", () => {
    const seen = new Map([ana, lee, kai].map((p) => [p.identity, p]))
    expect(panelPeople([lee], seen, b, "sam")).toEqual([lee, ana, kai])
  })

  it("leaves out someone in a room this screen never saw, for the panel to count", () => {
    expect(panelPeople([lee], new Map([[lee.identity, lee]]), b, "sam")).toEqual([lee])
  })

  it("never lists you, here or in a room, nor anyone twice", () => {
    const sam = { identity: "sam", name: "Sam Rivera" }
    const seen = new Map([ana, sam].map((p) => [p.identity, p]))
    expect(panelPeople([sam, ana], seen, b, "sam")).toEqual([ana])
  })

  it("is your room alone before there are rooms", () => {
    expect(panelPeople([ana, lee], new Map([[kai.identity, kai]]), undefined, "sam")).toEqual([ana, lee])
  })
})


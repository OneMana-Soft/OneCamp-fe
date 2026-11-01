import { afterEach, describe, expect, it } from "vitest"
import { cleanup, render } from "@testing-library/react"
import { RoomContext } from "@livekit/components-react"
import { ParticipantKind, RoomEvent } from "livekit-client"
import { TRANSCRIBER_IDENTITY } from "@/lib/calls/signals"
import { hash32 } from "@/lib/campHue"
import { personHue } from "@/lib/utils/getAvatarColor"
import { fakeCallRoom } from "@/lib/testing/callRoom"
import { callHues, callName, roomPeople, useCallHues, type CallPerson } from "./callHues"

// Each person's colour in a call (V-190): two people whose names hash to one
// hue drew in one colour, so a shared screen's strokes couldn't be told apart.
const at = (s: number) => new Date(s * 1000)
const SAM: CallPerson = { identity: "u-sam", name: "Sam Rivera", joinedAt: at(10) }
const LENA: CallPerson = { identity: "u-lena", name: "Lena Ortiz", joinedAt: at(20) }

afterEach(() => cleanup())

describe("each person's colour in a call", () => {
  it("gives two people whose names share a hue two colours, the first to join keeping theirs", () => {
    expect(personHue("Lena Ortiz")).toBe(personHue("Sam Rivera"))
    const hues = callHues([LENA, SAM])
    expect(hues.get("u-sam")).toBe(personHue("Sam Rivera"))
    expect(hues.get("u-lena")).toBeTruthy()
    expect(hues.get("u-lena")).not.toBe(hues.get("u-sam"))
  })

  it("keys a guest on the name the call shows, as their tile does", () => {
    expect(callName("guest-kai", "Guest: Kai Lin")).toBe("Kai Lin")
    expect(callName("u-sam", "Sam Rivera")).toBe("Sam Rivera")
    // The raw "Guest: Kai Lin" hashes to lake, Sam's; the name the call shows is berry, which is free.
    const hues = callHues([SAM, { identity: "guest-kai", name: "Guest: Kai Lin", joinedAt: at(20) }])
    expect(hues.get("guest-kai")).toBe(personHue("Kai Lin"))
  })

  it("settles people who joined in the same second by their name's hash, so every screen agrees", () => {
    const same = { ...LENA, joinedAt: at(10) }
    const a = callHues([SAM, same])
    const b = callHues([same, SAM])
    expect([...a].sort()).toEqual([...b].sort())
    expect(new Set(a.values()).size).toBe(2)
    // The name's hash decides who keeps the hue they share, never the identity: Sam's name hashes before Lena's,
    // while her identity sorts before his.
    expect(hash32("sam rivera")).toBeLessThan(hash32("lena ortiz"))
    const sam = { ...SAM, identity: "u-z-sam", joinedAt: at(10) }
    const lena = { ...LENA, identity: "u-a-lena", joinedAt: at(10) }
    for (const hues of [callHues([sam, lena]), callHues([lena, sam])]) {
      expect(hues.get("u-z-sam")).toBe(personHue("Sam Rivera"))
      expect(hues.get("u-a-lena")).not.toBe(personHue("Lena Ortiz"))
    }
  })

  it("never recolours anyone when someone joins after them", () => {
    const before = callHues([SAM, LENA])
    const after = callHues([SAM, LENA, { identity: "u-kai", name: "Kai Lin", joinedAt: at(30) }])
    expect(after.get("u-sam")).toBe(before.get("u-sam"))
    expect(after.get("u-lena")).toBe(before.get("u-lena"))
  })

  it("leaves agents out: they keep their own tint and take nobody's hue", () => {
    const hues = callHues([
      { identity: "agent-1", name: "Sam Rivera", joinedAt: at(1), kind: ParticipantKind.AGENT },
      { identity: TRANSCRIBER_IDENTITY, name: "Sam Rivera", joinedAt: at(2) },
      SAM,
    ])
    expect(hues.has("agent-1")).toBe(false)
    expect(hues.has(TRANSCRIBER_IDENTITY)).toBe(false)
    expect(hues.get("u-sam")).toBe(personHue("Sam Rivera"))
  })

  it("draws a person again in their own hue once the one who had it leaves", () => {
    // You are Jo Park (moss); Sam Rivera joined before Lena Ortiz, and both hash to lake.
    const f = fakeCallRoom()
    Object.assign(f.room.localParticipant, { sid: "PA_jo", name: "Jo Park", joinedAt: at(5) })
    const sam = Object.assign(f.room.remoteParticipants.get("ana")!, { sid: "PA_ana", name: "Sam Rivera", joinedAt: at(10) })
    Object.assign(f.room.remoteParticipants.get("ben")!, { sid: "PA_ben", name: "Lena Ortiz", joinedAt: at(20) })
    const seen: string[] = []
    function Probe() {
      const hueOf = useCallHues()
      seen.push(`${hueOf("ana", "Sam Rivera")} ${hueOf("ben", "Lena Ortiz")}`)
      return null
    }
    render(
      <RoomContext.Provider value={f.room as never}>
        <Probe />
      </RoomContext.Provider>,
    )
    const [samHue, lenaHue] = seen.at(-1)!.split(" ")
    expect(samHue).toBe(personHue("Sam Rivera"))
    expect(lenaHue).not.toBe(samHue)
    // Sam leaves: lake is free again, so Lena is drawn in her own hue.
    f.room.remoteParticipants.delete("ana")
    f.emit(RoomEvent.ParticipantDisconnected, sam)
    expect(seen.at(-1)!.split(" ")[1]).toBe(personHue("Lena Ortiz"))
  })

  it("holds still while the call connects: nobody has a join time until the server gives them one", () => {
    // LiveKit reads a join time it hasn't been told (yours, before the call connects) as now: a new one at every read.
    // The colours keyed on it changed at every render, and the call stopped on React's update limit as you joined.
    const f = fakeCallRoom()
    let now = 0
    Object.defineProperty(f.room.localParticipant, "joinedAt", { get: () => new Date(++now * 1000), configurable: true })
    let hue = ""
    function Probe() {
      hue = useCallHues()("sam", "Sam Rivera")
      return null
    }
    render(
      <RoomContext.Provider value={f.room as never}>
        <Probe />
      </RoomContext.Provider>,
    )
    expect(hue).toBe(personHue("Sam Rivera"))
  })

  it("takes a join time only from someone the server has described, who has a sid", () => {
    const f = fakeCallRoom()
    Object.assign(f.room.localParticipant, { sid: "PA_sam", joinedAt: at(5) })
    Object.assign(f.room.remoteParticipants.get("ana")!, { joinedAt: at(7) })
    expect(roomPeople(f.room as never).map((p) => [p.identity, p.joinedAt?.getTime()])).toEqual([
      ["sam", 5000],
      ["ana", undefined],
      ["ben", undefined],
    ])
  })
})

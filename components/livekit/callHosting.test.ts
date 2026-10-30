import { describe, expect, it } from "vitest"
import { controlNotice, readCallMetadata, readControlPacket, removedText } from "./callState"
import { actionDone } from "./callHosting"
import { readFileSync } from "fs"
import { callCurrentPath, callReadKeyOf, callRefOf } from "@/services/callService"

// Call Control's words and readers: what the server tells the room and each
// person, read the one way, and believed from the server only.

const packet = (o: object) => new TextEncoder().encode(JSON.stringify({ v: 1, ...o }))

describe("the call's settings in the room's metadata", () => {
  it("reads the lock, the spotlight and joining muted beside what was there", () => {
    const m = readCallMetadata(JSON.stringify({ isRecording: true, recordingStartedBy: "Sam", locked: { by: "Maya", since: 5 }, spotlight: { identity: "0x2", by: "Maya" }, muteOnEntry: true }))
    expect(m.recording).toMatchObject({ on: true, by: "Sam" })
    expect(m.locked).toEqual({ by: "Maya", since: 5 })
    expect(m.spotlight).toEqual({ identity: "0x2", by: "Maya" })
    expect(m.muteOnEntry).toBe(true)
  })

  it("takes anything malformed as nothing set", () => {
    const m = readCallMetadata(JSON.stringify({ locked: "yes", spotlight: { identity: "" }, muteOnEntry: "true" }))
    expect(m.locked).toBeUndefined()
    expect(m.spotlight).toBeUndefined()
    expect(m.muteOnEntry).toBe(false)
    expect(readCallMetadata("not json").muteOnEntry).toBe(false)
  })

  // Package B: the board on the stage rides under "board" (business/CallControl metaBoard).
  it("reads the board on the stage: which, whose, who draws and whether guests do", () => {
    const m = readCallMetadata(JSON.stringify({ board: { uuid: "b-1", by: "0x2", draw: "presenter", guests: true } }))
    expect(m.board).toEqual({ uuid: "b-1", by: "0x2", draw: "presenter", guests: true })
    // The server's defaults: everyone draws, guests don't.
    expect(readCallMetadata(JSON.stringify({ board: { uuid: "b-1", by: "0x2" } })).board).toEqual({ uuid: "b-1", by: "0x2", draw: "everyone", guests: false })
  })

  it("takes no board, or a board without its id, as none on the stage", () => {
    expect(readCallMetadata(JSON.stringify({ isRecording: false })).board).toBeUndefined()
    expect(readCallMetadata(JSON.stringify({ board: null })).board).toBeUndefined()
    expect(readCallMetadata(JSON.stringify({ board: { by: "0x2", draw: "everyone" } })).board).toBeUndefined()
    expect(readCallMetadata(JSON.stringify({ board: "b-1" })).board).toBeUndefined()
  })
})

describe("the server's notices", () => {
  it("believes them only from the server, never a participant", () => {
    const muted = packet({ t: "muted", by: "Maya", source: "camera" })
    expect(readControlPacket(muted, { identity: "jonas" })).toBeNull()
    expect(readControlPacket(muted, undefined)).toEqual({ t: "muted", by: "Maya", source: "camera", all: false })
  })

  it("reads each kind, and drops what it doesn't know", () => {
    expect(readControlPacket(packet({ t: "muted", by: "Maya", source: "microphone", reason: "all" }), undefined)).toMatchObject({ t: "muted", all: true })
    expect(readControlPacket(packet({ t: "ask_unmute", by: "Maya" }), undefined)).toEqual({ t: "ask_unmute", by: "Maya", all: false })
    expect(readControlPacket(packet({ t: "role", role: "host", reason: "handed_on" }), undefined)).toMatchObject({ t: "role", role: "host", handedOn: true })
    expect(readControlPacket(packet({ t: "role", role: "admin" }), undefined)).toBeNull()
    expect(readControlPacket(packet({ t: "ended", by: "Maya" }), undefined)).toEqual({ t: "ended", by: "Maya" })
    expect(readControlPacket(packet({ t: "unmuted" }), undefined)).toBeNull()
  })

  it("says who did what, and what the person can do now", () => {
    expect(controlNotice({ t: "muted", by: "Maya", source: "microphone", all: false }).title).toBe("Maya muted you")
    expect(controlNotice({ t: "muted", by: "Maya", source: "microphone", all: true }).title).toBe("Maya muted everyone")
    expect(controlNotice({ t: "muted", by: "Maya", source: "camera", all: false }).title).toBe("Maya turned off your camera")
    expect(controlNotice({ t: "ask_unmute", by: "Maya", all: false })).toEqual({ title: "Maya asks you to unmute", detail: "Your microphone stays off unless you turn it on." })
    expect(controlNotice({ t: "role", role: "cohost", by: "Maya", handedOn: false }).title).toBe("Maya made you a co-host")
    expect(controlNotice({ t: "role", role: "host", handedOn: true }).title).toBe("You're the host now")
    expect(controlNotice({ t: "muted", source: "microphone", all: false }).title).toBe("Someone running the call muted you")
  })
})

describe("the end of a call that was locked or ended for everyone", () => {
  it("says why, with no way back in", () => {
    expect(removedText({ reason: "locked" })).toMatchObject({ title: "This call is locked" })
    expect(removedText({ reason: "locked" }, true)).toMatchObject({ title: "This meeting is locked" })
    expect(removedText({ reason: "ended", by: "Maya" })).toEqual({ title: "The call has ended", detail: "Maya ended it for everyone." })
    expect(removedText({ reason: "ended" }, true)).toEqual({ title: "The meeting has ended", detail: "It was ended for everyone." })
  })
})

describe("what an action did, said when nothing on the screen shows it", () => {
  it("counts people, and says when there was nothing to do", () => {
    expect(actionDone("mute_all", undefined, 3)).toBe("Muted 3 people")
    expect(actionDone("mute_all", undefined, 0)).toBe("Everyone is already muted")
    expect(actionDone("ask_all_unmute", undefined, 1)).toBe("Asked 1 person to unmute")
    expect(actionDone("ask_unmute", "Maya", 1)).toBe("Asked Maya to unmute")
    expect(actionDone("lock", undefined, 1)).toBeNull()
  })
})

describe("which call a page reads", () => {
  it("names a DM by both people, sorted, and waits for who is signed in", () => {
    expect(callRefOf("chat", "b-uuid", "a-uuid")).toEqual({ kind: "dm", id: "a-uuid b-uuid" })
    expect(callRefOf("chat", "b-uuid")).toBeNull()
    expect(callRefOf("channel", "c1")).toEqual({ kind: "channel", id: "c1" })
    expect(callRefOf("meeting", "m1")).toEqual({ kind: "meeting", id: "m1" })
    expect(callRefOf("group", "")).toBeNull()
  })

  it("asks the server for it with its id encoded", () => {
    expect(callCurrentPath({ kind: "dm", id: "a b" })).toBe("/calls/current?kind=dm&id=a%20b")
    expect(callCurrentPath(null)).toBe("")
  })

  it("is read again when the server says its call changed, under the key the page reads", () => {
    // The server names a DM's call by both people, sorted (MqttCallState).
    expect(callReadKeyOf({ resource_kind: "dm", resource_id: "a-uuid b-uuid", live: true })).toBe(callCurrentPath(callRefOf("chat", "b-uuid", "a-uuid")))
    expect(callReadKeyOf({ resource_kind: "channel", resource_id: "c1" })).toBe(callCurrentPath(callRefOf("channel", "c1")))
    expect(callReadKeyOf({ resource_kind: "meeting", resource_id: "m1" })).toBe("/calls/current?kind=meeting&id=m1")
    for (const junk of [null, undefined, "x", {}, { resource_kind: "task", resource_id: "t1" }, { resource_kind: "channel", resource_id: "" }, { resource_kind: "channel", resource_id: 7 }]) {
      expect(callReadKeyOf(junk)).toBe("")
    }
  })

  it("is passed on by the app's message handler, which keeps no call code", () => {
    const handler = readFileSync("hooks/useMqttMessageHandler.ts", "utf8")
    const at = handler.indexOf("case MqttMessageType.Call_State")
    expect(at, "the handler has no case for Call_State").toBeGreaterThan(-1)
    // It writes the event's name itself (no import on every page); useCallSession.test holds it equal to CALL_STATE_EVENT.
    expect(handler.slice(at, handler.indexOf("break", at))).toContain('new CustomEvent("onecamp:call-state"')
    // The handler loads with every page: the call's own code stays out of it.
    expect(handler).not.toMatch(/from "@\/services\/callService"|from "@\/components\/livekit/)
  })
})

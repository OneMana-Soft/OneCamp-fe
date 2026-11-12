import { afterEach, describe, expect, it } from "vitest"
import { NO_RINGS, callOnScreen, callerReduce, facesAt, mayTakeFocus, readRingMessage, ringDoor, ringLine, ringRefusal, ringSaid, ringSummary, ringsReduce, sessionYouAreIn, type CallerRing, type RingMessage, type RingsState } from "@/lib/calls/ring"
import type { CallSessionRead } from "@/components/livekit/callState"
import { CHIME_EVERY_MS, chimeTimes } from "@/lib/calls/ringTone"
import { pinTestClock } from "@/lib/testing/testClock"

pinTestClock()

const NOW = Date.parse("2026-11-05T12:00:00Z")
const MAYA = { uuid: "maya", name: "Maya Rao", profile: "profiles/maya.png" }
const ring = (session: string, extra: Record<string, unknown> = {}) =>
  readRingMessage({ state: "ring", session, caller: MAYA, resource: { kind: "dm", uuid: "jonas maya" }, ring_until: new Date(NOW + 30_000).toISOString(), ...extra }) as RingMessage
const heard = (s: RingsState, msg: RingMessage | null, inCall?: string) => ringsReduce(s, { type: "message", msg: msg as RingMessage, now: NOW, inCall })
const sessions = (s: RingsState) => s.rings.map((r) => r.session).join(",")

describe("a MESSAGE_CALL_RING, read (slack-06 H2)", () => {
  it("reads a ring with who calls, where, until when and whether quiet", () => {
    expect(ring("s1", { quiet: true })).toEqual({
      state: "ring",
      session: "s1",
      caller: MAYA,
      resource: { kind: "dm", uuid: "jonas maya" },
      until: NOW + 30_000,
      quiet: true,
    })
  })
  it("reads stop, declined and ringing; refuses anything else", () => {
    expect(readRingMessage({ state: "stop", session: "s1" })).toEqual({ state: "stop", session: "s1" })
    expect(readRingMessage({ state: "declined", session: "s1", by: { uuid: "jonas", name: "Jonas" } })?.by).toEqual({ uuid: "jonas", name: "Jonas" })
    const ringing = readRingMessage({ state: "ringing", session: "s1", ring_until: new Date(NOW).toISOString(), people: [{ uuid: "ana", name: "Ana", quiet: true }] })
    expect(ringing?.people).toEqual([{ uuid: "ana", name: "Ana", quiet: true }])
    for (const bad of [null, "ring", {}, { state: "ring" }, { state: "dance", session: "s1" }, { state: "ring", session: "s1" }, { state: "ring", session: "s1", caller: MAYA, resource: { kind: "channel", uuid: "c" }, ring_until: "x" }]) {
      expect(readRingMessage(bad), JSON.stringify(bad)).toBeNull()
    }
  })
})

describe("the callee's rings", () => {
  it("a ring shows, and stops on stop", () => {
    const s = heard(NO_RINGS, ring("s1"))
    expect(sessions(s)).toBe("s1")
    expect(sessions(heard(s, readRingMessage({ state: "stop", session: "s1" })))).toBe("")
  })
  it("hides on Escape or Decline, and a late copy of the same ring stays away", () => {
    const s = ringsReduce(heard(NO_RINGS, ring("s1")), { type: "hide", session: "s1" })
    expect(sessions(s)).toBe("")
    expect(sessions(heard(s, ring("s1")))).toBe("")
  })
  it("stops by itself at ring_until", () => {
    const s = heard(NO_RINGS, ring("s1"))
    expect(sessions(ringsReduce(s, { type: "tick", now: NOW + 29_999 }))).toBe("s1")
    expect(sessions(ringsReduce(s, { type: "tick", now: NOW + 30_000 }))).toBe("")
  })
  it("a ring already over, or for the call you're in, never shows", () => {
    expect(sessions(heard(NO_RINGS, ring("s1", { ring_until: new Date(NOW - 1).toISOString() })))).toBe("")
    expect(sessions(heard(NO_RINGS, ring("s1"), "s1"))).toBe("")
    expect(sessions(heard(NO_RINGS, ring("s1"), "s2"))).toBe("s1")
  })
  it("two rings at once: both, the newest first; a repeat of one doesn't double it", () => {
    let s = heard(NO_RINGS, ring("s1"))
    s = heard(s, ring("s2", { caller: { uuid: "ana", name: "Ana" } }))
    s = heard(s, ring("s1"))
    expect(sessions(s)).toBe("s2,s1")
  })
  // Ring again (slack-06 H2): the caller rings the same call again, with a
  // later ring_until; an app left open still hears it. A late copy of a ring
  // carries the same ring_until, and stays away.
  const later = (session: string, ms: number) => ring(session, { ring_until: new Date(NOW + 30_000 + ms).toISOString() })
  it("after a Decline, a Ring again rings; a copy of the declined ring stays away", () => {
    const s = ringsReduce(heard(NO_RINGS, ring("s1")), { type: "hide", session: "s1" })
    expect(sessions(heard(s, ring("s1")))).toBe("")
    expect(sessions(heard(s, later("s1", 40_000)))).toBe("s1")
  })
  it("after a ring's end with no answer, a Ring again rings", () => {
    const s = ringsReduce(heard(NO_RINGS, ring("s1")), { type: "tick", now: NOW + 30_000 })
    expect(sessions(s)).toBe("")
    expect(sessions(ringsReduce(s, { type: "message", msg: later("s1", 40_000), now: NOW + 45_000 }))).toBe("s1")
  })
  it("after a stop, a Ring again rings; a copy of the stopped ring stays away", () => {
    const s = heard(heard(NO_RINGS, ring("s1")), readRingMessage({ state: "stop", session: "s1" }))
    expect(sessions(heard(s, ring("s1")))).toBe("")
    expect(sessions(heard(s, later("s1", 40_000)))).toBe("s1")
    // A stop with no ring held (the starter's own app, as the call starts) keeps the server's 30 s ring away, and no more.
    const started = heard(NO_RINGS, readRingMessage({ state: "stop", session: "s2" }))
    expect(sessions(heard(started, ring("s2")))).toBe("")
    expect(sessions(heard(started, later("s2", 1)))).toBe("s2")
  })
  it("the caller's messages change nothing here", () => {
    const s = heard(NO_RINGS, ring("s1"))
    expect(heard(s, readRingMessage({ state: "declined", session: "s1", by: { uuid: "j", name: "J" } }))).toBe(s)
  })
})

describe("the caller's ring, per person", () => {
  const people = [MAYA, { uuid: "ana", name: "Ana" }, { uuid: "sam", name: "Sam Lee" }]
  const start = callerReduce(null, readRingMessage({ state: "ringing", session: "s1", ring_until: new Date(NOW + 30_000).toISOString(), people }) as RingMessage) as CallerRing
  const declined = (who: string, s: CallerRing | null = start) => callerReduce(s, readRingMessage({ state: "declined", session: "s1", by: { uuid: who, name: who } }) as RingMessage) as CallerRing

  it("rings each, then each settles: declined, or no answer at ring_until; one who joins is gone", () => {
    expect(facesAt(start, NOW, []).map((f) => f.state)).toEqual(["ringing", "ringing", "ringing"])
    const s = declined("ana")
    expect(facesAt(s, NOW, ["sam"]).map((f) => `${f.uuid}:${f.state}`)).toEqual(["maya:ringing", "ana:declined"])
    expect(facesAt(s, NOW + 30_000, []).map((f) => `${f.uuid}:${f.state}`)).toEqual(["maya:no_answer", "ana:declined", "sam:no_answer"])
  })
  it("a decline of another call, or before any ringing, changes nothing; a new ringing starts over", () => {
    expect(callerReduce(start, readRingMessage({ state: "declined", session: "s9", by: { uuid: "ana", name: "Ana" } }) as RingMessage)).toBe(start)
    expect(declined("ana", null)).toBeNull()
    const again = callerReduce(declined("ana"), readRingMessage({ state: "ringing", session: "s1", ring_until: new Date(NOW + 90_000).toISOString(), people: [{ uuid: "ana", name: "Ana" }] }) as RingMessage)
    expect(again && facesAt(again, NOW + 60_000, []).map((f) => f.state)).toEqual(["ringing"])
  })
  it("a DM says the person's first name; a group counts, and sums up the settled ones only", () => {
    const dm: CallerRing = { session: "s1", until: NOW + 30_000, people: [MAYA], declined: [] }
    expect(ringSummary(facesAt(dm, NOW, []))).toEqual({ headline: "Ringing Maya…", summary: "Up to 30 seconds", settled: false })
    expect(ringSummary(facesAt({ ...dm, declined: ["maya"] }, NOW, []))).toEqual({ headline: "Maya declined", summary: "", settled: true })
    expect(ringSummary(facesAt(dm, NOW + 30_000, []))).toEqual({ headline: "Maya didn't answer", summary: "", settled: true })
    const five: CallerRing = { session: "s1", until: NOW + 30_000, people: ["a", "b", "c", "d", "e"].map((u) => ({ uuid: u, name: u })), declined: ["a", "b"] }
    expect(ringSummary(facesAt(five, NOW, []))).toEqual({ headline: "Ringing 5 people…", summary: "2 declined", settled: false })
    expect(ringSummary(facesAt(five, NOW + 30_000, []))).toEqual({ headline: "Nobody picked up", summary: "2 declined · 3 didn't answer", settled: true })
  })
})

describe("the ring's tone", () => {
  const base = { now: NOW, until: NOW + 30_000, quiet: false, inCall: false, reduced: false }
  it("chimes at once and every CHIME_EVERY_MS until the ring stops", () => {
    expect(CHIME_EVERY_MS).toBe(3000)
    expect(chimeTimes(base)).toEqual([0, 3000, 6000, 9000, 12000, 15000, 18000, 21000, 24000, 27000])
    expect(chimeTimes({ ...base, now: NOW + 25_000 })).toEqual([0, 3000])
  })
  it("never when quiet or over; once in a call or with reduced motion", () => {
    expect(chimeTimes({ ...base, quiet: true })).toEqual([])
    expect(chimeTimes({ ...base, now: NOW + 30_000 })).toEqual([])
    expect(chimeTimes({ ...base, inCall: true })).toEqual([0])
    expect(chimeTimes({ ...base, reduced: true })).toEqual([0])
  })
})

describe("where a ring's Accept goes, and what it says (slack-06 H2)", () => {
  const dm = ringsReduce(NO_RINGS, { type: "message", msg: ring("s1"), now: NOW }).rings[0]
  const grp = ringsReduce(NO_RINGS, { type: "message", msg: ring("s2", { resource: { kind: "group", uuid: "grp-123456" } }), now: NOW }).rings[0]
  it("opens a DM's call by its caller, and a group's by the group", () => {
    expect(ringDoor(dm, "jonas")).toBe("/app/meet/chat/maya")
    expect(ringDoor(grp, "jonas")).toBe("/app/meet/grp/grp-123456")
  })
  it("finds the call on screen: the call's page, else the first call beside it", () => {
    expect(callOnScreen("/app/meet/chat/maya-1234", [])).toEqual({ at: { kind: "chat", id: "maya-1234" }, pane: -1 })
    expect(callOnScreen("/app/channel/ch-123456", [{ kind: "doc", id: "doc-123456" }, { kind: "call-group", id: "grp-123456" }])).toEqual({ at: { kind: "group", id: "grp-123456" }, pane: 1 })
    expect(callOnScreen("/app/channel/ch-123456", [{ kind: "chat", id: "maya-1234" }])).toBeNull()
  })
  it("says you're in a call only while its read has you in it", () => {
    const read = (people: { identity: string; user_uuid?: string; in_call: boolean }[], live = true) =>
      ({ live, session: { id: "s9", people: people.map((p) => ({ name: "x", role: "participant", ...p })) } }) as CallSessionRead
    expect(sessionYouAreIn(read([{ identity: "jonas", user_uuid: "jonas", in_call: true }]), "jonas")).toBe("s9")
    expect(sessionYouAreIn(read([{ identity: "jonas", in_call: true }]), "jonas")).toBe("s9")
    expect(sessionYouAreIn(read([{ identity: "jonas", user_uuid: "jonas", in_call: false }, { identity: "sam", in_call: true }]), "jonas")).toBe("")
    expect(sessionYouAreIn(read([{ identity: "jonas", in_call: true }], false), "jonas")).toBe("")
    expect(sessionYouAreIn(undefined, "jonas")).toBe("")
  })
  it("says who calls where: you, a named group with its count, or a group of n; and that you're in a call", () => {
    expect(ringLine(dm, undefined, false)).toBe("Calling you")
    expect(ringLine(dm, undefined, true)).toBe("Calling you · You're in a call")
    expect(ringLine(grp, { name: "Launch crew", people: 5 }, false)).toBe("Calling Launch crew · 5 people")
    expect(ringLine(grp, { people: 5 }, false)).toBe("Calling a group of 5")
    expect(ringLine(grp, undefined, false)).toBe("Calling a group")
    expect(ringSaid(dm, undefined)).toBe("Maya Rao is calling you")
    expect(ringSaid(grp, { name: "Launch crew", people: 5 })).toBe("Maya Rao is calling Launch crew")
  })
  it("says a refusal in words, never a code; a lost Decline says nothing", () => {
    expect(ringRefusal(404, undefined)).toBe("That call is over.")
    expect(ringRefusal(409, "in_call")).toBe("You're already in that call.")
    expect(ringRefusal(409, "not_in_call")).toBe("Join the call to ring again.")
    expect(ringRefusal(429, "still_ringing")).toBe("It's still ringing.")
    expect(ringRefusal(429, "ring_limit")).toBe("This call can't ring anyone again.")
    expect(ringRefusal(undefined, undefined)).toBe("")
    expect(ringRefusal(500, undefined)).toBe("")
  })
})

describe("a ring's card takes the focus only when nobody is typing (slack-06 H2)", () => {
  afterEach(() => {
    document.body.innerHTML = ""
  })
  it("takes it from the page, a link or a button", () => {
    expect(mayTakeFocus(document)).toBe(true)
    document.body.innerHTML = `<button id="b">Open</button>`
    ;(document.getElementById("b") as HTMLElement).focus()
    expect(mayTakeFocus(document)).toBe(true)
  })
  it("never from a field, a text area or an editor", () => {
    for (const html of [`<input id="f">`, `<textarea id="f"></textarea>`, `<div id="f" contenteditable="true" tabindex="0"></div>`, `<select id="f"><option>a</option></select>`]) {
      document.body.innerHTML = html
      ;(document.getElementById("f") as HTMLElement).focus()
      expect(mayTakeFocus(document), html).toBe(false)
    }
  })
  it("never while a dialog is open", () => {
    document.body.innerHTML = `<div role="dialog" aria-modal="true"><button>Close</button></div>`
    expect(mayTakeFocus(document)).toBe(false)
  })
})

import { describe, expect, it } from "vitest"
import { heldReason, heldSummary, holdNotice, joinHeldNotice, letThroughDone, mayPublish, readHoldPacket } from "./callHolds"
import { readCallMetadata } from "./callState"

// meet-12: what the people running a call hold for everyone else, as every
// screen hears it from the server and says it.

const packet = (o: object) => new TextEncoder().encode(JSON.stringify({ v: 1, ...o }))

describe("the room's metadata", () => {
  it("names what the call holds, and nothing it doesn't know", () => {
    expect([...readCallMetadata(JSON.stringify({ held: ["chat", "microphone", "everything"] })).held]).toEqual(["chat", "microphone"])
    expect(readCallMetadata(JSON.stringify({ held: null })).held.size).toBe(0)
    expect(readCallMetadata("not json").held.size).toBe(0)
  })
})

describe("the server's word on a hold", () => {
  it("is read from the server only, for a hold it knows", () => {
    expect(readHoldPacket(packet({ t: "held", by: "Maya Chen", source: "chat" }), undefined)).toEqual({ t: "held", by: "Maya Chen", what: "chat", on: true })
    expect(readHoldPacket(packet({ t: "unheld", by: "Maya Chen", source: "share" }), undefined)).toEqual({ t: "held", by: "Maya Chen", what: "share", on: false })
    expect(readHoldPacket(packet({ t: "allowed", by: "Maya Chen", source: "microphone" }), undefined)).toEqual({ t: "allowed", by: "Maya Chen", what: "microphone", on: true })
    expect(readHoldPacket(packet({ t: "disallowed", source: "microphone" }), undefined)).toEqual({ t: "allowed", by: undefined, what: "microphone", on: false })
    // A participant can't tell the room a host turned chat off; nor can anyone name a hold there isn't.
    expect(readHoldPacket(packet({ t: "held", by: "Maya Chen", source: "chat" }), { identity: "leo" })).toBeNull()
    expect(readHoldPacket(packet({ t: "held", source: "everything" }), undefined)).toBeNull()
    expect(readHoldPacket(packet({ t: "muted", source: "microphone" }), undefined)).toBeNull()
  })

  it("says who changed what, for everyone and for the one let through", () => {
    expect(holdNotice({ t: "held", by: "Maya Chen", what: "chat", on: true }, true)).toEqual({ title: "Maya Chen turned off chat for everyone", detail: "You can still read it." })
    expect(holdNotice({ t: "held", by: "Maya Chen", what: "microphone", on: true }, true)).toEqual({ title: "Maya Chen turned off microphones for everyone", detail: "Raise your hand to ask to talk." })
    expect(holdNotice({ t: "held", by: "Maya Chen", what: "share", on: true }, true).title).toBe("Maya Chen turned off screen sharing for everyone")
    expect(holdNotice({ t: "held", by: "Maya Chen", what: "camera", on: false }, true).title).toBe("Maya Chen let everyone turn on their video again")
    expect(holdNotice({ t: "allowed", by: "Maya Chen", what: "microphone", on: true }, true).title).toBe("Maya Chen let you talk")
    expect(holdNotice({ t: "allowed", what: "share", on: false }, true).title).toBe("Someone running the call stopped letting you share your screen")
  })

  it("tells someone the hold doesn't hold (who runs the call, or is let through) what changed, and nothing to do about it", () => {
    expect(holdNotice({ t: "held", by: "Maya Chen", what: "microphone", on: true }, false)).toEqual({ title: "Maya Chen turned off microphones for everyone" })
    expect(holdNotice({ t: "held", by: "Maya Chen", what: "chat", on: true }, false)).toEqual({ title: "Maya Chen turned off chat for everyone" })
  })

  it("says why a control is off where it is, and what letting someone through did", () => {
    expect(heldReason("chat")).toBe("The people running the call have turned off chat for now.")
    expect(heldReason("react")).toBe("The people running the call have turned off reactions.")
    expect(letThroughDone("microphone", "Sam", true)).toBe("Sam can talk now")
    expect(letThroughDone("share", undefined, false)).toBe("They can't share their screen now")
  })
})

describe("joining a call that holds your microphone or camera", () => {
  it("reads the call server's permission: what a hold leaves out, and nothing when it says nothing", () => {
    const MIC = 2
    expect(mayPublish({ canPublish: true, canPublishSources: [1, 3, 4] }, MIC)).toBe(false)
    expect(mayPublish({ canPublish: true, canPublishSources: [1, 2] }, MIC)).toBe(true)
    // An empty list is every source; no publishing at all is none.
    expect(mayPublish({ canPublish: true, canPublishSources: [] }, MIC)).toBe(true)
    expect(mayPublish({ canPublish: false, canPublishSources: [] }, MIC)).toBe(false)
    expect(mayPublish(undefined, MIC)).toBe(true)
  })

  it("says what was left off, once", () => {
    expect(joinHeldNotice(true, false).title).toBe("You joined muted")
    expect(joinHeldNotice(false, true).title).toBe("You joined with your camera off")
    expect(joinHeldNotice(true, true).title).toBe("You joined with your microphone and camera off")
  })
})

describe("heldSummary", () => {
  it("says in one line what's off for everyone, or that nothing is", () => {
    expect(heldSummary([])).toBe("Nothing is turned off")
    expect(heldSummary(["chat"])).toBe("Off for everyone: chat")
  })

  // The switches' order put microphones last, so a cut line lost the hold
  // that matters most (DESIGN-BUILD-19, 26 Oct).
  it("leads with microphones and video, whatever order the switches come in", () => {
    expect(heldSummary(["chat", "microphone"])).toBe("Off for everyone: microphones, chat")
    expect(heldSummary(["share", "chat", "react", "microphone", "camera"])).toBe("Off for everyone: microphones, video, screen sharing, chat, reactions")
  })
})

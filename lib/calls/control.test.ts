import { describe, expect, it } from "vitest"
import { boardControls, callActions, heldFor, holdSwitches, partOf, personActions, roleLabel, type CallAbility, type CallTarget } from "./control"
import { holdsOf, type CallHold } from "./holds"

// Call Control on this side: a screen offers exactly what the server allows,
// read from the attributes only the server sets.

const can = (...a: CallAbility[]) => new Set<CallAbility>(a)
const HOST = { role: "host" as const, can: can("mute", "mute_all", "ask_unmute", "remove", "lock", "end", "cohost", "spotlight", "mute_on_entry"), identity: "sam" }
const COHOST = { role: "cohost" as const, can: can("mute", "mute_all", "ask_unmute", "remove", "lock", "spotlight", "mute_on_entry"), identity: "ana" }
const target = (o: Partial<CallTarget> = {}): CallTarget => ({ identity: "maya", role: "participant", guest: false, micOn: true, cameraOn: true, sharing: false, ...o })
const labels = (a: { label: string }[]) => a.map((x) => x.label)

describe("partOf", () => {
  it("reads the part and abilities the server set, and nothing it didn't", () => {
    expect(partOf({ "oc.role": "cohost", "oc.can": "mute,remove, lock" })).toEqual({ role: "cohost", can: can("mute", "remove", "lock"), allowed: new Set() })
    const forged = partOf({ "oc.role": "owner", "oc.can": "mute,delete_workspace", "oc.allowed": "microphone,everything" })
    expect(forged.role).toBe("participant")
    expect([...forged.can]).toEqual(["mute"])
    expect([...forged.allowed!]).toEqual(["microphone"])
    expect(partOf(undefined)).toEqual({ role: "participant", can: new Set(), allowed: new Set() })
  })

  it("reads whether someone runs the call's polls and Q&A (calls package A)", () => {
    expect(partOf({ "oc.role": "host", "oc.can": "mute,activities" }).can).toEqual(can("mute", "activities"))
    expect(partOf({ "oc.role": "participant", "oc.can": "" }).can.has("activities")).toBe(false)
  })

  it("names hosts, co-hosts and invitees, and nobody else", () => {
    expect([roleLabel("host"), roleLabel("cohost"), roleLabel("participant"), roleLabel("guest")]).toEqual(["Host", "Co-host", null, null])
    // Someone in by a call's invite isn't in its conversation: everyone in the call can see so (HU13).
    expect(partOf({ "oc.role": "invitee", "oc.can": "" })).toEqual({ role: "invitee", can: new Set(), allowed: new Set() })
    expect(roleLabel("invitee")).toBe("Invited")
  })
})

describe("personActions", () => {
  it("offers a host everything that fits the person, the danger last", () => {
    expect(labels(personActions(HOST, target()))).toEqual(["Mute", "Stop video", "Spotlight for everyone", "Make co-host", "Remove from call"])
    expect(labels(personActions(HOST, target({ micOn: false, cameraOn: false, sharing: true })))).toEqual(["Stop sharing", "Ask to unmute", "Spotlight for everyone", "Make co-host", "Remove from call"])
    expect(personActions(HOST, target()).at(-1)).toMatchObject({ action: "remove", danger: true })
  })

  it("lets a co-host act on participants but never put a host out or name co-hosts", () => {
    expect(labels(personActions(COHOST, target()))).toEqual(["Mute", "Stop video", "Spotlight for everyone", "Remove from call"])
    expect(labels(personActions(COHOST, target({ identity: "sam", role: "host" })))).toEqual(["Spotlight for everyone"])
  })

  it("never offers to remove or make a co-host of an equal, nor a guest a co-host", () => {
    expect(labels(personActions(HOST, target({ role: "host" })))).toEqual(["Mute", "Stop video", "Spotlight for everyone"])
    expect(labels(personActions(HOST, target({ role: "guest", guest: true })))).not.toContain("Make co-host")
    expect(labels(personActions(HOST, target({ role: "cohost" })))).toContain("Remove as co-host")
  })

  it("lets equals in a DM or a group mute each other and nothing more", () => {
    const equal = { role: "participant" as const, can: can("mute", "mute_all", "ask_unmute"), identity: "sam" }
    expect(labels(personActions(equal, target()))).toEqual(["Mute", "Stop video"])
  })

  it("leaves your own controls to the dock, but lets you spotlight yourself", () => {
    expect(labels(personActions(HOST, target({ identity: "sam", role: "host" })))).toEqual(["Spotlight for everyone"])
  })

  it("offers to end the spotlight on whoever is in it", () => {
    expect(labels(personActions(HOST, target(), "maya"))).toContain("Take out of the spotlight")
  })

  it("offers nothing to someone who runs nothing", () => {
    expect(personActions({ role: "participant", can: can(), identity: "sam" }, target())).toEqual([])
  })
})

// meet-12: what the people running a call hold for everyone else, as the server holds it.
const holds = (...h: CallHold[]) => new Set<CallHold>(h)

describe("holds", () => {
  it("reads only the holds the server names", () => {
    expect([...holdsOf(["chat", "microphone", "everything", 4])]).toEqual(["chat", "microphone"])
    expect(holdsOf(undefined).size).toBe(0)
    expect(holdsOf("chat").size).toBe(0)
  })

  it("holds everyone but the people running the call, less what someone was let through", () => {
    const h = holds("microphone", "chat")
    expect([...heldFor(h, { role: "participant" })]).toEqual(["microphone", "chat"])
    expect([...heldFor(h, { role: "guest" })]).toEqual(["microphone", "chat"])
    expect([...heldFor(h, { role: "invitee", allowed: holds("microphone") })]).toEqual(["chat"])
    expect(heldFor(h, { role: "host" }).size).toBe(0)
    expect(heldFor(h, { role: "cohost" }).size).toBe(0)
    expect(heldFor(holds(), { role: "participant" }).size).toBe(0)
  })

  it("offers whoever may hold to let a held person talk or share, and to take it back", () => {
    const HOLDER = { ...COHOST, can: can("mute", "hold") }
    const h = holds("microphone", "share", "chat")
    expect(personActions(HOLDER, target({ micOn: false }), undefined, h).filter((a) => a.action === "allow")).toEqual([
      { action: "allow", what: "microphone", on: true, label: "Let them talk" },
      { action: "allow", what: "share", on: true, label: "Let them share" },
    ])
    expect(labels(personActions(HOLDER, target({ role: "guest", guest: true, allowed: holds("microphone") }), undefined, h))).toContain("Stop letting them talk")
    // Nothing held, nothing to let through; nobody who runs the call is held.
    expect(labels(personActions(HOLDER, target(), undefined, holds()))).not.toContain("Let them talk")
    expect(labels(personActions(HOLDER, target({ identity: "sam", role: "host" }), undefined, h))).not.toContain("Let them talk")
  })

  // DESIGN-BUILD-19 (26 Oct): an ask to unmute lands on someone who can't act on it while the call holds their microphone.
  it("never asks someone the microphone hold covers to unmute, until they're let through", () => {
    const h = holds("microphone")
    expect(labels(personActions(HOST, target({ micOn: false }), undefined, h))).not.toContain("Ask to unmute")
    expect(labels(personActions(HOST, target({ micOn: false, role: "guest", guest: true }), undefined, h))).not.toContain("Ask to unmute")
    expect(labels(personActions(HOST, target({ micOn: false, allowed: holds("microphone") }), undefined, h))).toContain("Ask to unmute")
    expect(labels(personActions(HOST, target({ micOn: false, identity: "ana", role: "cohost" }), undefined, h))).toContain("Ask to unmute")
    expect(labels(personActions(HOST, target({ micOn: false }), undefined, holds("share")))).toContain("Ask to unmute")
  })

  it("never offers a hold or a let-through to someone who may not hold: a participant, a guest, an equal in a DM", () => {
    const h = holds("microphone", "share")
    for (const me of [
      { role: "participant" as const, can: can(), identity: "leo" },
      { role: "guest" as const, can: can(), identity: "guest-1" },
      { role: "participant" as const, can: can("mute", "mute_all", "ask_unmute"), identity: "sam" },
    ]) {
      expect(personActions(me, target({ micOn: false }), undefined, h).some((a) => a.action === "allow")).toBe(false)
      expect(holdSwitches(me, h, true)).toEqual([])
    }
  })

  it("gives whoever may hold a switch for each, on while everyone may, chat only where the call has one", () => {
    const HOLDER = { role: "host" as const, can: can("hold") }
    expect(holdSwitches(HOLDER, holds("react"), true)).toEqual([
      { what: "share", label: "Share their screen", on: true },
      { what: "chat", label: "Send chat messages", on: true },
      { what: "react", label: "Send reactions", on: false },
      { what: "microphone", label: "Turn on their microphone", on: true },
      { what: "camera", label: "Turn on their video", on: true },
    ])
    expect(holdSwitches(HOLDER, holds(), false).map((s) => s.what)).toEqual(["share", "react", "microphone", "camera"])
  })
})

describe("callActions", () => {
  it("gives the call's own controls by what you may do, the lock and joining muted as they stand", () => {
    expect(labels(callActions(HOST, { locked: false, muteOnEntry: false }))).toEqual(["Mute all", "Ask all to unmute", "Lock call", "Mute people as they join"])
    expect(callActions(HOST, { locked: true, muteOnEntry: true }).map((a) => a.action)).toEqual(["mute_all", "ask_all_unmute", "unlock", "mute_on_entry"])
    expect(callActions({ role: "participant", can: can() }, { locked: false, muteOnEntry: false })).toEqual([])
  })

  it("never asks everyone to unmute while the call holds microphones, which the server refuses", () => {
    expect(labels(callActions(HOST, { locked: false, muteOnEntry: false, held: new Set(["microphone"]) }))).toEqual(["Mute all", "Lock call", "Mute people as they join"])
    expect(labels(callActions(HOST, { locked: false, muteOnEntry: false, held: new Set(["chat"]) }))).toContain("Ask all to unmute")
  })
})

// Calls package B: the server decides every board action (CallControl's boardRefusal); a screen offers the same.
describe("the board on the stage", () => {
  const PART = { role: "participant" as const, can: can(), identity: "maya" }
  const GUEST = { role: "guest" as const, can: can(), identity: "guest-1" }
  const on = (by: string) => ({ by })
  const none = new Set<CallHold>()

  it("gives a guest nothing to do to it: no presenting, stopping or choosing who draws", () => {
    expect(boardControls(GUEST, undefined, none)).toEqual({ present: null, stop: false, run: false, mine: false })
    expect(boardControls(GUEST, on("sam"), none)).toEqual({ present: null, stop: false, run: false, mine: false })
  })

  it("lets a participant present while no board is up, but never stop or run someone else's", () => {
    expect(boardControls(PART, undefined, none)).toEqual({ present: "yes", stop: false, run: false, mine: false })
    expect(boardControls(PART, on("sam"), none)).toEqual({ present: "busy", stop: false, run: false, mine: false })
  })

  it("holds presenting with sharing, for everyone but the people running the call and whoever was let through", () => {
    const held = new Set<CallHold>(["share"])
    expect(boardControls(PART, undefined, held).present).toBe("held")
    expect(boardControls({ ...PART, allowed: new Set<CallHold>(["share"]) }, undefined, held).present).toBe("yes")
    expect(boardControls(HOST, undefined, held).present).toBe("yes")
  })

  it("lets its presenter put up another board, take theirs down and choose who draws on it", () => {
    expect(boardControls(PART, on("maya"), none)).toEqual({ present: "yes", stop: true, run: true, mine: true })
  })

  it("lets a host or co-host put a board over someone's, take it down and choose who draws", () => {
    expect(boardControls(HOST, on("maya"), none)).toEqual({ present: "yes", stop: true, run: true, mine: false })
    expect(boardControls(COHOST, on("maya"), none)).toEqual({ present: "yes", stop: true, run: true, mine: false })
  })

  it("lets anyone in a DM or a group take the board down, but only its presenter choose who draws", () => {
    const EQUAL = { role: "participant" as const, can: can("mute", "mute_all", "ask_unmute"), identity: "jonas" }
    expect(boardControls(EQUAL, on("maya"), none)).toEqual({ present: "busy", stop: true, run: false, mine: false })
  })
})

import { describe, expect, it } from "vitest"
import { callActions, partOf, personActions, roleLabel, type CallAbility, type CallTarget } from "./control"

// Call Control on this side: a screen offers exactly what the server allows,
// read from the attributes only the server sets.

const can = (...a: CallAbility[]) => new Set<CallAbility>(a)
const HOST = { role: "host" as const, can: can("mute", "mute_all", "ask_unmute", "remove", "lock", "end", "cohost", "spotlight", "mute_on_entry"), identity: "sam" }
const COHOST = { role: "cohost" as const, can: can("mute", "mute_all", "ask_unmute", "remove", "lock", "spotlight", "mute_on_entry"), identity: "ana" }
const target = (o: Partial<CallTarget> = {}): CallTarget => ({ identity: "maya", role: "participant", guest: false, micOn: true, cameraOn: true, sharing: false, ...o })
const labels = (a: { label: string }[]) => a.map((x) => x.label)

describe("partOf", () => {
  it("reads the part and abilities the server set, and nothing it didn't", () => {
    expect(partOf({ "oc.role": "cohost", "oc.can": "mute,remove, lock" })).toEqual({ role: "cohost", can: can("mute", "remove", "lock") })
    const forged = partOf({ "oc.role": "owner", "oc.can": "mute,delete_workspace" })
    expect(forged.role).toBe("participant")
    expect([...forged.can]).toEqual(["mute"])
    expect(partOf(undefined)).toEqual({ role: "participant", can: new Set() })
  })

  it("names hosts and co-hosts, and nobody else", () => {
    expect([roleLabel("host"), roleLabel("cohost"), roleLabel("participant"), roleLabel("guest")]).toEqual(["Host", "Co-host", null, null])
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

describe("callActions", () => {
  it("gives the call's own controls by what you may do, the lock and joining muted as they stand", () => {
    expect(labels(callActions(HOST, { locked: false, muteOnEntry: false }))).toEqual(["Mute all", "Ask all to unmute", "Lock call", "Mute people as they join"])
    expect(callActions(HOST, { locked: true, muteOnEntry: true }).map((a) => a.action)).toEqual(["mute_all", "ask_all_unmute", "unlock", "mute_on_entry"])
    expect(callActions({ role: "participant", can: can() }, { locked: false, muteOnEntry: false })).toEqual([])
  })
})

import { describe, expect, it } from "vitest"
import { isSystemLine, readSystemLine, systemLineLink } from "@/lib/conversation/systemLine"

// System lines are the server's words about a conversation (chat A9): drawn as
// a line, and leading where the conversation went.

const MAYA = "11111111-1111-4111-8111-111111111111"
const PRIYA = "22222222-2222-4222-8222-222222222222"
const SAM = "33333333-3333-4333-8333-333333333333"
const facts = (f: object) => JSON.stringify(f)

describe("a system line's facts", () => {
  it("are read whole, and only what the server writes", () => {
    expect(readSystemLine(facts({ kind: "group.continued", actor: MAYA, targets: [PRIYA, "", 7], to: "grp-new", count: 3, extra: true }))).toEqual({
      kind: "group.continued", actor: MAYA, targets: [PRIYA], from: undefined, to: "grp-new", name: undefined, count: 3,
    })
  })

  it("are nothing when they can't be read", () => {
    for (const bad of [undefined, "", "not json", "null", "[]", facts({ actor: MAYA }), facts({ kind: "" }), facts({ kind: 4 })]) {
      expect(readSystemLine(bad)).toBeNull()
    }
  })

  it("keep a kind added later, so its line still draws", () => {
    expect(readSystemLine(facts({ kind: "member.joined" }))?.kind).toBe("member.joined")
  })

  it("belong to a row whose kind is system, and only that", () => {
    expect(isSystemLine("system")).toBe(true)
    for (const k of [undefined, null, "", "post", "System"]) expect(isSystemLine(k)).toBe(false)
  })
})

describe("where a line leads", () => {
  it("from the conversation people were added from, to the group it continues in", () => {
    expect(systemLineLink(readSystemLine(facts({ kind: "group.continued", actor: MAYA, targets: [PRIYA], to: "abc123" })), SAM)).toEqual({
      href: "/app/chat/group/abc123", label: "Open the new conversation",
    })
  })

  it("from a new group back to the one it continues, for the people who were in it", () => {
    const started = readSystemLine(facts({ kind: "group.started", actor: MAYA, targets: [PRIYA], from: "old123" }))
    expect(systemLineLink(started, SAM)).toEqual({ href: "/app/chat/group/old123", label: "See the earlier conversation" })
    // Priya was added: she was never in the earlier one and can't open it.
    expect(systemLineLink(started, PRIYA)).toBeNull()
  })

  it("back to a DM by the other person in it, and nowhere while who reads isn't known", () => {
    const started = readSystemLine(facts({ kind: "group.started", actor: MAYA, targets: [PRIYA], from: `${MAYA} ${SAM}` }))
    expect(systemLineLink(started, SAM)?.href).toBe(`/app/chat/${MAYA}`)
    expect(systemLineLink(started, MAYA)?.href).toBe(`/app/chat/${SAM}`)
    expect(systemLineLink(started, undefined)).toBeNull()
  })

  it("from a group to the private channel it became", () => {
    expect(systemLineLink(readSystemLine(facts({ kind: "group.channel", actor: MAYA, to: "ch-9", name: "launch-plan" })), SAM)).toEqual({
      href: "/app/channel/ch-9", label: "Open #launch-plan",
    })
  })

  it("from a pin's line to the message pinned, in the conversation the line is in", () => {
    const pinned = readSystemLine(facts({ kind: "message.pinned", actor: MAYA, to: "m-7" }))
    expect(systemLineLink(pinned, SAM, { kind: "channel", id: "ch-1" })).toEqual({ href: "/app/channel/ch-1/m-7", label: "See the message" })
    // Nowhere until the conversation is known.
    expect(systemLineLink(pinned, SAM)).toBeNull()
  })

  it("nowhere for a name, a share, a channel's first line or a kind it doesn't know", () => {
    for (const kind of ["group.renamed", "history.shared", "channel.from_group", "member.joined"]) {
      expect(systemLineLink(readSystemLine(facts({ kind, actor: MAYA, from: "old", to: "new" })), SAM)).toBeNull()
    }
    expect(systemLineLink(null, SAM)).toBeNull()
  })
})

import { describe, expect, it } from "vitest"
import type { CallSessionRead } from "@/components/livekit/callState"
import { huddleCardState } from "@/components/message/callCard"
import { huddleCallOf } from "./huddleCall"
import { HUDDLE_KIND, conversationOf, readHuddleFacts, type HuddleFacts } from "./huddle"
import { pinTestClock } from "@/lib/testing/testClock"

pinTestClock(new Date("2026-11-05T09:30:00Z"))

const maya = "4f0c2a1e-3b7d-4c55-9a51-0d8b1f6a2c33"
const jonas = "0b6f1d8e-1111-4c55-9a51-0d8b1f6a2c33"

// slack-06: a huddle's post carries the call's facts (business/Huddle Facts),
// and its card reads them.
describe("a huddle post's facts", () => {
  it("are the server's kind", () => expect(HUDDLE_KIND).toBe("huddle"))

  it("read a call that is on: its session and start, nobody counted yet", () => {
    const f = readHuddleFacts(JSON.stringify({ session: "s1", started: "2026-11-05T09:00:00Z" }))
    expect(f).toEqual({ session: "s1", started: "2026-11-05T09:00:00Z", ended: undefined, seconds: 0, came: [], people: 0, missed: false })
  })

  it("read an ended call: its length, who came by name, everyone counted and whether it was missed", () => {
    const f = readHuddleFacts(
      JSON.stringify({ session: "s1", started: "2026-11-05T09:00:00Z", ended: "2026-11-05T09:12:00Z", seconds: 720, came: [{ uuid: maya, name: "Maya Chen" }, { uuid: jonas, name: "" }], people: 3 }),
    )
    expect(f?.ended).toBe("2026-11-05T09:12:00Z")
    expect(f?.seconds).toBe(720)
    expect(f?.came).toEqual([{ uuid: maya, name: "Maya Chen" }, { uuid: jonas, name: "Someone" }])
    expect(f?.people).toBe(3)
    expect(f?.missed).toBe(false)
    expect(readHuddleFacts(JSON.stringify({ session: "s1", ended: "x", came: [{ uuid: maya, name: "Maya" }], people: 1, missed: true }))?.missed).toBe(true)
  })

  it("are nothing for words, a system line's facts or broken JSON", () => {
    for (const bad of [undefined, "", "not json", "null", "[]", JSON.stringify({ kind: "channel.joined" }), JSON.stringify({ session: 7 })]) {
      expect(readHuddleFacts(bad)).toBeNull()
    }
  })

  it("drop faces without a member and count people from the faces when the count is missing", () => {
    const f = readHuddleFacts(JSON.stringify({ session: "s1", ended: "x", came: [{ uuid: maya, name: "Maya" }, null, { name: "No id" }, "x"] }))
    expect(f?.came).toEqual([{ uuid: maya, name: "Maya" }])
    expect(f?.people).toBe(1)
  })
})

describe("the call a huddle post belongs to", () => {
  it("is its conversation's call, joined by the page its Huddle button opens", () => {
    expect(huddleCallOf({ kind: "channel", id: "ch1" }, maya)).toEqual({ ref: { kind: "channel", id: "ch1" }, href: "/app/meet/ch/ch1" })
    expect(huddleCallOf({ kind: "group", id: "g1" }, maya)).toEqual({ ref: { kind: "group", id: "g1" }, href: "/app/meet/grp/g1" })
    // A DM's call is both people's, sorted; its page is the other person's.
    expect(huddleCallOf({ kind: "chat", id: maya }, jonas)).toEqual({ ref: { kind: "dm", id: `${jonas} ${maya}` }, href: `/app/meet/chat/${maya}` })
  })

  it("is not known for a preview, or a DM before whoever reads it is", () => {
    expect(huddleCallOf(undefined, maya)).toBeNull()
    expect(huddleCallOf({ kind: "chat", id: maya }, undefined)).toBeNull()
  })
})

describe("a huddle card's state", () => {
  const on: HuddleFacts = { session: "s1", started: "2026-11-05T09:00:00Z", seconds: 0, came: [], people: 0, missed: false }
  const over: HuddleFacts = { ...on, ended: "2026-11-05T09:12:00Z", seconds: 720, came: [{ uuid: maya, name: "Maya Chen" }], people: 2 }
  const person = (user_uuid: string, name: string, in_call = true, guest = false) => ({ identity: user_uuid || "guest-1", user_uuid, name, role: "participant", in_call, guest })
  const read = (session: string, live = true): CallSessionRead => ({
    live,
    session: { id: session, people: [person(maya, "Maya Chen"), person(jonas, "Jonas Weber"), person("", "Guest: Kai", true, true), person("0c4a", "Ada", false)] },
  })

  it("is live while the conversation's call is the post's own: the members in it now, guests counted", () => {
    expect(huddleCardState(on, read("s1"), true)).toEqual({ state: "live", came: [{ uuid: maya, name: "Maya Chen" }, { uuid: jonas, name: "Jonas Weber" }], people: 3 })
  })

  it("is over once the conversation's call is another, or none, before its facts arrive", () => {
    expect(huddleCardState(on, read("s2"), true)).toEqual({ state: "ended", came: [], people: 0 })
    expect(huddleCardState(on, read("s1", false), false).state).toBe("ended")
  })

  it("is the facts' once they say it ended, whatever the read", () => {
    expect(huddleCardState(over, read("s1"), true)).toEqual({ state: "ended", came: over.came, people: 2 })
    expect(huddleCardState(over, undefined, true).state).toBe("ended")
  })

  it("is a missed call in a DM or a group, and just ended in a channel", () => {
    const missed = { ...over, missed: true, people: 1 }
    expect(huddleCardState(missed, undefined, false).state).toBe("missed")
    expect(huddleCardState(missed, undefined, true).state).toBe("ended")
  })

  it("is only started until the read comes", () => {
    expect(huddleCardState(on, undefined, true)).toEqual({ state: "started", came: [], people: 0 })
  })
})

describe("a message row's conversation", () => {
  it("is its channel's, its group's or its DM's other person's", () => {
    expect(conversationOf({ channelUUID: "ch1", postUUID: "p" } as { channelUUID: string })).toEqual({ kind: "channel", id: "ch1" })
    expect(conversationOf({ groupUUID: "g1" })).toEqual({ kind: "group", id: "g1" })
    expect(conversationOf({ chatUUID: maya })).toEqual({ kind: "chat", id: maya })
    expect(conversationOf({})).toBeUndefined()
  })
})

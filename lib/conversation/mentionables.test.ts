import { describe, expect, it } from "vitest"
import { pinTestClock } from "@/lib/testing/testClock"
import { nightFor, orderPeople, rankPeople, type Mentionables } from "./mentionables"
import { mentionPlaceAttrs, mentionPlaceOf, parseMentionPlace } from "./mentionPlace"

pinTestClock()

const person = (user_uuid: string, user_name: string, is_bot = false) => ({ user_uuid, user_name, is_bot })
const known = (over: Partial<Mentionables> = {}): Mentionables => ({
  me: "me", name: "launch", recent: ["sam", "maya"], members: ["me", "maya", "sam", "jonas"], count: 4,
  teams: [], broadcasts: [], zones: { jonas: "Asia/Tokyo" }, ...over,
})

// D-M9: this conversation's people by recent activity, agents, then those
// not in it, you last.
describe("the @ list's order", () => {
  it("puts the conversation's people first, the most recently active first, then the others, you last", () => {
    const matched = [person("priya", "Priya"), person("me", "Sam Rivera"), person("jonas", "Jonas"), person("maya", "Maya"), person("sam", "Sam"), person("scout", "Scout", true)]
    const o = orderPeople(matched, known(), new Date("2026-10-18T12:00:00Z"))
    expect(o.head.map((p) => p.user_uuid)).toEqual(["sam", "maya", "jonas"])
    expect(o.agents.map((p) => p.user_uuid)).toEqual(["scout"])
    expect(o.others.map((p) => p.user_uuid)).toEqual(["priya"])
    expect(o.mine.map((p) => p.user_uuid)).toEqual(["me"])
    expect([...o.notHere]).toEqual(["priya"])
  })

  it("says nobody isn't here when it only knows part of a large conversation", () => {
    const r = rankPeople([person("priya", "Priya")], known({ count: 5000 }), "me")
    expect(r[0].here).toBeUndefined()
  })

  it("keeps the matched order when the conversation's part didn't come", () => {
    expect(rankPeople([person("b", "B"), person("a", "A")], null, "me").map((r) => r.person.user_uuid)).toEqual(["b", "a"])
  })

  it("says the time where it's night for them in the reader's clock, and nothing by day or without a zone", () => {
    expect(nightFor("Asia/Tokyo", new Date("2026-10-18T14:40:00Z"))).toMatch(/^(11:40\s?pm|23:40) where they are$/i)
    expect(nightFor("Asia/Tokyo", new Date("2026-10-18T03:00:00Z"))).toBe("")
    expect(nightFor(undefined)).toBe("")
    expect(nightFor("Not/AZone")).toBe("")
  })
})

// The composer says where it writes; the list reads it from the editor's DOM.
describe("a composer's place", () => {
  it("is read from the nearest container that says, a thread's before its conversation's", () => {
    const page = document.createElement("div")
    const marker = document.createElement("span")
    Object.entries(mentionPlaceAttrs("channel", "c-1")).forEach(([k, v]) => marker.setAttribute(k, v))
    const panel = document.createElement("div")
    Object.entries(mentionPlaceAttrs("channel", "c-1", true)).forEach(([k, v]) => panel.setAttribute(k, v))
    const editor = document.createElement("div")
    const box = document.createElement("div")
    box.appendChild(editor)
    page.append(marker, box, panel)
    expect(mentionPlaceOf({ view: { dom: editor } })).toEqual({ kind: "channel", id: "c-1", thread: false })
    const inThread = document.createElement("div")
    panel.appendChild(inThread)
    expect(mentionPlaceOf({ view: { dom: inThread } })).toEqual({ kind: "channel", id: "c-1", thread: true })
    expect(mentionPlaceOf({ view: { dom: document.createElement("div") } })).toBeNull()
  })

  it("reads a DM's id with its space, and nothing else", () => {
    expect(parseMentionPlace("dm:a b", false)).toEqual({ kind: "dm", id: "a b", thread: false })
    expect(parseMentionPlace("doc:x", false)).toBeNull()
    expect(parseMentionPlace("", false)).toBeNull()
  })
})

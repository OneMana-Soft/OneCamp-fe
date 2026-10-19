import { describe, expect, it } from "vitest"
import { chatRef, dmWith, parse, route, type ConversationPlace } from "@/lib/conversation/route"
import { keyOf } from "@/lib/conversation/types"

// The Link Router (chat A1): one rule for every link to a conversation or a
// message in one, and its inverse, so a link written anywhere opens where it
// says.

const MAYA = "11111111-1111-4111-8111-111111111111"
const SAM = "33333333-3333-4333-8333-333333333333"
const CH = "4a1d0c6e-7b8f-4e2d-9c1a-0f2e3d4c5b6a"
const POST = "2b0e7f1a-1c2d-4e3f-8a9b-0c1d2e3f4a5b"
const GRP = "9f86d081884c7d659a2feaa0c55ad015"
const DM = `${MAYA} ${SAM}`

const places: ConversationPlace[] = [
  { conversation: { kind: "channel", id: CH } },
  { conversation: { kind: "channel", id: CH }, message: POST },
  { conversation: { kind: "group", id: GRP } },
  { conversation: { kind: "group", id: GRP }, message: POST },
  { conversation: { kind: "dm", id: DM, other: MAYA } },
  { conversation: { kind: "dm", id: DM, other: MAYA }, message: POST },
]

describe("the Link Router", () => {
  it("opens each place where it says, the server's rule (helpers.ChatPath)", () => {
    expect(places.map(route)).toEqual([
      `/app/channel/${CH}`,
      `/app/channel/${CH}/${POST}`,
      `/app/chat/group/${GRP}`,
      `/app/chat/group/${GRP}/${POST}`,
      `/app/chat/${MAYA}`,
      `/app/chat/${MAYA}/${POST}`,
    ])
  })

  it("reads back every place it writes: parse(route(x)) is x", () => {
    for (const place of places) expect(parse(route(place), SAM)).toEqual(place)
  })

  it("ignores a link's query and fragment", () => {
    expect(parse(`/app/channel/${CH}?postId=${POST}#top`, SAM)).toEqual({ conversation: { kind: "channel", id: CH } })
  })

  it("never reads a conversation's own page as a message, or anything that isn't a conversation", () => {
    for (const path of [`/app/channel/${CH}/recording`, `/app/chat/group/${GRP}/recording`, `/app/chat/${MAYA}/recording`, `/app/channel/${CH}/${POST}/extra`, "/app/chat", "/app/chat/group", "/app/channel", "/app/doc/d1", "/elsewhere", ""]) {
      expect(parse(path, SAM)).toBeNull()
    }
  })

  it("reads a DM's link only when who reads it is known: the path names the other person", () => {
    expect(parse(`/app/chat/${MAYA}`, undefined)).toBeNull()
    expect(parse(`/app/chat/${MAYA}`, SAM)?.conversation).toEqual({ kind: "dm", id: DM, other: MAYA })
  })
})

describe("a grouping id's conversation", () => {
  it("is a group with no space, and a DM by the other person with one", () => {
    expect(chatRef(GRP, undefined)).toEqual({ kind: "group", id: GRP })
    expect(chatRef(`${SAM} ${MAYA}`, SAM)).toEqual({ kind: "dm", id: DM, other: MAYA })
    expect(chatRef(`${SAM} ${SAM}`, SAM)).toEqual({ kind: "dm", id: `${SAM} ${SAM}`, other: SAM })
  })

  it("is nothing without an id, or for a DM while the reader isn't known", () => {
    expect(chatRef("", SAM)).toBeNull()
    expect(chatRef(undefined, SAM)).toBeNull()
    expect(chatRef(DM, null)).toBeNull()
  })

  it("is the DM with someone for the reader, named as the API names it", () => {
    expect(dmWith(MAYA, SAM)).toEqual({ kind: "dm", id: DM, other: MAYA })
    expect(dmWith(MAYA, undefined)).toBeNull()
  })
})

describe("a conversation's key", () => {
  it("is the one the server names its topics by, and a thread's sits under its conversation's", () => {
    expect(keyOf({ kind: "channel", id: CH })).toBe(`channel:${CH}`)
    expect(keyOf({ kind: "dm", id: DM, other: MAYA })).toBe(`dm:${DM}`)
    expect(keyOf({ kind: "group", id: GRP })).toBe(`group:${GRP}`)
    expect(keyOf({ in: { kind: "group", id: GRP }, root: POST })).toBe(`group:${GRP}/thread:${POST}`)
  })
})

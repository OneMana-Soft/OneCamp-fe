import { describe, expect, it } from "vitest"
import { conversationAt, groupingIdOf, isOpenAt, withOpenRead } from "@/lib/chat/conversation"

const ME = "u-me"
const MAYA = "u-maya"
const JONAS = "u-jonas"
const dm = (a: string, b: string) => [a, b].sort().join(" ")

describe("the conversation at a path", () => {
  it("reads a DM by the other person and a group chat by its id", () => {
    expect(conversationAt(`/app/chat/${MAYA}`)).toEqual({ kind: "dm", otherUUID: MAYA })
    expect(conversationAt(`/app/chat/${MAYA}/thread/c1`)).toEqual({ kind: "dm", otherUUID: MAYA })
    expect(conversationAt("/app/chat/group/g1")).toEqual({ kind: "group", grpId: "g1" })
  })

  it("is none anywhere else", () => {
    for (const p of ["/app/chat", "/app/chat/", "/app/chat/group", "/app/chat/group/", "/app/channel/c1", "/app/home", "/"]) {
      expect(conversationAt(p), p).toBeNull()
    }
  })
})

describe("whether a conversation is open", () => {
  it("matches a DM on its grouping id, whichever way round", () => {
    expect(groupingIdOf({ kind: "dm", otherUUID: MAYA }, ME)).toBe(dm(ME, MAYA))
    expect(isOpenAt(`/app/chat/${MAYA}`, dm(MAYA, ME), ME)).toBe(true)
    expect(isOpenAt(`/app/chat/${MAYA}`, dm(ME, JONAS), ME)).toBe(false)
    expect(isOpenAt("/app/chat/group/g1", "g1", ME)).toBe(true)
    expect(isOpenAt("/app/chat/group/g1", "g2", ME)).toBe(false)
  })

  // Notes to yourself are a DM with yourself: having them open isn't having
  // every DM open, though each one's grouping id has your id in it.
  it("doesn't take your notes to yourself for every DM", () => {
    expect(isOpenAt(`/app/chat/${ME}`, dm(ME, ME), ME)).toBe(true)
    expect(isOpenAt(`/app/chat/${ME}`, dm(ME, MAYA), ME)).toBe(false)
  })
})

describe("a list with the open conversation read", () => {
  const list = () => [
    { dm_grouping_id: dm(ME, MAYA), dm_unread: 2 },
    { dm_grouping_id: dm(ME, JONAS), dm_unread: 4 },
    { dm_grouping_id: "g1", dm_unread: 1 },
  ]

  // A link straight into Maya's chat: the list was answered before the chat
  // marked it read, so it still counted her messages.
  it("zeroes the open conversation and nothing else", () => {
    expect(withOpenRead(list(), `/app/chat/${MAYA}`, ME).map((d) => d.dm_unread)).toEqual([0, 4, 1])
    expect(withOpenRead(list(), "/app/chat/group/g1", ME).map((d) => d.dm_unread)).toEqual([2, 4, 0])
  })

  it("leaves the list as it came when nothing is open, or who you are isn't known yet", () => {
    const l = list()
    expect(withOpenRead(l, "/app/home", ME)).toBe(l)
    expect(withOpenRead(l, `/app/chat/${MAYA}`, undefined)).toBe(l)
  })
})

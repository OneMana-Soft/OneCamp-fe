import { afterEach, describe, expect, it, vi } from "vitest"
import { pinTestClock } from "@/lib/testing/testClock"

pinTestClock()

const cleared: { channel: [string, number][]; chat: [string, number][]; inbox: number } = { channel: [], chat: [], inbox: 0 }
vi.mock("@/services/unreadCache", () => ({
  clearChannelUnread: (id: string, n: number) => void cleared.channel.push([id, n]),
  clearChatUnread: (id: string, n: number) => void cleared.chat.push([id, n]),
  recountInbox: () => void cleared.inbox++,
}))
const mutated: string[] = []
vi.mock("@/lib/swrMutate", () => ({ appMutate: (key: string) => void mutated.push(key) }))

const { applyReadMoved, readMovedOf } = await import("./readMoved")

afterEach(() => {
  cleared.channel.length = 0
  cleared.chat.length = 0
  cleared.inbox = 0
  mutated.length = 0
})

// Your marker moved in another tab or device (chat A3's read.moved): every
// badge takes the server's number, and an open conversation reads where you
// are again. The Inbox's badge reads its count again: a conversation read
// lowers it, and kind "inbox" is the Inbox opened elsewhere.
describe("read.moved", () => {
  it("sets a channel's badge to the server's number and rereads its position", () => {
    const dispatch = vi.fn()
    applyReadMoved(dispatch, { kind: "channel", id: "c1", unread: 2, first_unread: "p2" })
    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ type: "users/resetUserChannelUnread", payload: { ch_uuid: "c1", count: 2 } }))
    expect(cleared.channel).toEqual([["c1", 2]])
    expect(mutated).toEqual(["/conversations/channel/c1/read-state"])
    expect(cleared.inbox).toBe(1)
  })

  it("does the same for a DM or a group by its grouping id", () => {
    const dispatch = vi.fn()
    applyReadMoved(dispatch, { kind: "dm", id: "a b", unread: 0 })
    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ type: "users/resetUserChatUnread", payload: { dm_grouping_id: "a b", count: 0 } }))
    expect(cleared.chat).toEqual([["a b", 0]])
    expect(mutated).toEqual(["/conversations/dm/a%20b/read-state"])
    expect(cleared.inbox).toBe(1)
  })

  it("reads the Inbox's badge again, and nothing else, when the Inbox was opened elsewhere", () => {
    const dispatch = vi.fn()
    applyReadMoved(dispatch, { kind: "inbox", seen: "2026-11-05T09:00:00Z", unread: 0 })
    expect(cleared.inbox).toBe(1)
    expect(dispatch).not.toHaveBeenCalled()
    expect(mutated).toEqual([])
  })

  it("ignores what isn't one", () => {
    const dispatch = vi.fn()
    for (const bad of [null, {}, { kind: "thread", id: "t", unread: 1 }, { kind: "channel", id: "", unread: 1 }]) applyReadMoved(dispatch, bad)
    expect(dispatch).not.toHaveBeenCalled()
    expect(mutated).toEqual([])
    expect(cleared.inbox).toBe(0)
    expect(readMovedOf({ kind: "group", id: "g", unread: -3 })).toEqual({ kind: "group", id: "g", unread: 0, first_unread: undefined })
  })
})

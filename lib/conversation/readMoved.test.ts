import { afterEach, describe, expect, it, vi } from "vitest"

const cleared: { channel: [string, number][]; chat: [string, number][] } = { channel: [], chat: [] }
vi.mock("@/services/unreadCache", () => ({
  clearChannelUnread: (id: string, n: number) => void cleared.channel.push([id, n]),
  clearChatUnread: (id: string, n: number) => void cleared.chat.push([id, n]),
}))
const mutated: string[] = []
vi.mock("@/lib/swrMutate", () => ({ appMutate: (key: string) => void mutated.push(key) }))

const { applyReadMoved, readMovedOf } = await import("./readMoved")

afterEach(() => {
  cleared.channel.length = 0
  cleared.chat.length = 0
  mutated.length = 0
})

// Your marker moved in another tab or device (chat A3's read.moved): every
// badge takes the server's number, and an open conversation reads where you
// are again.
describe("read.moved", () => {
  it("sets a channel's badge to the server's number and rereads its position", () => {
    const dispatch = vi.fn()
    applyReadMoved(dispatch, { kind: "channel", id: "c1", unread: 2, first_unread: "p2" })
    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ type: "users/resetUserChannelUnread", payload: { ch_uuid: "c1", count: 2 } }))
    expect(cleared.channel).toEqual([["c1", 2]])
    expect(mutated).toEqual(["/conversations/channel/c1/read-state"])
  })

  it("does the same for a DM or a group by its grouping id", () => {
    const dispatch = vi.fn()
    applyReadMoved(dispatch, { kind: "dm", id: "a b", unread: 0 })
    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ type: "users/resetUserChatUnread", payload: { dm_grouping_id: "a b", count: 0 } }))
    expect(cleared.chat).toEqual([["a b", 0]])
    expect(mutated).toEqual(["/conversations/dm/a%20b/read-state"])
  })

  it("ignores what isn't one", () => {
    const dispatch = vi.fn()
    for (const bad of [null, {}, { kind: "thread", id: "t", unread: 1 }, { kind: "channel", id: "", unread: 1 }]) applyReadMoved(dispatch, bad)
    expect(dispatch).not.toHaveBeenCalled()
    expect(mutated).toEqual([])
    expect(readMovedOf({ kind: "group", id: "g", unread: -3 })).toEqual({ kind: "group", id: "g", unread: 0, first_unread: undefined })
  })
})

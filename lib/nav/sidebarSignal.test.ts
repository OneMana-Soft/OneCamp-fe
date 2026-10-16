import { describe, expect, it } from "vitest"
import { rowSignal, sectionSignal } from "./sidebarSignal"
import { sortChannelsByName } from "@/lib/utils/sortChannelList"
import { sortChatList } from "@/lib/utils/sortChatList"
import type { UserDMInterface } from "@/types/user"
import { pinTestClock } from "@/lib/testing/testClock"

pinTestClock()

// SN-8, D-S3, D-S4: a channel @mention looked exactly like chatter (an ink-3
// count of every unread post), so "does anyone need me?" had no answer.
describe("what a sidebar row says", () => {
  it("is bold with no number for a channel's unread", () => {
    expect(rowSignal({ unread_count: 5 })).toEqual({ unread: true, spoken: ", unread" })
  })

  it("adds @2 on the brand badge for mentions of you", () => {
    expect(rowSignal({ unread_count: 5, mentions: 2 })).toEqual({ badge: "@2", unread: true, spoken: ", 2 mentions" })
    expect(rowSignal({ unread_count: 1, mentions: 1 }).spoken).toBe(", 1 mention")
    expect(rowSignal({ unread_count: 300, mentions: 120 }).badge).toBe("@99+")
  })

  it("shows a DM's count on the badge", () => {
    expect(rowSignal({ unread_count: 3, badge: true })).toEqual({ badge: "3", unread: true, spoken: ", 3 unread" })
    expect(rowSignal({ unread_count: 0, badge: true })).toEqual({ badge: undefined, unread: false, spoken: "" })
  })

  it("never makes a muted channel bold, but still shows a mention of you", () => {
    expect(rowSignal({ unread_count: 9, muted: true })).toEqual({ unread: false, spoken: "" })
    expect(rowSignal({ unread_count: 9, mentions: 1, muted: true })).toEqual({ badge: "@1", unread: false, spoken: ", 1 mention" })
  })

  it("says nothing with nothing unread", () => {
    expect(rowSignal({})).toEqual({ unread: false, spoken: "" })
  })
})

describe("what a folded section says", () => {
  it("adds up its mentions as @, and its DMs as a count", () => {
    expect(sectionSignal([{ unread_count: 4, mentions: 1 }, { unread_count: 2, mentions: 2 }, { unread_count: 7 }]))
      .toEqual({ badge: "@3", unread: true, spoken: ", 3 mentions" })
    expect(sectionSignal([{ unread_count: 2, badge: true }, { unread_count: 1, badge: true }, { badge: true }]))
      .toEqual({ badge: "3", unread: true, spoken: ", 3 unread" })
  })

  it("shows a dot for unread that needs nobody, and nothing for a muted channel's", () => {
    expect(sectionSignal([{ unread_count: 4 }, { unread_count: 0 }])).toEqual({ unread: true, spoken: ", unread" })
    expect(sectionSignal([{ unread_count: 4, muted: true }])).toEqual({ unread: false, spoken: "" })
  })
})

// SN-4, D-S2: rows moved under the pointer whenever anyone posted (unread
// first, then latest post), and a muted channel with unreads sorted to the top.
describe("the sidebar's order", () => {
  const ch = (name: string, extra: Record<string, unknown> = {}) => ({ ch_uuid: `id-${name}`, ch_name: name, ...extra })

  it("lists channels A to Z, whatever is unread in them", () => {
    const order = sortChannelsByName([ch("launch", { unread_post_count: 9 }), ch("Design"), ch("general", { unread_post_count: 1 }), ch("ops-2"), ch("ops-10")])
    expect(order.map((c) => c.ch_name)).toEqual(["Design", "general", "launch", "ops-2", "ops-10"])
  })

  it("lists conversations by their latest message, and being unread moves none", () => {
    const dm = (id: string, at: string | null, unread = 0) =>
      ({ dm_grouping_id: id, dm_unread: unread, dm_chats: at ? [{ chat_created_at: at }] : [] }) as unknown as UserDMInterface
    const order = sortChatList([dm("quiet", null), dm("old-unread", "2026-10-14T08:00:00Z", 5), dm("new", "2026-10-14T09:00:00Z"), dm("mid", "2026-10-14T08:30:00Z", 1)])
    expect(order.map((d) => d.dm_grouping_id)).toEqual(["new", "mid", "old-unread", "quiet"])
  })
})

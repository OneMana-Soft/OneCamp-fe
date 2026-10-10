import { describe, expect, it } from "vitest"
import type { UnifiedActivityItem } from "@/types/activity"
import { activityKey, hasSubject, mergeActivityPages, olderPageCursor } from "@/lib/activity/feedPages"

// Three mentions from one seed run, as the demo's feed carries them: the item's
// `time` is cut to the second, the mention keeps its nanoseconds.
const mention = (at: string, post: string, by = "u-jonas") =>
  ({
    activity_type: "MENTION",
    time: at.replace(/\.\d+Z$/, "Z"),
    priority: "normal",
    mention: {
      mention_created_at: at,
      mention_post: { post_uuid: post, post_text: "hi", post_by: { user_uuid: by }, post_channel: { ch_uuid: "c1" } },
    },
  }) as unknown as UnifiedActivityItem

const a = mention("2026-10-10T06:49:13.580166492Z", "p1")
const b = mention("2026-10-10T06:49:13.269044907Z", "p2")
const c = mention("2026-10-10T06:49:13.135206157Z", "p3")

describe("the Activity feed's pages", () => {
  // The list keyed items by type and `time`, which the server cuts to the
  // second: the demo's All tab showed 2 of its 6 mentions.
  it("keeps every item made within one second", () => {
    expect(new Set([a, b, c].map(activityKey)).size).toBe(3)
    expect(mergeActivityPages([[a, b, c]])).toHaveLength(3)
  })

  it("shows an item a later page repeats once, where it first appeared", () => {
    const older = mention("2026-10-10T04:38:32.585932913Z", "p4")
    expect(mergeActivityPages([[a, b], [b, c, older]])).toEqual([a, b, c, older])
  })

  it("tells a comment and a reaction from a mention at the same moment", () => {
    const comment = { activity_type: "COMMENT", time: a.time, comment: { comment_created_at: a.mention!.mention_created_at, comment_by: { user_uuid: "u-jonas" }, comment_post: { post_uuid: "p1" } } } as unknown as UnifiedActivityItem
    const reaction = { activity_type: "REACTION", time: a.time, reaction: { uid: "0x1", reaction_added_at: a.mention!.mention_created_at, reaction_emoji_id: "+1", reaction_added_by: { user_uuid: "u-jonas" } } } as unknown as UnifiedActivityItem
    expect(new Set([a, comment, reaction].map(activityKey)).size).toBe(3)
  })
})

describe("the next page's cursor", () => {
  // The server reads the cursor to the second and answers strictly older, so
  // asking from the oldest item's own second dropped the rest of that second.
  it("asks from the second after the oldest item, so that second comes again", () => {
    expect(olderPageCursor("2026-10-10T06:49:13Z")).toBe("2026-10-10T06:49:14Z")
    expect(olderPageCursor("2026-10-10T06:49:13.135206157Z")).toBe("2026-10-10T06:49:14Z")
  })

  it("asks for the newest page without one", () => {
    expect(olderPageCursor(undefined)).toBe("")
    expect(olderPageCursor("")).toBe("")
  })
})

describe("an item with nothing to show", () => {
  // The query keeps a mention whose message the reader can no longer see, with
  // only its date: it drew as "Unknown user" and opened nothing.
  it("is left out", () => {
    const hollow = { activity_type: "MENTION", time: a.time, mention: { mention_created_at: a.mention!.mention_created_at } } as unknown as UnifiedActivityItem
    expect(hasSubject(hollow)).toBe(false)
    expect(hasSubject(a)).toBe(true)
  })
})

import { describe, expect, it } from "vitest"

import type { UnifiedActivityItem } from "@/types/activity"
import { activityKey } from "@/lib/activity/feedPages"
import {
  aggregate,
  BADGE_FOR_TYPE,
  badgeForType,
  collapsedVerb,
  dayGroupOf,
  kindOf,
  othersCount,
  previewParts,
  priorityGroupOf,
  sentenceOf,
  timeUnderDay,
} from "@/lib/activity/notification"
import { KIND_BADGE_TONE } from "@/components/ui/kindBadge"

const post = (over: Record<string, unknown> = {}) => ({
  post_uuid: "p1",
  post_text: '<p><span data-type="mention" data-id="u-sam@0x1" data-label="Sam Rivera">@Sam Rivera</span> can we get the rollback steps?</p>',
  post_channel: { ch_uuid: "c1", ch_name: "engineering" },
  post_by: { user_uuid: "u-jonas", user_full_name: "Jonas Weber" },
  ...over,
})
const mention = (over: Record<string, unknown> = {}) =>
  ({ activity_type: "MENTION", time: "2026-10-11T08:00:00Z", mention: { mention_created_at: "2026-10-11T08:00:00.1Z", mention_post: post() }, ...over }) as unknown as UnifiedActivityItem
const reaction = (by: string, at: string, on = "p9") =>
  ({
    activity_type: "REACTION",
    time: at,
    reaction: { uid: `r-${by}-${at}`, reaction_emoji_id: "tada", reaction_added_at: at, reaction_added_by: { user_uuid: by, user_full_name: by }, post: { post_uuid: on, post_text: "Ship it", post_channel: { ch_uuid: "c2", ch_name: "design" } } },
  }) as unknown as UnifiedActivityItem

describe("the kind badge per notification type (A5)", () => {
  it("maps every type the feed carries to a badge with a tone", () => {
    for (const [type, kind] of Object.entries(BADGE_FOR_TYPE)) {
      expect(badgeForType(type)).toBe(kind)
      expect(KIND_BADGE_TONE[kind]).toBeTruthy()
    }
  })

  it("fails on a type it was never told about", () => {
    expect(() => badgeForType("INVITE")).toThrow(/No kind badge/)
  })

  it("gives an agent's mention the agent badge, and a reply the reply badge", () => {
    expect(kindOf(mention({ actor_kind: "agent" }))).toBe("agent")
    const reply = { activity_type: "COMMENT", time: "x", comment: { comment_text: "ok", comment_post: post() } } as unknown as UnifiedActivityItem
    expect(kindOf(reply)).toBe("reply")
  })
})

describe("the sentence names the place (A4)", () => {
  it("says the channel for a mention, never 'in a post'", () => {
    const s = sentenceOf(mention())
    expect(`${s.verb} ${s.place}`).toBe("mentioned you in #engineering")
    expect(s.actor?.user_full_name).toBe("Jonas Weber")
  })

  it("says the thread's channel for a reply, and the task for a comment on one", () => {
    const reply = { activity_type: "COMMENT", time: "x", comment: { comment_text: "ok", comment_by: { user_uuid: "u-maya" }, comment_post: post({ post_channel: { ch_uuid: "c2", ch_name: "design" } }) } } as unknown as UnifiedActivityItem
    expect(sentenceOf(reply)).toMatchObject({ verb: "replied to your thread in", place: "#design" })
    const onTask = { activity_type: "COMMENT", time: "x", comment: { comment_text: "pilot moved", comment_task: { task_uuid: "t1", task_name: "Customer onboarding" } } } as unknown as UnifiedActivityItem
    expect(sentenceOf(onTask)).toMatchObject({ verb: "commented on", place: "Customer onboarding" })
  })
})

describe("the preview (A4)", () => {
  it("renders your own mention as @You and anybody else's as a neutral chip", () => {
    const parts = previewParts('<p><span data-type="mention" data-id="u-sam@0x1" data-label="Sam Rivera">@Sam Rivera</span> and <span data-type="mention" data-id="u-maya@0x2" data-label="Maya Chen">@Maya Chen</span>, look</p>', "u-sam")
    expect(parts).toEqual([
      { text: "@You", mention: "me" },
      { text: " and " },
      { text: "@Maya Chen", mention: "other" },
      { text: ", look " },
    ])
  })

  it("decodes entities and never shows markup", () => {
    expect(previewParts("<p>I&#39;m on call</p>", undefined).map((p) => p.text).join("")).toBe("I'm on call ")
  })
})

describe("aggregate (A6)", () => {
  it("collapses reactions to one message within a day into one row", () => {
    const rows = aggregate(
      [reaction("maya", "2026-10-11T10:00:00Z"), reaction("priya", "2026-10-11T09:00:00Z"), reaction("jonas", "2026-10-11T08:00:00Z"), reaction("old", "2026-10-09T08:00:00Z")],
      activityKey,
    )
    expect(rows).toHaveLength(2)
    expect(rows[0].collapsed).toBe("reactions")
    expect(othersCount(rows[0])).toBe(2)
    expect(rows[1].others).toHaveLength(0)
  })

  it("keeps reactions to different messages apart", () => {
    expect(aggregate([reaction("a", "2026-10-11T10:00:00Z", "p1"), reaction("b", "2026-10-11T10:00:00Z", "p2")], activityKey)).toHaveLength(2)
  })

  it("collapses one person's mentions in one thread", () => {
    const inThread = (at: string) =>
      ({
        activity_type: "MENTION",
        time: at,
        mention: { mention_created_at: at, mention_comment: { comment_uuid: `c-${at}`, comment_text: `ping ${at}`, comment_by: { user_uuid: "u-jonas" }, comment_post: post() } },
      }) as unknown as UnifiedActivityItem
    const rows = aggregate([inThread("2026-10-11T10:00:00Z"), inThread("2026-10-11T09:00:00Z"), inThread("2026-10-11T08:00:00Z")], activityKey)
    expect(rows).toHaveLength(1)
    expect(collapsedVerb(rows[0])).toBe("mentioned you 3 times in")
  })
})

describe("groups (A7, A8)", () => {
  const now = new Date(2026, 9, 11, 12)
  it("files by the device's day", () => {
    expect(dayGroupOf(new Date(2026, 9, 11, 8).toISOString(), now)).toBe("Today")
    expect(dayGroupOf(new Date(2026, 9, 10, 23).toISOString(), now)).toBe("Yesterday")
    expect(dayGroupOf(new Date(2026, 9, 7, 9).toISOString(), now)).toBe("Earlier this week")
    expect(dayGroupOf(new Date(2026, 8, 1).toISOString(), now)).toBe("Older")
  })

  // Under "Yesterday" every row said "Yesterday" again.
  it("gives a row under its day header only what the header has not said", () => {
    expect(timeUnderDay(new Date(2026, 9, 11, 8, 5).toISOString(), now)).toBe("8:05\u00a0AM")
    expect(timeUnderDay(new Date(2026, 9, 10, 16, 12).toISOString(), now)).toBe("4:12\u00a0PM")
    expect(timeUnderDay(new Date(2026, 9, 7, 9).toISOString(), now)).toBe("Wed")
    expect(timeUnderDay(new Date(2026, 8, 1).toISOString(), now)).toBe("1 Sep")
    expect(timeUnderDay("not a date", now)).toBe("")
  })

  it("puts agents' requests under From agents on Priority", () => {
    expect(priorityGroupOf(mention({ actor_kind: "agent" }))).toBe("From agents")
    expect(priorityGroupOf(mention())).toBe("Needs a reply")
  })
})

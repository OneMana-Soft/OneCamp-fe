import { describe, expect, it } from "vitest"

import type { UnifiedActivityItem } from "@/types/activity"
import { activityHref } from "@/lib/activity/activityHref"
import { panelTargetOf, showsTarget } from "@/lib/activity/panelTarget"
import { pinTestClock } from "@/lib/testing/testClock"

// The Inbox's reading pane (STEP4 #6) opens a row beside the list, from the
// same link the row opens as a page: the panel shows what the page would.

const ME = "u-sam"
pinTestClock()

describe("where a row opens beside the Inbox", () => {
  it("opens a channel message with its thread", () => {
    expect(panelTargetOf("/app/channel/c1/p1", ME)).toEqual({ channelUUID: "c1", postUUID: "p1" })
  })

  it("opens a DM's message with the other person, and a group's by its id", () => {
    expect(panelTargetOf("/app/chat/u-jonas/m1", ME)).toEqual({ chatUUID: "u-jonas", chatMessageUUID: "m1" })
    expect(panelTargetOf("/app/chat/group/g1/m2", ME)).toEqual({ groupUUID: "g1", chatMessageUUID: "m2" })
  })

  it("opens a task and an event", () => {
    expect(panelTargetOf("/app/task/t1", ME)).toEqual({ taskUUID: "t1" })
    expect(panelTargetOf("/app/calendar/event/e1", ME)).toEqual({ eventUUID: "e1" })
  })

  it("leaves a doc, a board, a whole conversation and the calendar to their pages", () => {
    for (const href of ["/app/doc/d1", "/app/doc/d1/comment?comment=x", "/app/board/b1", "/app/channel/c1", "/app/calendar", null]) {
      expect(panelTargetOf(href, ME), String(href)).toBeNull()
    }
  })

  it("waits for the reader before opening a DM, as its link does", () => {
    expect(panelTargetOf("/app/chat/u-jonas/m1", undefined)).toBeNull()
  })

  it("follows activityHref for a reply in a thread: the thread it is in", () => {
    const reply = {
      activity_type: "COMMENT",
      time: "2026-10-17T10:00:00Z",
      comment: { comment_uuid: "k1", comment_text: "On it", comment_post: { post_uuid: "p7", post_channel: { ch_uuid: "c3" } } },
    } as unknown as UnifiedActivityItem
    expect(panelTargetOf(activityHref(reply, ME), ME)).toEqual({ channelUUID: "c3", postUUID: "p7" })
  })
})

describe("the row the panel shows", () => {
  const panel = (data: Record<string, string>, isOpen = true) => ({ isOpen, data })
  it("is the one whose target the open panel holds", () => {
    expect(showsTarget(panel({ channelUUID: "c1", postUUID: "p1", taskUUID: "" }), { channelUUID: "c1", postUUID: "p1" })).toBe(true)
    expect(showsTarget(panel({ channelUUID: "c1", postUUID: "p2" }), { channelUUID: "c1", postUUID: "p1" })).toBe(false)
    expect(showsTarget(panel({ taskUUID: "t1" }), { taskUUID: "t1" })).toBe(true)
  })

  it("is none while the panel is closed, or for a row it can't hold", () => {
    expect(showsTarget(panel({ taskUUID: "t1" }, false), { taskUUID: "t1" })).toBe(false)
    expect(showsTarget(panel({ taskUUID: "t1" }), null)).toBe(false)
  })
})

import { describe, expect, it } from "vitest"
import { activityHref } from "@/lib/activity/activityHref"
import type { UnifiedActivityItem } from "@/types/activity"

/**
 * Every kind of Activity row opens a page that exists. The rows used to push
 * "app/channel/…" (no leading slash), which from /app/activity resolved to
 * /app/app/channel/… and showed "This page doesn't exist" for every mention;
 * a DM mention added the message id twice; a mention in a reply opened
 * nothing; a reaction on a task threw on a comment that wasn't there.
 */
const ME = "me-uuid"
const OTHER = "other-uuid"
const row = (partial: Record<string, unknown>) => ({ time: "2026-10-10T10:00:00Z", ...partial }) as unknown as UnifiedActivityItem

const post = { post_uuid: "p1", post_channel: { ch_uuid: "c1" } }
const dmChat = { chat_uuid: "m1", chat_dm: { dm_grouping_id: `${ME} ${OTHER}` } }
const groupChat = { chat_uuid: "m2", chat_dm: { dm_grouping_id: "0123456789abcdef0123456789abcdef" } }

describe("activityHref", () => {
  it("opens a channel mention in its thread, from the app's root", () => {
    expect(activityHref(row({ activity_type: "MENTION", mention: { mention_post: post } }), ME)).toBe("/app/channel/c1/p1")
  })

  it("opens a DM mention at the message, once", () => {
    expect(activityHref(row({ activity_type: "MENTION", mention: { mention_chat: dmChat } }), ME)).toBe(`/app/chat/${OTHER}/m1`)
  })

  it("opens a group mention at the message", () => {
    expect(activityHref(row({ activity_type: "MENTION", mention: { mention_chat: groupChat } }), ME)).toBe("/app/chat/group/0123456789abcdef0123456789abcdef/m2")
  })

  it("opens a mention in a thread reply at the thread", () => {
    expect(activityHref(row({ activity_type: "MENTION", mention: { mention_comment: { comment_uuid: "r1", comment_post: post } } }), ME)).toBe("/app/channel/c1/p1")
  })

  it("opens task, doc and board mentions where they live", () => {
    expect(activityHref(row({ activity_type: "MENTION", mention: { mention_task: { task_uuid: "t1" } } }), ME)).toBe("/app/task/t1")
    expect(activityHref(row({ activity_type: "MENTION", mention: { mention_doc: { doc_uuid: "d1" } } }), ME)).toBe("/app/doc/d1/comment")
    expect(activityHref(row({ activity_type: "MENTION", mention: { mention_comment: { comment_board: { board_uuid: "b1" } } } }), ME)).toBe("/app/board/b1")
  })

  it("opens a comment on what it replies to", () => {
    expect(activityHref(row({ activity_type: "COMMENT", comment: { comment_post: post } }), ME)).toBe("/app/channel/c1/p1")
    expect(activityHref(row({ activity_type: "COMMENT", comment: { comment_chat: dmChat } }), ME)).toBe(`/app/chat/${OTHER}/m1`)
    expect(activityHref(row({ activity_type: "COMMENT", comment: { comment_task: { task_uuid: "t1" } } }), ME)).toBe("/app/task/t1")
  })

  it("opens a reaction on a task without a comment in the payload", () => {
    expect(() => activityHref(row({ activity_type: "REACTION", reaction: { reaction_task: { task_uuid: "t1" } } }), ME)).not.toThrow()
    expect(activityHref(row({ activity_type: "REACTION", reaction: { reaction_task: { task_uuid: "t1" } } }), ME)).toBe("/app/task/t1")
    expect(activityHref(row({ activity_type: "REACTION", reaction: { post } }), ME)).toBe("/app/channel/c1/p1")
    expect(activityHref(row({ activity_type: "REACTION", reaction: { comment: { comment_doc: { doc_uuid: "d1" } } } }), ME)).toBe("/app/doc/d1/comment")
  })

  it("every path it gives is absolute", () => {
    const rows = [
      row({ activity_type: "MENTION", mention: { mention_post: post } }),
      row({ activity_type: "MENTION", mention: { mention_task: { task_uuid: "t1" } } }),
      row({ activity_type: "COMMENT", comment: { comment_doc: { doc_uuid: "d1" } } }),
    ]
    for (const r of rows) expect(activityHref(r, ME)).toMatch(/^\/app\//)
  })

  it("gives nothing for a row with nothing to open", () => {
    expect(activityHref(row({ activity_type: "MENTION", mention: {} }), ME)).toBeNull()
    expect(activityHref(row({ activity_type: "REACTION" }), ME)).toBeNull()
    // A DM needs to know which side the reader is on.
    expect(activityHref(row({ activity_type: "MENTION", mention: { mention_chat: dmChat } }), undefined)).toBeNull()
  })
})

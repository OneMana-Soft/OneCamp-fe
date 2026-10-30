import { describe, expect, it } from "vitest"
import type { SearchResult } from "@/services/searchService"
import { resultPath } from "./resultPath"

const ME = "11111111-1111-4111-8111-111111111111"
const MAYA = "22222222-2222-4222-8222-222222222222"
const DM = `${ME} ${MAYA}`
const GROUP = "0123456789abcdef0123456789abcdef"

const hit = (r: Record<string, unknown>) => r as unknown as SearchResult

describe("resultPath", () => {
  // The chat route takes the other person's id: a message's own id there
  // opened a conversation "with" nobody (SA-BUG-1).
  it("opens a DM message in the conversation with the other person, at its thread", () => {
    expect(resultPath(hit({ type: "chat", chat: { chat_id: "m1", chat_grp_id: DM, chat_by_user_id: MAYA } }), ME)).toBe(
      `/app/chat/${MAYA}/m1`,
    )
    // Your own message opens the same conversation, not one with yourself.
    expect(resultPath(hit({ type: "chat", chat: { chat_id: "m2", chat_grp_id: DM, chat_by_user_id: ME } }), ME)).toBe(
      `/app/chat/${MAYA}/m2`,
    )
  })

  it("opens a group message in the group, not a DM with its author", () => {
    expect(resultPath(hit({ type: "chat", chat: { chat_id: "m3", chat_grp_id: GROUP, chat_by_user_id: MAYA } }), ME)).toBe(
      `/app/chat/group/${GROUP}/m3`,
    )
  })

  it("opens nothing for a DM message while who is signed in isn't known", () => {
    expect(resultPath(hit({ type: "chat", chat: { chat_id: "m1", chat_grp_id: DM } }), "")).toBeNull()
    expect(resultPath(hit({ type: "chat", chat: { chat_id: "m1" } }), ME)).toBeNull()
  })

  it("opens a reply or a file in a DM or a group at its thread", () => {
    expect(resultPath(hit({ type: "comment", comment: { comment_chat_grp_id: DM, comment_chat_id: "m1" } }), ME)).toBe(
      `/app/chat/${MAYA}/m1`,
    )
    expect(
      resultPath(hit({ type: "attachment", attachment: { attachment_chat_grp_id: GROUP, attachment_chat_id: "m4" } }), ME),
    ).toBe(`/app/chat/group/${GROUP}/m4`)
  })

  it("opens everything else where it lives", () => {
    expect(resultPath(hit({ type: "post", post: { post_id: "p1", post_ch_id: "c1" } }), ME)).toBe("/app/channel/c1/p1")
    expect(resultPath(hit({ type: "channel", channel: { ch_id: "c1" } }), ME)).toBe("/app/channel/c1")
    expect(resultPath(hit({ type: "task", task: { task_id: "t1" } }), ME)).toBe("/app/task/t1")
    expect(resultPath(hit({ type: "comment", comment: { comment_doc_id: "d1" } }), ME)).toBe("/app/doc/d1/comment")
    expect(resultPath(hit({ type: "user", user: { user_id: MAYA } }), ME)).toBeNull()
  })

  it("opens an event at its own page, the calendar's one rule for a link to an event", () => {
    expect(resultPath(hit({ type: "event", event: { event_uuid: "e1" } }), ME)).toBe("/app/calendar/event/e1")
    expect(resultPath(hit({ type: "event", event: {} }), ME)).toBeNull()
  })
})

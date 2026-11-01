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

  // miro-05 to_win 2: a hit on what is written on a board opens the board at those words, its Find on them.
  it("opens a board at the words a hit found written on it, and plainly when only its name matched", () => {
    const board = { board_uuid: "b1", board_title: "Launch" }
    const at = (fragments: string[]) => resultPath(hit({ type: "board", board, highlight: { board_text: fragments } }), ME)
    expect(at(["the <mark>launch</mark> <mark>budget</mark> is set. <mark>budget</mark> again"])).toBe("/app/board/b1?find=launch%20budget")
    expect(at(["<mark>Maya&#39;s</mark> notes"])).toBe(`/app/board/b1?find=${encodeURIComponent("Maya's")}`)
    // No words marked (or only the name matched): the board, as before.
    expect(at(["nothing marked"])).toBe("/app/board/b1")
    expect(resultPath(hit({ type: "board", board, highlight: { board_title: ["<mark>Launch</mark>"] } }), ME)).toBe("/app/board/b1")
  })

  it("opens nothing for a hit that names no doc, board, task, project, team or channel: never a page of \"undefined\"", () => {
    for (const type of ["doc", "board", "task", "project", "team", "channel"]) {
      expect(resultPath(hit({ type, [type]: {} }), ME), type).toBeNull()
      expect(resultPath(hit({ type }), ME), type).toBeNull()
    }
  })
})

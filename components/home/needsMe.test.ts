import { describe, expect, it } from "vitest"
import type { WaitingApproval } from "@/lib/rules/approvals"
import { dueLabel } from "@/lib/utils/dueLabel"
import { pinTestClock } from "@/lib/testing/testClock"
import type { NoticeItem, UnifiedActivityItem } from "@/types/activity"
import { approvalsToNeeds, groupNeeds, mentionsToNeeds, NEEDS_LABEL, NEEDS_ORDER } from "./needsMe"

// Approvals waiting for the reader (GET /approvals/waiting) on Home, as
// PLATFORM-LEAD-7 agreed (22 Oct): their own group after agent requests, a
// row per request that links to it, and the answers kept in the item's card.

const now = new Date("2026-10-23T09:00:00Z")
pinTestClock(now)
const row = (over: Partial<WaitingApproval> = {}): WaitingApproval => ({
  approval_id: "a1", kind: "task", id: "t1", title: "Launch copy", path: "/app/task/t1", to_name: "Done", requested_by: "u-cy",
  created_at: "2026-10-23T08:00:00Z", project_id: "p1", project_name: "Q4 launch",
  asker: { user_uuid: "u-cy", user_name: "Cy Park" }, ...over,
})

describe("approvals waiting for me, on Home", () => {
  it("are a group of their own, after agent requests and before replies", () => {
    expect(NEEDS_ORDER).toEqual(["agent", "approval", "reply", "due", "email"])
    expect(NEEDS_LABEL.approval).toBe("Approvals")
    const { groups } = groupNeeds([{ id: "dm:1", kind: "reply", title: "Maya wrote to you" }, ...approvalsToNeeds([row()], now)])
    expect(groups.map((g) => g.label)).toEqual(["Approvals", "Replies"])
  })

  it("say the task, what is asked or where it moves, who asked and by when, and link to it", () => {
    const due = "2026-10-24T12:00:00Z"
    const [asked, moved] = approvalsToNeeds([row({ ask: "Is the copy final?", due_at: due }), row({ approval_id: "a2", id: "t2", title: "Pricing page", path: "/app/task/t2" })], now)
    expect(asked).toMatchObject({
      id: "approval:a1", kind: "approval", title: "Launch copy", quote: "Is the copy final?", href: "/app/task/t1",
      taskUuid: "t1", projectUuid: "p1", project: { id: "p1", name: "Q4 launch" },
      person: { id: "u-cy", name: "Cy Park", bot: false }, due: dueLabel(due, now), overdue: false, when: due,
    })
    expect(moved.quote).toBe("Move to Done")
    expect(moved.due).toBeUndefined()
  })

  it("draw an agent that asked as its square, and a passed due date as late", () => {
    const [a] = approvalsToNeeds([row({ due_at: "2026-10-22T09:00:00Z", asker: { user_uuid: "u-bot", user_name: "triage", is_bot: true } })], now)
    expect(a.person).toMatchObject({ id: "u-bot", bot: true })
    expect(a.overdue).toBe(true)
    expect(a.due).toBe(dueLabel("2026-10-22T09:00:00Z", now))
  })

  it("keep a doc's request as a link with no task to act on, and a row whose asker couldn't be read", () => {
    const [doc] = approvalsToNeeds([row({ kind: "doc", id: "d1", path: "/app/doc/d1", to_name: undefined, project_id: undefined, project_name: undefined, asker: undefined })], now)
    expect(doc).toMatchObject({ href: "/app/doc/d1", taskUuid: undefined, project: undefined, person: undefined })
    expect(doc.quote).toBeUndefined()
  })
})

// CR-B27 F1: a mention an edit adds to a message reaches the feed only as a
// message.mentioned notice (notif head A). Home's "needs me" lists it as it
// lists the mention a send made, and a message once whichever way it came.
describe("a mention an edit added to a message, on Home", () => {
  const at = new Date("2026-10-23T08:00:00Z").toISOString()
  const JONAS = { user_uuid: "u-jonas", user_name: "Jonas Weber" }
  const notice = (over: Partial<NoticeItem> = {}, item: Partial<UnifiedActivityItem> = {}): UnifiedActivityItem => ({
    activity_type: "NOTICE",
    time: at,
    priority: "normal",
    actor_kind: "person",
    notice: {
      id: "n1",
      kind: "message.mentioned",
      resource_kind: "channel",
      resource_uuid: "c1",
      title: "engineering",
      can_open: true,
      reason: "mention",
      actor: JONAS as never,
      data: { post_id: "p1" },
      created_at: at,
      ...over,
    },
    ...item,
  })

  it("lists one in a channel: who, where, the post to reply under, and where it opens", () => {
    const rows = mentionsToNeeds([notice()], "me", now)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      id: "mention:p1",
      kind: "reply",
      title: "Jonas mentioned you in #engineering",
      person: { id: "u-jonas", name: "Jonas Weber", bot: false },
      quote: "",
      href: "/app/channel/c1/p1",
      postUuid: "p1",
      when: at,
    })
  })

  it("lists one in a conversation, opening the message", () => {
    const [row] = mentionsToNeeds([notice({ resource_kind: "conversation", resource_uuid: "g1", title: undefined, data: { message_id: "m1" } })], "me", now)
    expect(row).toMatchObject({ id: "mention:m1", title: "Jonas mentioned you in a message", href: "/app/chat/group/g1/m1" })
    expect(row.postUuid).toBeUndefined()
  })

  it("names nothing, opens nothing and offers no reply where its reader can't open the place now", () => {
    const [row] = mentionsToNeeds([notice({ can_open: false, title: undefined })], "me", now)
    expect(row.title).toBe("Jonas mentioned you in a message")
    expect(row.href).toBeUndefined()
    expect(row.postUuid).toBeUndefined()
  })

  it("shows a message once when the feed holds both its mention and its notice", () => {
    const mention = {
      activity_type: "MENTION",
      time: at,
      priority: "normal",
      mention: { mention_post: { post_uuid: "p1", post_text: "hi", post_channel: { ch_uuid: "c1", ch_name: "engineering" }, post_by: JONAS } },
    } as never
    expect(mentionsToNeeds([mention, notice()], "me", now).map((r) => r.id)).toEqual(["mention:p1"])
    expect(mentionsToNeeds([notice(), mention], "me", now).map((r) => r.id)).toEqual(["mention:p1"])
  })

  it("leaves out other notices, a low one, a week-old one, and one in a reply, as it leaves out a reply's mention", () => {
    const old = new Date(now.getTime() - 8 * 24 * 3600 * 1000).toISOString()
    const left = [
      notice({ kind: "task.mentioned", resource_kind: "task", resource_uuid: "t1" }),
      notice({ kind: "agent.replied" }),
      notice({}, { priority: "low" }),
      notice({}, { time: old }),
      notice({ data: { post_id: "p1", comment_uuid: "k1" } }),
    ]
    expect(mentionsToNeeds(left, "me", now)).toEqual([])
  })
})

import { describe, expect, it } from "vitest"

import type { NoticeItem, UnifiedActivityItem } from "@/types/activity"
import { isMention, noticeBadge, noticeHref, noticeWords, UNOPENED_PLACE } from "./notice"
import { kindOf, sentenceOf } from "./notification"
import { activityHref } from "./activityHref"
import { activityKey, hasSubject, inboxFeedKey } from "./feedPages"

const AKASH = { user_uuid: "a1", user_name: "Akash", user_profile_object_key: "" }
const AGENT = { user_uuid: "b7", user_name: "Release Captain", user_profile_object_key: "" }

function notice(kind: string, extra: Partial<NoticeItem> = {}): NoticeItem {
  return {
    id: "n1",
    kind,
    resource_kind: "doc",
    resource_uuid: "d1",
    title: "Launch notes",
    can_open: true,
    reason: "subject",
    actor: AKASH,
    created_at: "2026-10-12T12:00:00.123456789Z",
    ...extra,
  }
}

const item = (n: NoticeItem): UnifiedActivityItem => ({ activity_type: "NOTICE", time: n.created_at, notice: n, actor_kind: "person" })

describe("an inbox notice in words", () => {
  it("says who did what to which page", () => {
    expect(noticeWords(notice("doc.mentioned"))).toMatchObject({ actor: AKASH, verb: "mentioned you in", place: "Launch notes" })
    expect(noticeWords(notice("doc.comment.created")).verb).toBe("commented on")
    expect(noticeWords(notice("doc.shared", { data: { level: "comment" } }))).toMatchObject({
      verb: "shared",
      place: "Launch notes",
      preview: "With you. You can read it and comment on it.",
    })
    expect(noticeWords(notice("doc.proposal.created")).verb).toBe("proposed a change to")
    expect(noticeWords(notice("doc.proposal.accepted", { data: { author_kind: "person" } })).verb).toBe("accepted your proposed change to")
    expect(noticeWords(notice("doc.proposal.declined", { data: { author_kind: "agent" } })).verb).toBe("declined the change proposed for you to")
    expect(noticeWords(notice("doc.proposal.withdrawn")).verb).toBe("withdrew your proposed change to")
    expect(noticeWords(notice("thread.replied")).verb).toBe("replied in a thread on")
    expect(noticeWords(notice("thread.resolved")).verb).toBe("resolved a thread on")
    expect(noticeWords(notice("thread.reopened")).verb).toBe("reopened a thread on")
    expect(noticeBadge(notice("thread.replied"))).toBe("reply")
    expect(noticeHref(notice("thread.resolved"))).toBe("/app/doc/d1/comment")
  })

  // B7: a notice opens the thread it is about, where the comments are shown.
  it("opens the thread a thread's notice names, and the thread a comment is in", () => {
    expect(noticeHref(notice("thread.replied", { data: { thread_id: "t 1", comment_id: "c1" } }))).toBe("/app/doc/d1/comment/t%201")
    expect(noticeHref(notice("thread.reopened", { data: { thread_id: "t2", status: "open" } }))).toBe("/app/doc/d1/comment/t2")
    expect(noticeHref(notice("doc.comment.created", { data: { comment_uuid: "c9" } }))).toBe("/app/doc/d1/comment?comment=c9")
    expect(noticeHref(notice("doc.comment.created", { data: { comment_id: "c8" } }))).toBe("/app/doc/d1/comment?comment=c8")
    expect(noticeHref(notice("doc.comment.created"))).toBe("/app/doc/d1/comment")
    expect(noticeHref(notice("doc.shared", { data: { thread_id: "t3" } }))).toBe("/app/doc/d1")
  })

  it("names an agent's work by the agent", () => {
    expect(noticeWords(notice("doc.proposal.created", { agent: AGENT })).actor).toBe(AGENT)
  })

  it("asks whoever mentioned someone who can't open the page to share it", () => {
    const w = noticeWords(notice("doc.mention.unshared", { actor: undefined, reason: "author", data: { person: "s5", person_name: "Sam Rivera" } }))
    expect(w.actor).toMatchObject({ user_uuid: "s5", user_name: "Sam Rivera" })
    expect(w.verb).toBe("can't open")
    expect(w.preview).toMatch(/Share it/)
  })

  it("never names a page its reader can't open, and opens nothing", () => {
    const n = notice("doc.mentioned", { title: undefined, can_open: false })
    expect(noticeWords(n).place).toBe(UNOPENED_PLACE)
    expect(noticeHref(n)).toBeNull()
  })
})

describe("a notice in the feed", () => {
  it("carries a badge of its kind, an agent's own", () => {
    expect(noticeBadge(notice("doc.mentioned"))).toBe("mention")
    expect(noticeBadge(notice("doc.shared"))).toBe("invite")
    expect(noticeBadge(notice("doc.proposal.accepted"))).toBe("reply")
    expect(kindOf(item(notice("doc.shared")))).toBe("invite")
    expect(kindOf({ ...item(notice("doc.proposal.created")), actor_kind: "agent" })).toBe("agent")
  })

  it("is a sentence, a link, a key and a mention like any item", () => {
    const m = item(notice("doc.mentioned"))
    expect(sentenceOf(m)).toMatchObject({ verb: "mentioned you in", place: "Launch notes", at: "2026-10-12T12:00:00.123456789Z" })
    expect(activityHref(m, "me")).toBe("/app/doc/d1")
    expect(activityHref(item(notice("doc.comment.created")), "me")).toBe("/app/doc/d1/comment")
    expect(activityKey(m)).toBe("NOTICE|id|n1")
    expect(hasSubject(m)).toBe(true)
    expect(hasSubject({ activity_type: "NOTICE", time: "" })).toBe(false)
    expect(isMention(m)).toBe(true)
    expect(isMention(item(notice("doc.shared")))).toBe(false)
    expect(isMention({ activity_type: "MENTION", time: "" })).toBe(true)
  })

  it("is asked for by the inbox, under one key for its tabs and its list", () => {
    expect(inboxFeedKey("/activity/unified", 20)).toBe("/activity/unified?limit=20&notices=1")
    expect(inboxFeedKey("/activity/unified", 20, "2026-10-12T12:00:00Z")).toBe(
      "/activity/unified?limit=20&notices=1&beforeTime=2026-10-12T12%3A00%3A00Z",
    )
  })
})

// CAL-BUG-5: a booking reached its page's owner by email only; with none
// set up they were never told. It is an Inbox notice now, from someone
// outside the workspace, so it reads "changed a page you can't open" no more.
describe("a booking notice", () => {
  const booking = (kind: string) =>
    notice(kind, {
      resource_kind: "event",
      resource_uuid: "e-1",
      title: undefined,
      can_open: false,
      reason: "owner",
      actor: undefined,
      data: { guest_name: "Alex Kim", page_title: "Intro call", starts_at: new Date(2026, 9, 14, 10).toISOString(), ends_at: new Date(2026, 9, 14, 10, 30).toISOString(), tz: "Asia/Kolkata" },
    })

  it("says who booked which page, and when, on the reader's clock", () => {
    const w = noticeWords(booking("booking.created"))
    expect(w.actor?.user_name).toBe("Alex Kim")
    expect(`${w.verb} ${w.place}`).toBe("booked Intro call")
    expect(w.preview).toMatch(/^Wed 14 Oct, 10:00\sAM – 10:30\sAM$/)
    expect(noticeWords(booking("booking.cancelled")).verb).toBe("cancelled")
  })

  it("opens the meeting, or the calendar once it's cancelled", () => {
    expect(noticeHref(booking("booking.created"))).toBe("/app/calendar/event/e-1")
    expect(noticeHref(booking("booking.cancelled"))).toBe("/app/calendar")
    expect(noticeBadge(booking("booking.created"))).toBe("invite")
  })
})

// CAL-BUG-1: a guest taken off an event stayed on it; now they're told, in
// the Inbox, without the event being named.
describe("a notice that you were taken off an event", () => {
  const off = notice("event.uninvited", { resource_kind: "event", resource_uuid: "e-1", title: "", can_open: true, reason: "participant", data: { start: new Date(2026, 9, 14, 10).toISOString() } })

  it("says who took you off, and when the event was, never its name", () => {
    const w = noticeWords(off)
    expect(w.actor?.user_name).toBe("Akash")
    expect(`${w.verb} ${w.place}`).toMatch(/^took you off an event on Wed 14 Oct, 10:00\sAM$/)
    expect(w.preview).toBe("It's no longer on your calendar.")
    expect(sentenceOf(item(off)).place).not.toMatch(/Untitled|a page you can't open/)
  })

  it("opens nothing", () => {
    expect(noticeHref(off)).toBeNull()
  })
})

// A5×A6: asking for access, and the answer, in the inbox.
describe("a request for access in the inbox", () => {
  const SAM = { user_uuid: "s5", user_name: "Sam Rivera", user_profile_object_key: "" }

  it("asks the people who can answer it, naming who asked and for what", () => {
    const n = notice("doc.access_requested", { actor: SAM, data: { request: "r1", level: "comment" } })
    expect(noticeWords(n)).toMatchObject({ actor: SAM, verb: "asked to comment on", place: "Launch notes" })
    expect(noticeWords(notice("doc.access_requested", { data: { request: "r1", level: "edit" } })).verb).toBe("asked to edit")
    expect(noticeBadge(n)).toBe("invite")
    expect(kindOf(item(n))).toBe("invite")
    expect(noticeHref(n)).toBe("/app/doc/d1")
  })

  it("tells whoever asked who approved it, and what they may do now", () => {
    const n = notice("doc.access_answered", { data: { request: "r1", status: "approved", level: "edit" } })
    expect(noticeWords(n)).toMatchObject({ actor: AKASH, verb: "approved your request for", place: "Launch notes", preview: "You can edit it." })
    expect(noticeHref(n)).toBe("/app/doc/d1")
    expect(noticeBadge(n)).toBe("invite")
  })

  it("never says who declined, nor names a page its asker can't open, nor opens it", () => {
    const n = notice("doc.access_answered", {
      actor: undefined,
      title: undefined,
      can_open: false,
      data: { request: "r1", status: "declined", level: "edit" },
    })
    const w = noticeWords(n)
    expect(w).toMatchObject({ actor: undefined, verb: "declined your request to edit", place: UNOPENED_PLACE })
    expect(w.preview).toMatch(/ask again/)
    expect(noticeHref(n)).toBeNull()
    expect(sentenceOf(item(n)).place).toBe(UNOPENED_PLACE)
    // An actor the server never sends for a decline is not shown if it came.
    expect(noticeWords({ ...n, actor: AKASH }).actor).toBeUndefined()
    // Approved, then taken off again: nothing of the page, no line about it.
    const gone = notice("doc.access_answered", { title: undefined, can_open: false, data: { status: "approved", level: "edit" } })
    expect(noticeWords(gone)).toMatchObject({ place: UNOPENED_PLACE, preview: "" })
  })
})

// A comment on a table's row (business/TableComments): named "Acme in Deals"
// for a reader who may open the row, opening it at the thread.
describe("a notice about a table's row", () => {
  const row = (kind: string, extra: Partial<NoticeItem> = {}) =>
    notice(kind, {
      resource_kind: "table_row",
      resource_uuid: "r1",
      title: "Acme in Deals",
      data: { table_id: "t1", thread_id: "th1", comment_id: "c1" },
      ...extra,
    })

  it("says who mentioned you on which row, and opens the row at the thread", () => {
    const n = row("table_row.mentioned")
    expect(noticeWords(n)).toMatchObject({ verb: "mentioned you on", place: "Acme in Deals" })
    expect(noticeHref(n)).toBe("/app/tables/t1?row=r1&thread=th1")
    expect(noticeBadge(n)).toBe("mention")
    expect(isMention(item(n))).toBe(true)
  })

  it("says a reply on a row as a doc thread's reply is said", () => {
    const n = row("thread.replied")
    expect(noticeWords(n)).toMatchObject({ verb: "replied in a thread on", place: "Acme in Deals" })
    expect(noticeHref(n)).toBe("/app/tables/t1?row=r1&thread=th1")
  })

  it("tells whoever mentioned someone who can't open the table why they weren't told", () => {
    const words = noticeWords(row("table_row.mention.unshared", { data: { table_id: "t1", person: "p9", person_name: "Sam" } }))
    expect(words.actor?.user_name).toBe("Sam")
    expect(words.verb).toBe("can't open")
    expect(words.preview).toMatch(/isn't shared with them, so they weren't told/)
  })

  it("never names or opens a row its reader can't open now, nor one without its table", () => {
    const shut = row("table_row.mentioned", { can_open: false, title: "" })
    expect(noticeWords(shut).place).toBe(UNOPENED_PLACE)
    expect(noticeHref(shut)).toBeNull()
    expect(noticeHref(row("table_row.mentioned", { data: {} }))).toBeNull()
  })
})

describe("someone who left with work under their name (docs C6-2)", () => {
  const n = (can_open: boolean) =>
    ({ id: "n1", kind: "member.left_work", resource_kind: "departed_member", resource_uuid: "u-dana", reason: "admin", title: can_open ? "Dana Ross" : "", can_open, data: { docs: "12", links: "3", work: "12 docs and 3 links" }, created_at: "" }) as never

  it("names them and their work for an admin, and opens the Docs settings", () => {
    const w = noticeWords(n(true))
    expect(w.actor?.user_name).toBe("Dana Ross")
    expect(`${w.verb} ${w.place}`).toBe("left with 12 docs and 3 links under their name")
    expect(noticeHref(n(true))).toBe("/app/admin?tab=docs#docs-departed")
  })

  it("names nobody and opens nothing for someone who isn't an admin now", () => {
    expect(noticeWords(n(false)).actor?.user_name).toBe("Someone who left")
    expect(noticeHref(n(false))).toBeNull()
  })

  it("says the work in the server's words, or \"work\" without them", () => {
    const bare = { ...(n(true) as object), data: { docs: "12", links: "3" } } as never
    expect(noticeWords(bare).place).toBe("work under their name")
  })
})

// ADMIN-02: someone's own way in met the free plan's limit, and every admin
// hears of it. The address rides in the notice's words, which the server
// sends only to a reader who may open it (an admin now).
describe("someone the free plan's limit kept out", () => {
  const n = (can_open: boolean) =>
    ({
      id: "n1",
      kind: "member.seat_refused",
      resource_kind: "seat_refused",
      resource_uuid: "p-ana",
      reason: "admin",
      title: can_open ? "Your free plan" : "",
      can_open,
      // The line is the server's words (its data), with the plan's own figure.
      data: { ...(can_open ? { text: "ana@example.com" } : {}), limit: "25", line: "Remove the 25-person limit, or free a place." },
      created_at: "",
    }) as never

  it("a seat refusal names them and opens Plan for an admin", () => {
    const w = noticeWords(n(true))
    expect(w.actor?.user_name).toBe("ana@example.com")
    expect(`${w.verb} ${w.place}`).toBe("couldn't join: your free plan is full")
    expect(w.preview).toBe("Remove the 25-person limit, or free a place.")
    expect(noticeHref(n(true))).toBe("/app/admin?tab=plan")
    // Someone asking to come in: the invite's badge, not a comment's.
    expect(noticeBadge(n(true))).toBe("invite")
  })

  it("and names nobody and opens nothing for anyone else", () => {
    const w = noticeWords(n(false))
    expect(w.actor?.user_name).toBe("Someone")
    expect(w.preview).toBe("")
    expect(noticeHref(n(false))).toBeNull()
  })

  it("and names nobody even when the address came along (a stale cache, a server that forgot to strip it)", () => {
    const stale = { ...(n(false) as object), data: { text: "ana@example.com", limit: "25", line: "Remove the 25-person limit, or free a place." } } as never
    const w = noticeWords(stale)
    expect(w.actor?.user_name).toBe("Someone")
    expect(w.preview).toBe("")
    expect(noticeHref(stale)).toBeNull()
  })
})

describe("a rule's notices", () => {
  it("name the task and open it only for a reader who may open it", () => {
    const told = notice("work.rule", { resource_kind: "task", resource_uuid: "t1", title: "Fix SSO", can_open: true })
    expect(noticeWords(told)).toMatchObject({ actor: undefined, ownSubject: true, verb: "A rule asks you to look at", place: "Fix SSO" })
    expect(noticeHref(told)).toBe("/app/task/t1")
    expect(noticeHref({ ...told, title: undefined, can_open: false })).toBeNull()
  })
  it("take a stopped rule's owner to the project's Rules", () => {
    const stopped = notice("work.rule.paused", { resource_kind: "rule", resource_uuid: "r1", title: "Triage", can_open: true, data: { project_id: "p1" } })
    expect(noticeWords(stopped)).toMatchObject({ actor: undefined, ownSubject: true, verb: "Your rule stopped itself:", place: "Triage" })
    expect(noticeHref(stopped)).toBe("/app/project/p1?tool=rules")
  })
  // A rule's notice wore a comment's bubble (DESIGN-BUILD-49, 30 Oct): it has a
  // mark of its own, the one the project's Rules tool wears.
  it("wear the rule's mark, and every other notice keeps its own", () => {
    expect(noticeBadge(notice("work.rule"))).toBe("rule")
    expect(noticeBadge(notice("work.rule.paused"))).toBe("rule")
    expect(kindOf({ activity_type: "NOTICE", notice: notice("work.rule") } as UnifiedActivityItem)).toBe("rule")
    expect(noticeBadge(notice("work.approval.requested"))).toBe("comment")
    expect(noticeBadge(notice("doc.access_answered"))).toBe("invite")
  })
})

describe("approval notices", () => {
  it("ask an approver, and tell the asker how it ended, opening the task", () => {
    const asked = notice("work.approval.requested", { resource_kind: "task", resource_uuid: "t1", title: "Ship it" })
    expect(noticeWords(asked)).toMatchObject({ verb: "asks you to approve", place: "Ship it" })
    expect(noticeWords(notice("work.approval.decided", { resource_kind: "task", resource_uuid: "t1", data: { state: "changes" } })).verb).toBe("asked for changes to")
    expect(noticeHref(asked)).toBe("/app/task/t1")
  })
})

describe("someone an upgrade took off a project's tasks", () => {
  const REPAIR = { user_uuid: "r1", user_name: "OneCamp, upgrade repair", user_profile_object_key: "" }
  const BACK = "To give them the tasks back, add them to the project or let them into the tasks, then assign them again."
  const repaired = (can_open: boolean, tasks = "3", title = can_open ? "Launch" : "") =>
    notice("project.assignees_repaired", {
      resource_kind: "project",
      resource_uuid: "p1",
      title,
      can_open,
      reason: "admin",
      actor: REPAIR,
      data: { person: "u-ben", person_name: "Ben Ade", tasks },
    })

  it("names who was taken off how many of its tasks, never which, and how to give them back", () => {
    const w = noticeWords(repaired(true))
    expect(w.actor).toMatchObject({ user_uuid: "u-ben", user_name: "Ben Ade" })
    expect(`${w.verb} ${w.place}`).toBe("was taken off 3 tasks in Launch")
    expect(w.preview).toBe(BACK)
    expect(noticeWords(repaired(true, "1")).verb).toBe("was taken off 1 task in")
  })

  it("calls a nameless project the reader may open Untitled, and still says how to give the tasks back", () => {
    const w = noticeWords(repaired(true, "3", ""))
    expect(w.place).toBe("Untitled")
    expect(w.preview).toBe(BACK)
    expect(noticeHref(repaired(true, "3", ""))).toBe("/app/project/p1")
  })

  it("opens the project for an admin who may open it, and names, opens and asks nothing of one who can't", () => {
    expect(noticeHref(repaired(true))).toBe("/app/project/p1")
    expect(noticeHref(repaired(false))).toBeNull()
    for (const title of ["", "Launch"]) {
      const w = noticeWords(repaired(false, "3", title))
      expect(`${w.verb} ${w.place}`).toBe("was taken off 3 tasks in a project you can't open")
      expect(w.preview).toBe("")
    }
  })
})

// A run's moment, to whoever asked the agent (business/AIAgent notifyTriggerer):
// an Inbox notice the badge counts, about where they asked. It was a live
// activity no list held, so the badge counted an item the Inbox never showed.
describe("an agent's moment as a notice", () => {
  const moment = (kind: string, extra: Partial<NoticeItem> = {}) =>
    notice(kind, { resource_kind: "channel", resource_uuid: "c1", title: "launch", actor: undefined, agent: AGENT, data: { text: "Shipped the notes.", post_id: "p1" }, ...extra })

  it("says the agent answered, or needs them, where they asked, with its words", () => {
    const replied = noticeWords(moment("agent.replied"))
    expect(`${replied.actor?.user_name} ${replied.verb} ${replied.place}`).toBe("Release Captain replied to you in #launch")
    expect(replied.preview).toBe("Shipped the notes.")
    const blocked = noticeWords(moment("agent.blocked", { resource_kind: "conversation", resource_uuid: "g1 g2 g3", title: undefined, data: { text: "Which date?", message_id: "m1" } }))
    expect(`${blocked.verb} ${blocked.place}`).toBe("needs you in your conversation")
    expect(blocked.preview).toBe("Which date?")
    expect(noticeBadge(moment("agent.replied"))).toBe("reply")
    expect(noticeBadge(moment("agent.blocked"))).toBe("mention")
  })

  it("opens the message it answers, while its reader can open the place", () => {
    expect(noticeHref(moment("agent.replied"))).toBe("/app/channel/c1/p1")
    expect(noticeHref(moment("agent.blocked", { resource_kind: "conversation", resource_uuid: "g1", data: { message_id: "m1" } }))).toBe("/app/chat/group/g1/m1")
    expect(activityHref(item(moment("agent.replied")), "a1")).toBe("/app/channel/c1/p1")
  })

  it("names nothing, says nothing and opens nothing once they can't open the place", () => {
    const gone = moment("agent.replied", { can_open: false, title: undefined })
    const w = noticeWords(gone)
    expect(w.place).toBe("a conversation you can't open")
    expect(w.preview).toBe("")
    expect(noticeHref(gone)).toBeNull()
    expect(noticeHref({ ...gone, resource_kind: "conversation" })).toBeNull()
  })
})

// Notif head A: a mention in a task's words or its comments, or in a channel's
// or a conversation's message (one an edit adds), and a comment on a task, are
// NOTICE items. Each says who, what and where, and opens where it happened.
describe("a mention in a task or a message, and a comment on a task", () => {
  const onTask = (kind: string, extra: Partial<NoticeItem> = {}) =>
    notice(kind, { resource_kind: "task", resource_uuid: "t1", title: "Launch plan", ...extra })
  const inChannel = (extra: Partial<NoticeItem> = {}) =>
    notice("message.mentioned", { resource_kind: "channel", resource_uuid: "c1", title: "launch", data: { post_id: "p1" }, ...extra })
  const inChat = (extra: Partial<NoticeItem> = {}) =>
    notice("message.mentioned", { resource_kind: "conversation", resource_uuid: "g1", title: undefined, data: { message_id: "m1" }, ...extra })
  const said = (n: NoticeItem) => {
    const w = noticeWords(n)
    return `${w.actor?.user_name} ${w.verb} ${w.place}`
  }

  it("says who mentioned you in which task, in its words or in a comment, and opens the task", () => {
    expect(said(onTask("task.mentioned"))).toBe("Akash mentioned you in Launch plan")
    expect(said(onTask("task.mentioned", { data: { comment_uuid: "k1" } }))).toBe("Akash mentioned you in a comment on Launch plan")
    expect(noticeHref(onTask("task.mentioned"))).toBe("/app/task/t1")
    expect(noticeHref(onTask("task.mentioned", { data: { comment_uuid: "k1" } }))).toBe("/app/task/t1")
    expect(noticeBadge(onTask("task.mentioned"))).toBe("mention")
    const m = item(onTask("task.mentioned"))
    expect(isMention(m)).toBe(true)
    expect(kindOf(m)).toBe("mention")
    expect(sentenceOf(m)).toMatchObject({ verb: "mentioned you in", place: "Launch plan" })
    expect(activityHref(m, "a1")).toBe("/app/task/t1")
  })

  it("says who mentioned you in which channel or conversation, and opens the message", () => {
    expect(said(inChannel())).toBe("Akash mentioned you in #launch")
    expect(said(inChannel({ data: { post_id: "p1", comment_uuid: "k2" } }))).toBe("Akash mentioned you in #launch")
    expect(said(inChat())).toBe("Akash mentioned you in your conversation")
    expect(noticeHref(inChannel())).toBe("/app/channel/c1/p1")
    expect(noticeHref(inChannel({ data: { post_id: "p1", comment_uuid: "k2" } }))).toBe("/app/channel/c1/p1")
    expect(noticeHref(inChat())).toBe("/app/chat/group/g1/m1")
    expect(noticeHref(inChat({ resource_uuid: "a1 b2" }), "a1")).toBe("/app/chat/b2/m1")
    expect(noticeBadge(inChannel())).toBe("mention")
    expect(noticeBadge(inChat())).toBe("mention")
    expect(isMention(item(inChannel()))).toBe(true)
    expect(isMention(item(inChat()))).toBe(true)
    expect(activityHref(item(inChannel()), "a1")).toBe("/app/channel/c1/p1")
  })

  it("says who commented on which task, and opens it", () => {
    const n = onTask("task.commented", { data: { comment_uuid: "k3" } })
    expect(said(n)).toBe("Akash commented on Launch plan")
    expect(noticeHref(n)).toBe("/app/task/t1")
    expect(noticeBadge(n)).toBe("comment")
    expect(isMention(item(n))).toBe(false)
  })

  it("says a mention in a doc's comment is in a comment, and opens that comment", () => {
    const n = notice("doc.mentioned", { data: { comment_uuid: "k 4" } })
    expect(said(n)).toBe("Akash mentioned you in a comment on Launch notes")
    expect(noticeHref(n)).toBe("/app/doc/d1/comment?comment=k%204")
    expect(said(notice("doc.mentioned"))).toBe("Akash mentioned you in Launch notes")
    expect(noticeHref(notice("doc.mentioned"))).toBe("/app/doc/d1")
  })

  it("names and opens nothing its reader can't open now", () => {
    for (const kind of ["task.mentioned", "task.commented"]) {
      const gone = onTask(kind, { can_open: false, title: undefined, data: { comment_uuid: "k1" } })
      expect(noticeWords(gone).place).toBe(UNOPENED_PLACE)
      expect(noticeHref(gone)).toBeNull()
    }
    for (const gone of [inChannel({ can_open: false, title: undefined }), inChat({ can_open: false })]) {
      expect(noticeWords(gone).place).toBe("a conversation you can't open")
      expect(noticeHref(gone, "a1")).toBeNull()
    }
    const doc = notice("doc.mentioned", { can_open: false, title: undefined, data: { comment_uuid: "k4" } })
    expect(noticeWords(doc).place).toBe(UNOPENED_PLACE)
    expect(noticeHref(doc)).toBeNull()
  })
})

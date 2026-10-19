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

import { describe, expect, it } from "vitest"

import type { NoticeItem, UnifiedActivityItem } from "@/types/activity"
import { noticeBadge, noticeHref, noticeWords } from "./notice"
import { sentenceOf } from "./notification"
import { pinTestClock } from "@/lib/testing/testClock"

// The reader's day: Thu 15 Oct 2026, 10:00.
pinTestClock(new Date(2026, 9, 15, 10))

const AKASH = { user_uuid: "a1", user_name: "Akash", user_profile_object_key: "" }

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

// Calendar A2: a guest hears they're asked, asked again, of a change and of
// a cancellation; the organiser hears each answer.
describe("a calendar notice", () => {
  const at = { start: new Date(2026, 9, 20, 14).toISOString(), end: new Date(2026, 9, 20, 15).toISOString() }
  const ev = (kind: string, data: Record<string, string> = {}, extra: Partial<NoticeItem> = {}) =>
    notice(kind, { resource_kind: "event", resource_uuid: "0b8a3c1e-1d2f-4a5b-8c7d-9e0f1a2b3c4d", title: "Launch review", reason: "guest", data: { ...at, ...data }, ...extra })

  it("invites by the event's name, with when it is, and opens the event", () => {
    const w = noticeWords(ev("calendar.invited"))
    expect(`${w.verb} ${w.place}`).toBe("invited you to Launch review")
    expect(w.preview).toMatch(/^Tue 20 Oct, 2:00\sPM – 3:00\sPM$/)
    expect(noticeBadge(ev("calendar.invited"))).toBe("invite")
    expect(noticeHref(ev("calendar.invited"))).toBe("/app/calendar/event/0b8a3c1e-1d2f-4a5b-8c7d-9e0f1a2b3c4d")
  })

  it("asks again, and says what changed, opening the instance it is about", () => {
    expect(noticeWords(ev("calendar.invited", { again: "true" })).verb).toBe("is waiting for your answer to")
    const moved = ev("calendar.updated", { changed: "time,notes", instance: "0b8a3c1e-1d2f-4a5b-8c7d-9e0f1a2b3c4d_20261020T130000Z" })
    expect(noticeWords(moved).preview).toMatch(/^New time: Tue 20 Oct/)
    expect(noticeWords(ev("calendar.updated", { changed: "location" })).preview).toBe("It's somewhere new.")
    expect(noticeHref(moved)).toBe("/app/calendar/event/0b8a3c1e-1d2f-4a5b-8c7d-9e0f1a2b3c4d_20261020T130000Z")
  })

  it("names a cancelled event by its day when it can't be opened, and opens that day", () => {
    const gone = ev("calendar.cancelled", {}, { title: undefined, can_open: false })
    const w = noticeWords(gone)
    expect(`${w.verb} ${w.place}`).toMatch(/^cancelled an event on Tue 20 Oct, 2:00\sPM – 3:00\sPM$/)
    expect(noticeHref(gone)).toBe("/app/calendar?date=2026-10-20")
    expect(sentenceOf(item(gone)).place).not.toMatch(/a page you can't open/)
  })

  it("tells the organiser each answer, with its note, from a member or a guest by email", () => {
    const yes = noticeWords(ev("calendar.rsvp", { response: "accepted", note: "Ten minutes late" }, { reason: "organiser" }))
    expect(`${yes.actor?.user_name} ${yes.verb} ${yes.place}`).toBe("Akash is going to Launch review")
    expect(yes.preview).toBe("“Ten minutes late”")
    const guest = noticeWords(ev("calendar.rsvp", { response: "declined", guest_name: "Alex Kim", guest_email: "alex@example.com" }, { actor: undefined }))
    expect(`${guest.actor?.user_name} ${guest.verb}`).toBe("Alex Kim can't go to")
    expect(noticeBadge(ev("calendar.rsvp"))).toBe("reply")
  })

  // Calendar head 4: an answer that proposes another time says so, and when.
  it("tells the organiser of another time proposed, on their own clock, then the note", () => {
    const p = { proposed_start: new Date(2026, 9, 21, 9).toISOString(), proposed_end: new Date(2026, 9, 21, 9, 45).toISOString() }
    const member = noticeWords(ev("calendar.rsvp", { response: "tentative", ...p }, { reason: "organiser" }))
    expect(`${member.actor?.user_name} ${member.verb} ${member.place}`).toBe("Akash proposed a new time for Launch review")
    expect(member.preview).toMatch(/^Wed 21 Oct, 9:00\sAM – 9:45\sAM$/)
    const guest = noticeWords(ev("calendar.rsvp", { response: "declined", note: "On a flight then", guest_name: "Alex Kim", guest_email: "alex@example.com", ...p }, { actor: undefined }))
    expect(`${guest.actor?.user_name} ${guest.verb}`).toBe("Alex Kim proposed a new time for")
    expect(guest.preview).toMatch(/^Wed 21 Oct, 9:00\sAM – 9:45\sAM · “On a flight then”$/)
  })

  it("says an all-day event's dates as they are", () => {
    const day = ev("calendar.invited", { all_day: "true", date: "2026-10-26", end_date: "2026-10-28", start: "", end: "" })
    expect(noticeWords(day).preview).toBe("Mon 26 Oct – Tue 27 Oct")
  })
})


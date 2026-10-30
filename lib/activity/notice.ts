/**
 * Inbox notices in words (docs programme A6): the API's NOTICE items, a kind
 * at a time. Pure, so each kind is tested without rendering.
 *
 * A notice names its doc only when its reader can open it now; otherwise the
 * place is "a page you can't open", and the row opens nothing.
 */
import type { NoticeItem, UnifiedActivityItem } from "@/types/activity"
import type { UserProfileDataInterface } from "@/types/user"
import type { KindBadgeKind } from "@/components/ui/kindBadge"
import { format } from "date-fns"
import { dayAndTime } from "@/lib/utils/date/clock"
import { calendarRoute } from "@/lib/calendar/route"
import { tablePath } from "@/lib/tables/route"
import { count } from "@/lib/utils/count"

/** The place a notice names when its reader can't open the page now. */
export const UNOPENED_PLACE = "a page you can't open"

/** How a notice reads: who, what they did, where, and a line under it. */
interface NoticeWords {
  actor: UserProfileDataInterface | undefined
  verb: string
  place: string
  preview: string
}

const LEVEL_LINE: Record<string, string> = {
  edit: "You can edit it.",
  full: "You can edit it.",
  comment: "You can read it and comment on it.",
  view: "You can read it.",
}

/** A level in two words, for a doc in a list of shares: "Can edit", "Can comment", "Can view". Pure. */
export function levelWord(level: string | undefined): string {
  if (level === "edit" || level === "full") return "Can edit"
  if (level === "comment") return "Can comment"
  return "Can view"
}

/** What someone asks to do at a level: "asked to edit", "asked to comment on". */
const ASK_VERB: Record<string, string> = {
  view: "view",
  comment: "comment on",
  edit: "edit",
}

const DECIDED: Record<string, string> = {
  "doc.proposal.accepted": "accepted",
  "doc.proposal.declined": "declined",
  "doc.proposal.withdrawn": "withdrew",
}

/** The person a notice is about, as its data names them: someone a mention didn't reach, someone taken off work. */
function personNamed(n: NoticeItem): UserProfileDataInterface | undefined {
  return n.data?.person ? ({ user_uuid: n.data.person, user_name: n.data.person_name ?? "" } as UserProfileDataInterface) : undefined
}

/** A notice in words. */
export function noticeWords(n: NoticeItem): NoticeWords {
  const place = n.can_open && n.title ? n.title : n.can_open ? "Untitled" : UNOPENED_PLACE
  // An agent's work is the agent's sentence; the person who asked it shows in its badge.
  const actor = n.agent ?? n.actor
  switch (n.kind) {
    case "doc.mentioned":
      return { actor, verb: "mentioned you in", place, preview: "" }
    // A comment on a table's row (business/TableComments): the place is the
    // row in its table, "Acme in Deals".
    case "table_row.mentioned":
      return { actor, verb: "mentioned you on", place, preview: "" }
    case "table_row.mention.unshared":
      return {
        actor: personNamed(n),
        verb: "can't open",
        place,
        preview: "You mentioned them, but the table isn't shared with them, so they weren't told.",
      }
    case "doc.comment.created":
      return { actor, verb: "commented on", place, preview: "" }
    case "doc.shared":
      return { actor, verb: "shared", place, preview: `With you. ${LEVEL_LINE[n.data?.level ?? ""] ?? LEVEL_LINE.view}` }
    case "doc.proposal.created":
      return { actor, verb: "proposed a change to", place, preview: "Review it to accept or decline it." }
    case "thread.replied":
      return { actor, verb: "replied in a thread on", place, preview: "" }
    case "thread.resolved":
      return { actor, verb: "resolved a thread on", place, preview: "" }
    case "thread.reopened":
      return { actor, verb: "reopened a thread on", place, preview: "" }
    // Someone outside the workspace booked, or cancelled, a time on one of the
    // reader's booking pages (CAL-BUG-5): it reached them only by email.
    case "booking.created":
    case "booking.cancelled": {
      const guest = n.data?.guest_name ? ({ user_uuid: "", user_name: n.data.guest_name } as UserProfileDataInterface) : undefined
      return {
        actor: guest,
        verb: n.kind === "booking.created" ? "booked" : "cancelled",
        place: n.data?.page_title || "your booking page",
        preview: bookingWhen(n.data?.starts_at, n.data?.ends_at),
      }
    }
    // An event's guests hear of it (calendar A2): asked, asked again, a
    // change to it, and it cancelled. Its organiser hears of each answer.
    case "calendar.invited":
    case "calendar.updated":
    case "calendar.cancelled":
    case "calendar.rsvp":
      return calendarWords(n, actor)
    // A project's rule told its reader about a task (package 9). A rule has
    // no face: the sentence is the rule's, the task its place.
    case "work.rule":
      return { actor: undefined, verb: "A rule asks you to look at", place, preview: "" }
    // Approvals (package 9 R2): asked to approve a move, and how one ended.
    case "work.approval.requested":
      return { actor, verb: "asks you to approve", place, preview: "" }
    case "work.approval.decided": {
      const said: Record<string, string> = { approved: "approved", changes: "asked for changes to", rejected: "rejected" }
      return { actor, verb: said[n.data?.state ?? ""] ?? "answered", place, preview: "" }
    }
    case "work.rule.paused":
      return { actor: undefined, verb: "Your rule stopped itself:", place, preview: "It ran too often. Check it, then turn it back on." }
    // Taken off an event's guest list (CAL-BUG-1). The event is never named:
    // its reader can't open it any more.
    case "event.uninvited":
      return { actor, verb: "took you off", place: n.data?.start ? `an event on ${bookingWhen(n.data.start)}` : "an event", preview: "It's no longer on your calendar." }
    case "doc.access_requested":
      // To the people who can answer it: they can open the page, so it's named.
      return { actor, verb: `asked to ${ASK_VERB[n.data?.level ?? ""] ?? "view"}`, place, preview: "Approve or decline it from Share, on the page." }
    case "doc.access_answered": {
      // To whoever asked. Who declined is never said, and a page they can't
      // open stays "a page you can't open" (place), as the server sends it.
      if (n.data?.status === "approved") {
        return { actor, verb: "approved your request for", place, preview: n.can_open ? (LEVEL_LINE[n.data?.level ?? ""] ?? "") : "" }
      }
      return {
        actor: undefined,
        verb: `declined your request to ${ASK_VERB[n.data?.level ?? ""] ?? "view"}`,
        place,
        preview: "You can ask again, with a note that says why you need it.",
      }
    }
    case "member.left_work":
      // The server says the work in words ("3 docs and 2 links").
      return {
        actor: { user_uuid: n.resource_uuid, user_name: n.can_open && n.title ? n.title : "Someone who left" } as UserProfileDataInterface,
        verb: "left with",
        place: `${n.data?.work || "work"} under their name`,
        preview: "Hand them on, or turn their links off, in Settings under Docs.",
      }
    case "doc.mention.unshared":
      // Asked of whoever wrote the mention: the person they mentioned can't open the page.
      return {
        actor: personNamed(n),
        verb: "can't open",
        place,
        preview: "You mentioned them, but the page isn't shared with them, so they weren't told. Share it to let them see it.",
      }
    // To a project's admins, once per person: an upgrade took them off tasks
    // the assign rule wouldn't give them now. The tasks are counted, never
    // named; the line under it is for a reader who can open the project.
    case "project.assignees_repaired":
      return {
        actor: personNamed(n),
        verb: `was taken off ${count(Number(n.data?.tasks) || 0, "task", "tasks")} in`,
        place: n.can_open ? n.title || "Untitled" : "a project you can't open",
        preview: n.can_open
          ? "To give them the tasks back, add them to the project or let them into the tasks, then assign them again."
          : "",
      }
  }
  const decided = DECIDED[n.kind]
  if (decided) {
    const whose = n.data?.author_kind === "agent" ? "the change proposed for you to" : "your proposed change to"
    return { actor, verb: `${decided} ${whose}`, place, preview: "" }
  }
  return { actor, verb: "changed", place, preview: "" }
}

/** The badge a notice carries before an agent's or an app's takes over. */
export function noticeBadge(n: NoticeItem | undefined): KindBadgeKind {
  switch (n?.kind) {
    case "doc.mentioned":
    case "doc.mention.unshared":
    case "table_row.mentioned":
    case "table_row.mention.unshared":
      return "mention"
    case "doc.shared":
    case "booking.created":
    case "calendar.invited":
    case "doc.access_requested":
    case "doc.access_answered":
      return "invite"
    case "doc.proposal.accepted":
    case "doc.proposal.declined":
    case "doc.proposal.withdrawn":
    case "thread.replied":
    case "thread.resolved":
    case "thread.reopened":
    case "calendar.rsvp":
      return "reply"
  }
  return "comment"
}

/**
 * Where a notice opens: its doc, for a reader who can open it; a booking's
 * meeting, or the calendar once it's cancelled. One about a thread opens that
 * thread, one about a comment the thread it is in (B7: the doc's comments
 * page, which on a wider screen is the doc with its panel).
 */
export function noticeHref(n: NoticeItem | undefined): string | null {
  if (n?.resource_kind === "departed_member") return n.can_open ? "/app/admin?tab=docs#docs-departed" : null
  if (n?.resource_kind === "event") {
    if (n.kind === "booking.created") return calendarRoute({ event: n.resource_uuid })
    // An event its guest or organiser can still open opens: the instance a
    // notice is about, else the event. A cancelled one shows its day.
    if (n.kind.startsWith("calendar.") && n.kind !== "calendar.cancelled") {
      return n.can_open ? calendarRoute({ event: n.data?.instance || n.resource_uuid }) : null
    }
    if (n.kind === "calendar.cancelled") return calendarRoute(dayOf(n) ? { date: dayOf(n)! } : {})
    // A cancelled booking's meeting is gone; an event you were taken off isn't yours to open.
    return n.kind === "booking.cancelled" ? calendarRoute() : null
  }
  // A rule's notice opens its task; a stopped rule, its project's Rules.
  if (n?.resource_kind === "task") return n.can_open && n.resource_uuid ? `/app/task/${n.resource_uuid}` : null
  // One about a project's people opens the project.
  if (n?.resource_kind === "project") return n.can_open && n.resource_uuid ? `/app/project/${n.resource_uuid}` : null
  if (n?.resource_kind === "rule") {
    const project = n.data?.project_id
    return n.can_open && project ? `/app/project/${project}?tool=rules` : n.can_open ? "/app/settings/workflows" : null
  }
  // A table's row opens in its table, at the thread when there is one.
  if (n?.resource_kind === "table_row") {
    const table = n.data?.table_id
    if (!n.can_open || !table || !n.resource_uuid) return null
    return tablePath(table, { row: n.resource_uuid, thread: n.data?.thread_id || undefined })
  }
  if (!n?.can_open || n.resource_kind !== "doc" || !n.resource_uuid) return null
  const doc = `/app/doc/${n.resource_uuid}`
  if (n.kind.startsWith("thread.")) {
    return n.data?.thread_id ? `${doc}/comment/${encodeURIComponent(n.data.thread_id)}` : `${doc}/comment`
  }
  if (n.kind === "doc.comment.created") {
    const comment = n.data?.comment_uuid || n.data?.comment_id
    return comment ? `${doc}/comment?comment=${encodeURIComponent(comment)}` : `${doc}/comment`
  }
  return doc
}

/** Whether an inbox item is a mention of its reader, of any kind. */
export function isMention(item: UnifiedActivityItem): boolean {
  return (
    item.activity_type === "MENTION" ||
    (item.activity_type === "NOTICE" && (item.notice?.kind === "doc.mentioned" || item.notice?.kind === "table_row.mentioned"))
  )
}

/** What a guest's answer says of them, as a sentence: "is going to". */
const ANSWERED: Record<string, string> = {
  accepted: "is going to",
  tentative: "might go to",
  declined: "can't go to",
}

/** What changed, in a few words: "New time: Tue 21 Oct, 10:00 – 11:00". */
function changeLine(n: NoticeItem): string {
  const changed = (n.data?.changed ?? "").split(",").filter(Boolean)
  if (changed.includes("time")) return `New time: ${eventWhen(n)}`
  const words: Record<string, string> = { title: "It has a new name.", location: "It's somewhere new.", notes: "Its notes changed.", recurrence: "How it repeats changed." }
  return changed.map((c) => words[c]).filter(Boolean)[0] ?? eventWhen(n)
}

/** A calendar notice in words: the event by its title when its reader can open it, else by its day. */
function calendarWords(n: NoticeItem, actor: UserProfileDataInterface | undefined): NoticeWords {
  const when = eventWhen(n)
  const place = n.can_open && n.title ? n.title : when ? `an event on ${when}` : "an event"
  switch (n.kind) {
    case "calendar.invited":
      return n.data?.again === "true"
        ? { actor, verb: "is waiting for your answer to", place, preview: when }
        : { actor, verb: "invited you to", place, preview: when }
    case "calendar.updated":
      return { actor, verb: "changed", place, preview: changeLine(n) }
    case "calendar.cancelled":
      return { actor, verb: "cancelled", place, preview: "It's no longer on your calendar." }
  }
  // An answer, to the organiser: from a member, or from a guest invited by
  // email; with another time it proposes (calendar head 4), that time on the
  // reader's own clock, then the note.
  const guest = !n.actor && n.data?.guest_name ? ({ user_uuid: "", user_name: n.data.guest_name } as UserProfileDataInterface) : undefined
  const note = n.data?.note ? `“${n.data.note}”` : ""
  const proposed = bookingWhen(n.data?.proposed_start, n.data?.proposed_end)
  if (proposed) return { actor: actor ?? guest, verb: "proposed a new time for", place, preview: note ? `${proposed} · ${note}` : proposed }
  return { actor: actor ?? guest, verb: ANSWERED[n.data?.response ?? ""] ?? "answered", place, preview: note || when }
}

/** An event notice's time on the reader's own clock, or its dates for an all-day one. */
function eventWhen(n: NoticeItem): string {
  if (n.data?.all_day === "true" && n.data.date) {
    // Dates, in no zone: the end is the day after the last, counted in days.
    const day = (d: string, back = 0) => {
      const [y, m, dd] = d.split("-").map(Number)
      return new Date(y, (m || 1) - 1, (dd || 1) - back)
    }
    const first = day(n.data.date)
    const last = n.data.end_date ? day(n.data.end_date, 1) : first
    return last > first ? `${format(first, "EEE d MMM")} – ${format(last, "EEE d MMM")}` : format(first, "EEE d MMM")
  }
  return bookingWhen(n.data?.start, n.data?.end)
}

/** The day an event notice is about, for the calendar to open on. */
function dayOf(n: NoticeItem): Date | null {
  const raw = n.data?.date ? `${n.data.date}T12:00:00` : n.data?.start
  const d = raw ? new Date(raw) : null
  return d && !Number.isNaN(d.getTime()) ? d : null
}

/** "Tue 14 Oct, 10:00 – 10:30": a meeting's time on the reader's own clock; "" without one. */
function bookingWhen(starts?: string, ends?: string): string {
  const start = starts ? new Date(starts) : null
  if (!start || Number.isNaN(start.getTime())) return ""
  const end = ends ? new Date(ends) : null
  return dayAndTime(start, end ?? undefined)
}

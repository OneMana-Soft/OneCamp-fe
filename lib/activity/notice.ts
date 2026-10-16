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
import { dayAndTime } from "@/lib/utils/date/clock"
import { calendarRoute } from "@/lib/calendar/route"

/** The place a notice names when its reader can't open the page now. */
export const UNOPENED_PLACE = "a page you can't open"

/** How a notice reads: who, what they did, where, and a line under it. */
export interface NoticeWords {
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

/** A notice in words. */
export function noticeWords(n: NoticeItem): NoticeWords {
  const place = n.can_open && n.title ? n.title : n.can_open ? "Untitled" : UNOPENED_PLACE
  // An agent's work is the agent's sentence; the person who asked it shows in its badge.
  const actor = n.agent ?? n.actor
  switch (n.kind) {
    case "doc.mentioned":
      return { actor, verb: "mentioned you in", place, preview: "" }
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
    case "doc.mention.unshared": {
      // Asked of whoever wrote the mention: the person they mentioned can't open the page.
      const person = n.data?.person
        ? ({ user_uuid: n.data.person, user_name: n.data.person_name ?? "" } as UserProfileDataInterface)
        : undefined
      return {
        actor: person,
        verb: "can't open",
        place,
        preview: "You mentioned them, but the page isn't shared with them, so they weren't told. Share it to let them see it.",
      }
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
      return "mention"
    case "doc.shared":
    case "booking.created":
    case "doc.access_requested":
    case "doc.access_answered":
      return "invite"
    case "doc.proposal.accepted":
    case "doc.proposal.declined":
    case "doc.proposal.withdrawn":
    case "thread.replied":
    case "thread.resolved":
    case "thread.reopened":
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
  if (n?.resource_kind === "event") {
    if (n.kind === "booking.created") return calendarRoute({ event: n.resource_uuid })
    // A cancelled booking's meeting is gone; an event you were taken off isn't yours to open.
    return n.kind === "booking.cancelled" ? calendarRoute() : null
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
  return item.activity_type === "MENTION" || (item.activity_type === "NOTICE" && item.notice?.kind === "doc.mentioned")
}

/** "Tue 14 Oct, 10:00 – 10:30": a meeting's time on the reader's own clock; "" without one. */
function bookingWhen(starts?: string, ends?: string): string {
  const start = starts ? new Date(starts) : null
  if (!start || Number.isNaN(start.getTime())) return ""
  const end = ends ? new Date(ends) : null
  return dayAndTime(start, end ?? undefined)
}

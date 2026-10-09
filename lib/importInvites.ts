// Inviting the people an import brought across: the words and the choices the
// invite dialog, the admin banner and a placeholder's profile share. Pure.

import type { EmailRoom, ImportPeople, InvitablePerson, InviteRun, SeatRoom } from "@/services/importService"

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

/**
 * Whether an address on a placeholder was made up by an import or an
 * integration rather than being the person's own. Mirrors the server's
 * business/Import IsPlaceholderEmail: an invitation to such an address could
 * never be accepted.
 */
export function isPlaceholderEmail(email?: string | null): boolean {
  const e = (email ?? "").trim().toLowerCase()
  const at = e.lastIndexOf("@")
  if (at <= 0 || at === e.length - 1) return true
  const local = e.slice(0, at)
  const domain = e.slice(at + 1)
  if (domain === "no-reply.local" || domain.startsWith("external.onecamp.")) return true
  return local.includes("+x-") || local.includes("+slack-")
}

/** Above this many people, nobody is ticked to begin with: a whole site's accounts are not a team to invite at a click. */
export const MANY_TO_INVITE = 50

/**
 * As many as the plan has room for and, under a daily email allowance, as
 * many as can be emailed today. More can still be ticked; they get a link to
 * share instead.
 */
export function roomSelection(people: InvitablePerson[], seats: SeatRoom, email?: EmailRoom): Set<string> {
  const seatRoom = seats.left === null ? people.length : Math.max(0, seats.left)
  const mailRoom = email?.on && email.left !== null ? Math.max(0, email.left) : people.length
  return new Set(people.slice(0, Math.min(seatRoom, mailRoom)).map((p) => p.user_id))
}

/** Who is ticked when the dialog opens: as many as there is room for, or nobody in a long list. */
export function initialSelection(people: InvitablePerson[], seats: SeatRoom, email?: EmailRoom): Set<string> {
  return people.length > MANY_TO_INVITE ? new Set() : roomSelection(people, seats, email)
}

const LINKS = "Admin → Invitations"

/** How many of the people ticked get an email, in a sentence, or null when all do and nothing limits it. */
export function emailLine(email: EmailRoom | undefined, selected: number): string | null {
  if (!email) return null
  if (!email.on) return `Email isn't set up on this server, so nobody gets an email: copy their links from ${LINKS}.`
  if (email.left === null) return null
  if (email.left === 0) {
    return `Today's invitation emails are used up, so nobody you invite now gets one: copy their links from ${LINKS}, or invite them tomorrow.`
  }
  if (selected <= email.left) {
    return `Each person ticked gets an email (${plural(email.left, "more invitation email", "more invitation emails")} can go out today).`
  }
  return `Only ${email.left} can be emailed today, so ${plural(selected - email.left, "person", "people")} ticked won't get one: copy their links from ${LINKS}.`
}

/** Whether one more person can be ticked without going past the plan's room. */
export function roomForAnother(selected: number, seats: SeatRoom): boolean {
  return seats.left === null || selected < seats.left
}

/** The plan's room in a sentence, or null when there is no limit. */
export function seatLine(seats: SeatRoom): string | null {
  if (seats.left === null || !seats.limit) return null
  if (seats.left === 0) {
    return `Your free plan is full: all ${seats.limit} places are taken, so nobody can be invited until someone is deactivated or the limit is removed.`
  }
  return `Your free plan has room for ${plural(seats.left, "more person", "more people")} (${seats.used} of ${seats.limit} places taken).`
}

/** Why the rest of the people who came across aren't listed, or "" when they all are. */
export function notListedLine(p: Pick<ImportPeople, "already_members" | "already_invited" | "no_email" | "left">): string {
  const parts: string[] = []
  if (p.already_members) parts.push(`${p.already_members} already here`)
  if (p.already_invited) parts.push(`${p.already_invited} already invited`)
  if (p.no_email) parts.push(`${p.no_email} without an email address`)
  if (p.left) parts.push(`${p.left} who had left`)
  if (!parts.length) return ""
  return `Not listed: ${parts.join(", ")}.`
}

/** What a finished run of invitations says, a line at a time. */
export function inviteSummary(run: InviteRun, email?: EmailRoom): string[] {
  const lines: string[] = []
  const invited = run.invited.length
  const unsent = run.notEmailed.length
  if (invited && !unsent) {
    lines.push(`Invited ${plural(invited, "person", "people")}. Each gets an email with a link to join.`)
  } else if (invited && email && !email.on) {
    lines.push(`Invited ${plural(invited, "person", "people")}. Email isn't set up on this server, so nothing was sent: copy their links from ${LINKS}.`)
  } else if (invited && unsent === invited) {
    lines.push(`Invited ${plural(invited, "person", "people")}, but no email went out: copy their links from ${LINKS}.`)
  } else if (invited) {
    lines.push(
      `Invited ${plural(invited, "person", "people")}. ${invited - unsent} got an email; the other ${unsent} didn't, so copy their links from ${LINKS}.`,
    )
  }
  if (run.alreadyInvited.length) {
    lines.push(`${plural(run.alreadyInvited.length, "person was", "people were")} already invited.`)
  }
  if (run.seatLimit) {
    lines.push(`${run.seatLimit.msg} ${plural(run.seatLimit.notInvited.length, "person wasn't", "people weren't")} invited.`)
  }
  for (const f of run.failed) {
    lines.push(`Couldn't invite ${f.person.name} (${f.person.email}): ${f.msg}`)
  }
  return lines
}

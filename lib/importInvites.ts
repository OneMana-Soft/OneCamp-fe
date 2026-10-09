// Inviting the people an import brought across: the words and the choices the
// invite dialog, the admin banner and a placeholder's profile share. Pure.

import type { ImportPeople, InvitablePerson, InviteRun, SeatRoom } from "@/services/importService"

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

/** Who is ticked when the dialog opens: everyone, or as many as the plan has room for. */
export function initialSelection(people: InvitablePerson[], seats: SeatRoom): Set<string> {
  const room = seats.left === null ? people.length : Math.max(0, seats.left)
  return new Set(people.slice(0, room).map((p) => p.user_id))
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
export function inviteSummary(run: InviteRun): string[] {
  const lines: string[] = []
  if (run.invited.length) {
    lines.push(
      run.emailSent
        ? `Invited ${plural(run.invited.length, "person", "people")}. Each gets an email with a link to join.`
        : `Invited ${plural(run.invited.length, "person", "people")}. Email isn't set up on this server, so nothing was sent: copy their links from Admin, Invitations.`,
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

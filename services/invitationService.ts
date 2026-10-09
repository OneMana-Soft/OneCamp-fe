// Inviting someone, and what the server said about it.
//
// The dialogs show a refusal where the admin is looking: inviting someone who
// is already a member, or someone whose invitation is still live, is refused
// in words that say what to do instead. So these calls opt out of the global
// error toast and hand the words back.

import axiosInstance, { OWN_ERRORS } from "@/lib/axiosInstance"
import { PostEndpointUrl } from "@/services/endPoints"

/** What the server answers when an invitation is made or sent again. */
export interface InvitationAnswer {
  /** The link the invitation carries, for the admin to hand over themselves. */
  invite_link?: string
  /** Whether the email provider took the email. */
  email_sent?: boolean
  /**
   * Why it didn't, when it didn't: a phrase that follows "Couldn't email it: "
   * ("email isn't set up on this server").
   */
  email_error?: string
  msg?: string
}

export type InviteOutcome =
  | { ok: true; answer: InvitationAnswer }
  | { ok: false; msg: string }

/** The server's reason for a failure, or a plain one when there is none to read. */
function reason(err: unknown): string {
  const msg = (err as { response?: { data?: { msg?: unknown } } })?.response?.data?.msg
  if (typeof msg === "string" && msg) return msg
  return "Couldn't send the invitation. Check your connection and try again."
}

async function post(endpoint: PostEndpointUrl, email: string): Promise<InviteOutcome> {
  try {
    const res = await axiosInstance.post(endpoint, { email }, OWN_ERRORS)
    return { ok: true, answer: (res.data ?? {}) as InvitationAnswer }
  } catch (err) {
    return { ok: false, msg: reason(err) }
  }
}

/**
 * Invites someone. `asAdmin` uses the admin route; members whom an admin has
 * let invite people use their own.
 */
export function invite(email: string, asAdmin: boolean): Promise<InviteOutcome> {
  return post(asAdmin ? PostEndpointUrl.AddInvitation : PostEndpointUrl.CreateInvitation, email.trim().toLowerCase())
}

/** Sends an invitation again with a new link; the old link stops working. */
export function resendInvitation(email: string): Promise<InviteOutcome> {
  return post(PostEndpointUrl.ResendInvitation, email)
}

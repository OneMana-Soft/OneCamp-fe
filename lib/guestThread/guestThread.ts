/**
 * A doc's conversation with its guests, for its team, and the doc's client
 * verdict (docs C5-2). The server keeps a reply to a guest to the guest's own
 * limits and names its member "<name> from <workspace>", never by address.
 */

import axiosInstance, { OWN_ERRORS } from "@/lib/axiosInstance"

export interface GuestThreadComment {
  id: string
  guest_name: string
  body: string
  created_at: string
  /** The guest comment a team member's reply answers. */
  parent_id?: string
  /** A team member's reply, which the guest sees. */
  from_team?: boolean
  /** One guest on one link, the same on every comment. */
  author_id: string
}

export interface GuestThread {
  comments: GuestThreadComment[]
  can_reply: boolean
  can_moderate: boolean
}

export interface DocVerdict {
  decision: "approved" | "changes"
  name: string
  note?: string
  created_at: string
}

export const guestThreadKey = (docId: string) => `/doc/guest-thread?doc_uuid=${encodeURIComponent(docId)}`
export const docVerdictKey = (docId: string) => `/doc/client-review?doc_uuid=${encodeURIComponent(docId)}`

export async function replyToGuest(docId: string, parentId: string, body: string): Promise<GuestThreadComment> {
  const res = await axiosInstance.post(`/doc/guest-thread/reply`, { doc_uuid: docId, parent_id: parentId, body }, OWN_ERRORS)
  return res.data.data as GuestThreadComment
}

export async function removeGuestComment(docId: string, commentId: string): Promise<void> {
  await axiosInstance.post(`/doc/guest-thread/remove`, { doc_uuid: docId, comment_id: commentId }, OWN_ERRORS)
}

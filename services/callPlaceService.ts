// Where a table's linked call opens (airtable-01). The tables page loads this
// as a chunk of its own (lazyChunk, on a call chip's click) and hands the
// cells its opener (CellContext.openCall), so no cell and no table's first
// screen carries the router, the Link Router or the profile cache.

import axiosInstance, { OWN_ERRORS } from "@/lib/axiosInstance"
import { cachedData } from "@/lib/swrMutate"
import { loadFailure } from "@/lib/http/loadFailure"
import { chatRef, route } from "@/lib/conversation/route"
import { GetEndpointUrl } from "@/services/endPoints"
import { toast } from "@/hooks/use-toast"

/**
 * Where a linked call opens, read from GET /calls/{id}: its huddle post in its
 * channel when it has one, else its conversation (a channel, a DM with the
 * other person, a group), by the Link Router. A call with nowhere to go (an
 * instant meeting has no conversation; a call gone, or no longer the reader's
 * to open) gives the words that say so instead: never a dead link. Throws a
 * read that failed (Try again can fix it).
 */
export async function callHref(id: string): Promise<{ href: string } | { none: string }> {
  let session: { resource?: { kind?: string; id?: string }; post_uuid?: string } | null | undefined
  try {
    const res = await axiosInstance.get(`/calls/${encodeURIComponent(id)}`, OWN_ERRORS)
    session = res?.data?.data?.session
  } catch (e) {
    if (loadFailure(e) === "failed") throw e
    session = null
  }
  const where = session?.resource
  if (!where?.id) return { none: "This call is gone, or no longer yours to open" }
  if (where.kind === "channel") return { href: route({ conversation: { kind: "channel", id: where.id }, ...(session?.post_uuid ? { message: session.post_uuid } : {}) }) }
  if (where.kind === "dm" || where.kind === "group") {
    const viewer = cachedData<{ data?: { user_uuid?: string } }>(GetEndpointUrl.SelfProfile)?.data?.user_uuid
    const conversation = chatRef(where.id, viewer)
    if (conversation) return { href: route({ conversation }) }
  }
  return { none: "This call has no conversation to open" }
}

/** Opens a linked call through the page's router (push), or says why it can't: never a dead link. */
export function openCall(id: string, push: (href: string) => void): Promise<void> {
  return callHref(id).then(
    (to) => ("href" in to ? push(to.href) : void toast({ tone: "info", title: to.none })),
    () => void toast({ tone: "error", title: "Couldn't open the call: try again" }),
  )
}

import type { ConversationKind } from "@/lib/mqtt/conversationAccess"

/**
 * One conversation a search is narrowed to (QA F-15): a channel header's
 * Search opened the whole workspace's search, with the channel lost. A
 * channel by its id, a DM by the other person's, a group by its own: the
 * same parameter for the search page's address and the server's request.
 */
export interface SearchWithin {
  kind: ConversationKind
  id: string
}

const KINDS: readonly ConversationKind[] = ["channel", "dm", "group"]

/** The search page for one conversation, from its header: "/app/search?channel=<id>". */
export function searchWithinHref(within: SearchWithin, query = ""): string {
  const q = query.trim()
  return `/app/search?${q ? `query=${encodeURIComponent(q)}&` : ""}${withinParam(within)}`
}

/** "channel=<id>", for an address or a request; "" for the whole workspace. */
export function withinParam(within: SearchWithin | null | undefined): string {
  return within ? `${within.kind}=${encodeURIComponent(within.id)}` : ""
}

/** Where an address says to search: one conversation, or nowhere in particular. */
export function readSearchWithin(params: Pick<URLSearchParams, "get">): SearchWithin | null {
  for (const kind of KINDS) {
    const id = params.get(kind)?.trim()
    if (id) return { kind, id }
  }
  return null
}

"use client"

/**
 * What was on a collaboration as this tab came: read from its awareness at the provider's first sync, and kept.
 *
 * A server sends a new connection everyone's presence ahead of its sync reply (Hocuspocus does, and the e2e's fake,
 * scripts/fluidity/fakeCollab, as it does), so at the first sync the awareness holds who was already there and what
 * their states kept. A screen drawn on the provider alone, before that sync, has seen nobody yet: what it took then
 * as already there was nothing, and what the others' states keep (a board's last reactions, raised hands, a bring)
 * read as news to someone who only just came (CODE-REVIEW-LOG row 2308). A reconnect keeps the first reading;
 * another awareness (a new provider) takes its own.
 */

import * as React from "react"

/** `read(awareness)` at this awareness's first sync, and the same value after it; null until then. */
export function useAtFirstSync<A extends object, T>(awareness: A | null | undefined, synced: boolean, read: (awareness: A) => T): T | null {
  const [first, setFirst] = React.useState<{ on: A; value: T } | null>(null)
  if (awareness && synced && first?.on !== awareness) {
    // Kept as React keeps what it learns while rendering: this render is redone at once with it.
    const taken = { on: awareness, value: read(awareness) }
    setFirst(taken)
    return taken.value
  }
  return first && first.on === awareness ? first.value : null
}

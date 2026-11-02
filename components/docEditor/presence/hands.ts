/**
 * Raised hands in Here now's queue (a board's, miro-24), from the presence store's people (presence/people reads each
 * person's hand). A leaf of its own, so what loads with the page (presence/store) carries no queue.
 */
import type { PresencePerson } from "./store"

/** A hand in the queue: whose (their user id and name), the tab that raised it, and when, by that tab's clock. */
export interface HandUp {
  id: string
  name: string
  client: number
  raisedAt: number
}

/**
 * The hands up, first raised first (ties by tab), as the faces and Here now order them: every screen orders by the
 * raisers' own times, so all of them show the same queue. Pure.
 */
export function handsUp(people: Record<string, PresencePerson> | undefined): HandUp[] {
  const out: HandUp[] = []
  for (const [id, p] of Object.entries(people ?? {})) if (p.hand) out.push({ id, name: p.name, ...p.hand })
  return out.sort((a, b) => a.raisedAt - b.raisedAt || a.client - b.client)
}

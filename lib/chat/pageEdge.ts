/**
 * Where a page of a conversation starts: the message held at its edge.
 *
 * Pages were asked for in whole seconds (the floor of the oldest message's
 * time for an older page, the ceiling of the newest's for a newer one) and
 * the server compared exactly, so a message sharing a second with the edge
 * was in neither page: a bot's burst, send-laters firing together. Now the
 * edge message itself is named, by its time as the server wrote it and its
 * id (the server's helpers.PageEdge); the whole seconds stay in the path for
 * a server from before, which reads only them.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** The query naming an edge message, or "" for one with no server id yet. */
export function pageEdgeQuery(at: string | undefined, id: string | undefined): string {
  if (!at || !id || !UUID.test(id) || Number.isNaN(Date.parse(at))) return ""
  return `?at=${encodeURIComponent(at)}&id=${encodeURIComponent(id)}`
}

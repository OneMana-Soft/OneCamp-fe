/**
 * A table's live "comments" messages, by row (business/TableComments live.go:
 * {"action": "comments", "row_id", "thread_id", "comment_id", "event"}, ids
 * alone). The table page hears them on the table's topic (useTableRows), which
 * reads the row again for its comment count; whatever shows the row's threads
 * listens here and reads them again (useRowThreads). No React, so the page and
 * the record panel share it without a context.
 */

const listeners = new Map<string, Set<() => void>>()

/** Calls fn whenever the row's threads change; answers how to stop. */
export function onRowComments(rowId: string, fn: () => void): () => void {
  let set = listeners.get(rowId)
  if (!set) {
    set = new Set()
    listeners.set(rowId, set)
  }
  set.add(fn)
  return () => {
    const now = listeners.get(rowId)
    now?.delete(fn)
    if (now && now.size === 0) listeners.delete(rowId)
  }
}

/** Tells whatever shows the row's threads that they changed. */
export function rowCommentsChanged(rowId: string): void {
  for (const fn of listeners.get(rowId) ?? []) fn()
}

/** Whether a table message is about a row's threads; its row when it is. Pure. */
export function commentsMessageRow(data: { action?: unknown; row_id?: unknown } | undefined): string | null {
  return data?.action === "comments" && typeof data.row_id === "string" && data.row_id ? data.row_id : null
}

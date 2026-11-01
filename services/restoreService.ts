/**
 * What a delete keeps for its Undo (V-78): a project's field, status, cycle,
 * milestone, form (a table's form is a form too) or link (basecamp-16), a
 * time entry, a draft invoice.
 */
export type RestoreKind = "field" | "status" | "cycle" | "milestone" | "form" | "link" | "time_entry" | "invoice"

/**
 * Brings back what a delete took: POST /restore/{kind}/{id} on the caller's
 * client, which checks the caller as the delete did. It posts quietly, as a
 * refusal is the Undo toast's to say (with Retry on a 503). readAgain reads
 * what shows it however it went: a 503 means part of it is back (a status
 * whose tasks aren't yet), which the toast's Retry finishes.
 *
 * This module imports none of the shared core (main's chunking rule, 30 Oct):
 * the lazy dialogs take it, and a lazy chunk's own import of the HTTP client
 * re-cuts every route's chunks (V-49 bisect, 30 Oct: even a named import of
 * OWN_ERRORS does). So http is the caller's client, which it already has, and
 * QUIET is OWN_ERRORS' value written here.
 */
type Http = { post: (path: string, body: object, config: { suppressErrorToast: boolean }) => Promise<unknown> }
const QUIET = { suppressErrorToast: true }

export function restore(http: Http, kind: RestoreKind, id: string, readAgain?: () => Promise<unknown>): Promise<void> {
  return restoreBy(() => http.post(`/restore/${kind}/${encodeURIComponent(id)}`, {}, QUIET), readAgain)
}

/**
 * The same, for a home with a restore route of its own, which checks the
 * caller by that home's rule (an event call's recording: by its event's, calls
 * follow-up 1). send is that request, sent quietly.
 */
export async function restoreBy(send: () => Promise<unknown>, readAgain?: () => Promise<unknown>): Promise<void> {
  try {
    await send()
  } finally {
    // The toast says the restore's own outcome: a read again that fails never
    // replaces a refusal's words, nor turns a restore that worked into one.
    await readAgain?.().catch(() => {})
  }
}

/** A delete's toast title, one way for every kind: Deleted “Launch week”, or with what it was, Deleted draft “INV-0042”. */
export const deletedTitle = (name: string, what?: string) => `Deleted ${what ? `${what} ` : ""}“${name}”`

/**
 * A delete's toast, with Undo. The toast's code loads when a delete offers it,
 * the chunk a saved setting's Undo already loads, so no page ships it first.
 */
export function offerUndo(title: string, undo: () => Promise<unknown>, description?: string): void {
  void import("@/components/ui/undoToast").then((m) => m.showUndo(title, undo, description))
}

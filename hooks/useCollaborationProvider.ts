/**
 * A live Yjs document for a view: today's shape, kept for the views that use it
 * (the doc page until it moves to useDocSession, boards, the guest viewers).
 *
 * The connection itself is the Doc Session (lib/collabSession.ts): the tab's
 * one collaboration socket, the server's decision, one copy of a doc across
 * reconnects (a tab whose copy is not the server's drops it and opens the doc
 * again, its unconfirmed edits kept aside, never merged), and a session that
 * stays live a minute after its view closes, so reopening is instant.
 */
"use client"

import * as React from 'react'
import { useCollabSession, type PresenceUser, type RecoveredEdits, type SessionStatus } from '@/lib/collabSession'

export { collabUrl } from '@/lib/collabSocket'
export { samePeople, UNAVAILABLE_REASON, type RecoveredEdits } from '@/lib/collabSession'

interface CollaborationConfig {
  enabled: boolean
  documentId: string
  /** Unused: the session fetches its own token (the Authorization cookie is HttpOnly). */
  token?: string
  /**
   * Fetches the token on every (re)connect instead of the member's own: the
   * public guest viewers trade a share link for a short-lived read-only one.
   */
  tokenFetcher?: () => Promise<string>
  username: string
  userId: string
  color?: string
  profileKey?: string
  /**
   * What the editor holds now, called just before this tab drops its copy of
   * the doc because the server's copy is a different one. Edits the server
   * never confirmed are kept as `recovered`, to copy back by hand: never merged.
   */
  keepEdits?: () => { html: string; text: string } | null
}

/**
 * NO LOCAL COPY OF THE SHARED DOCUMENT. A cache once kept every doc in
 * IndexedDB so a refresh could hydrate from disk; merged with the server's
 * copy, every block appeared twice and the doubled doc was saved back (24 Sep).
 * Copies that cache left are deleted when the doc opens, so they can never be
 * merged. Best effort: private mode or a blocked database leaves nothing.
 * (The one local copy comes back with the lineage check, last: C12.)
 */
export function discardLocalCopy(documentId: string) {
  try {
    if (typeof indexedDB !== 'undefined') indexedDB.deleteDatabase(documentId)
  } catch {
    // nothing to remove
  }
}

interface CollaborationConnection {
  provider: ReturnType<typeof useCollabSession>['provider']
  status: SessionStatus
  synced: boolean
  activeUsers: number
  awarenessUsers: PresenceUser[]
  /** A doc the server could not read: refused, never opened empty. */
  openError: 'unavailable' | null
  /** The server lets this tab read but not write (a reader, an older editor, a guest). */
  readOnly: boolean
  recovered: RecoveredEdits | null
  dismissRecovered(): void
  retry(): void
}

export function useCollaborationProvider(config: CollaborationConfig | undefined): CollaborationConnection {
  const name = config?.enabled && config.documentId ? config.documentId : undefined
  const s = useCollabSession(name, { tokenFetcher: config?.tokenFetcher, keepEdits: config?.keepEdits })
  React.useEffect(() => {
    if (name) discardLocalCopy(name)
  }, [name])
  return {
    provider: s.provider,
    status: s.status,
    synced: s.synced,
    activeUsers: s.activeUsers,
    awarenessUsers: s.users,
    openError: s.openError,
    readOnly: s.readOnly || (s.access ? !s.access.canEdit : false),
    recovered: s.recovered,
    dismissRecovered: s.dismissRecovered,
    retry: s.retry,
  }
}

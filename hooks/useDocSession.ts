/**
 * The Doc Session: one doc's live connection, and what the server decided about
 * it (docs programme, PROGRAM.md §4 #5; A2 builds it).
 *
 * - It connects from the route's doc id at once, over the tab's one socket,
 *   without waiting for the doc's details or the profile. Hovering a link to
 *   the doc may have started it already (IntentLink), and a doc left in the last
 *   minute is still live: either way the editor binds to a synced copy at once.
 * - The server decides (collaboration service session.js, from the Access
 *   Resolver): `access` is its level, whether this tab may edit and whether
 *   the doc is locked. The editor is editable only when `access.canEdit`.
 *   Until the server has said, nobody edits; a refusal reads as read-only.
 * - Readers (view, comment) are connected too, read-only: they see edits live,
 *   and presence says they are viewing.
 * - ONE COPY (I3): a copy that synced before compares its lineage with the
 *   server's before it syncs again; another lineage drops this tab's copy and
 *   opens the doc afresh (the editor remounts on the new provider), with edits
 *   the server never confirmed kept in `recovered`, never merged.
 * - `persistedAt` relays the server's "persisted at" (I8, sent by A4's save
 *   path), so the save dot can say saved only once stored.
 *
 * Against a collaboration service from before A2, it behaves as the day-0
 * contract did: editors connect read-write and the doc's details decide
 * editing (`level`), readers are refused and read the saved body.
 */
"use client"

import * as React from 'react'
import {
  useCollabSession,
  type DocAccessLevel,
  type PresenceUser,
  type RecoveredEdits,
  type Refusal,
  type SessionStatus,
} from '@/lib/collabSession'
import { discardLocalCopy } from '@/hooks/useCollaborationProvider'

export type { DocAccessLevel } from '@/lib/collabSession'

/** The person, for presence. The editor publishes it (CollaborationCursor). */
export interface DocSessionUser {
  id: string
  name: string
  color: string
  profileKey?: string
}

export interface DocSessionInput {
  /** The doc, from the route. */
  docId: string
  /** The person; undefined while their profile loads. The session does not wait for it. */
  user?: DocSessionUser
  /**
   * The level the doc's details give. The server's answer replaces it as soon
   * as it comes; it decides editing only on a server too old to answer.
   */
  level: DocAccessLevel
  /** What the editor holds, kept aside if this tab's copy is replaced. */
  keepEdits?: () => { html: string; text: string } | null
}

interface DocSession {
  provider: ReturnType<typeof useCollabSession>['provider']
  status: SessionStatus
  synced: boolean
  activeUsers: number
  awarenessUsers: PresenceUser[]
  /** What the server decided for this tab. */
  access: {
    level: DocAccessLevel
    /** The editor is editable only when this is true. */
    canEdit: boolean
    locked: boolean
  }
  /** The lineage of the copy this tab holds (the server's), null for a doc never rebuilt or before it is known. */
  lineage: string | null
  /** The server's schema version (its manifest hash); null until it says. */
  schemaVersion: string | null
  /** When the server last confirmed the doc stored (I8); null until it says so. */
  persistedAt: number | null
  /** A doc the server could not read: refused, never opened empty. */
  openError: 'unavailable' | null
  /** Why the server refused this tab: 'forbidden', 'gone' and 'not-found' are final; others retry. */
  refused: Refusal | null
  /** The collaboration service never sent a session: an older one (see the top). */
  legacy: boolean
  /** Signed in, but the doc hasn't come (lib/collabSession.ts's join watchdog): retry() tries a new connection. */
  stalled: boolean
  recovered: RecoveredEdits | null
  dismissRecovered(): void
  retry(): void
}

const EDITS: ReadonlySet<DocAccessLevel> = new Set(['edit', 'full'])
const FINAL: ReadonlySet<Refusal> = new Set(['forbidden', 'gone', 'not-found'])

export function useDocSession(input: DocSessionInput | undefined): DocSession {
  const docId = input?.docId || undefined
  const s = useCollabSession(docId, { keepEdits: input?.keepEdits })
  // Copies an old cache left are deleted, never merged (see discardLocalCopy).
  React.useEffect(() => {
    if (docId) discardLocalCopy(docId)
  }, [docId])
  const asked = input?.level ?? 'none'
  const access = React.useMemo(() => {
    if (s.refused && FINAL.has(s.refused)) return { level: 'none' as const, canEdit: false, locked: false }
    if (s.access) return { level: s.access.level, canEdit: s.access.canEdit && !s.readOnly, locked: s.access.locked }
    // An older server: it signs in only editors (read-write), so the doc's
    // details decide; anything else, or nothing yet, edits nothing.
    return { level: asked, canEdit: s.scope === 'read-write' && !s.readOnly && EDITS.has(asked), locked: false }
  }, [s.refused, s.access, s.readOnly, s.scope, asked])

  return {
    provider: s.provider,
    status: s.status,
    synced: s.synced,
    activeUsers: s.activeUsers,
    awarenessUsers: s.users,
    access,
    lineage: s.lineage,
    schemaVersion: s.schemaVersion,
    persistedAt: s.persistedAt,
    openError: s.openError,
    refused: s.refused,
    legacy: s.legacy,
    stalled: s.stalled,
    recovered: s.recovered,
    dismissRecovered: s.dismissRecovered,
    retry: s.retry,
  }
}

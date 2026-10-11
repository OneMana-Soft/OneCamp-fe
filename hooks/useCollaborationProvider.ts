/**
 * Hook for managing Hocuspocus collaboration provider lifecycle
 * Handles idle tabs, network drops, and token refresh for production reliability
 * Tracks active users with names, colors, and profile images for presence display
 */
"use client"

import * as React from 'react'
import type * as Y from 'yjs'
import { HocuspocusProvider } from '@hocuspocus/provider'
import { memberCollabToken, forgetCollabToken } from '@/lib/collabToken'
import { SCHEMA_MANIFEST_HASH } from '@/components/minimal-tiptap/schemaManifest'
import { markSchemaOutdated } from '@/lib/schemaOutdated'

interface CollaborationConfig {
  enabled: boolean
  documentId: string
  /**
   * Optional. The provider fetches and manages its own auth token internally
   * via the authenticated `/auth/token` endpoint (the Authorization cookie is
   * HttpOnly and invisible to JS), so callers do not need to supply one.
   */
  token?: string
  /**
   * Optional. When provided, the provider uses this to fetch its auth token on
   * every (re)connect instead of the default authenticated `/auth/token`
   * endpoint. Used by the public guest viewer, which has no member session and
   * exchanges a share-link token for a short-lived, read-only collab JWT.
   */
  tokenFetcher?: () => Promise<string>
  username: string
  userId: string
  color?: string
  profileKey?: string
  /**
   * What the editor holds now, called just before this tab drops its copy of
   * the doc because the server's copy is a different one (see "ONE COPY"
   * below). When the tab had edits the server never confirmed, they are kept
   * as `recovered`, for the person to copy back by hand: never merged.
   */
  keepEdits?: () => { html: string; text: string } | null
}

/** Edits a tab could not send before its copy of the doc was replaced. */
export interface RecoveredEdits {
  html: string
  text: string
  at: number
}

interface AwarenessUser {
  id: string
  name: string
  color: string
  profileKey?: string
}

type CollabStatus = 'connecting' | 'connected' | 'disconnected' | 'synced' | 'offline'

const DEV = process.env.NODE_ENV !== 'production'
const log = (...args: unknown[]) => { if (DEV) console.log(...args) }

/**
 * Why the server refused to open a doc it could not read (it never serves one
 * empty: an empty doc's first edit was saved over the stored one). The doc
 * page says "Couldn't open this doc" with Retry.
 */
export const UNAVAILABLE_REASON = 'document-unavailable'

/**
 * The collaboration URL, carrying the hash of the schema manifest this build's
 * editor was made with. The server opens a doc read-only for a tab built
 * against an older manifest, which would delete the blocks it does not know
 * (oneCamp collaboration-service schemaGate.js).
 */
export function collabUrl(base: string): string {
  const url = base.trim()
  if (!url) return url
  return `${url}${url.includes('?') ? '&' : '?'}schema=${SCHEMA_MANIFEST_HASH}`
}

/** The server's stateless messages this hook acts on. */
export function collabNotice(payload: string): 'epoch-changed' | 'schema-outdated' | null {
  try {
    const type = JSON.parse(payload)?.type
    return type === 'epoch-changed' || type === 'schema-outdated' ? type : null
  } catch {
    return null
  }
}

/**
 * Which copy of the doc a Y.Doc holds: the server stamps each rebuild from
 * HTML with its epoch (the doc id and the body's hash) in the `meta` map
 * (oneCamp collaboration-service lineage.js). Null for a doc built before that.
 */
export function epochIn(doc: Y.Doc | null | undefined): string | null {
  if (!doc) return null
  const v = doc.getMap('meta').get('epoch')
  return typeof v === 'string' ? v : null
}

// At most this many fresh copies a minute: a server that kept asking would
// otherwise spin the page.
const MAX_RELOADS_PER_MINUTE = 3

// discardLocalCopy deletes the IndexedDB copy the old cache kept for a
// document, named by its id. Best effort: private mode or a blocked database
// leaves nothing to delete.
function discardLocalCopy(documentId: string) {
  try {
    if (typeof indexedDB !== 'undefined') indexedDB.deleteDatabase(documentId)
  } catch {
    // nothing to remove
  }
}

export function useCollaborationProvider(config: CollaborationConfig | undefined) {
  // The provider lives in state (not a ref) so that its creation triggers a
  // single, deterministic re-render. The consuming editor gates its mount on
  // `provider` being present, which guarantees the TipTap instance is built
  // exactly once — already bound to Yjs — instead of being created in
  // non-collaborative mode and then torn down/rebuilt when the socket
  // connects. Identity is stable for the lifetime of a given documentId.
  const [provider, setProvider] = React.useState<HocuspocusProvider | null>(null)
  const providerRef = React.useRef<HocuspocusProvider | null>(null)
  const statusRef = React.useRef<CollabStatus>('connecting')
  const [status, setStatus] = React.useState<CollabStatus>('connecting')
  const [activeUsers, setActiveUsers] = React.useState<number>(0)
  const [awarenessUsers, setAwarenessUsers] = React.useState<AwarenessUser[]>([])
  const [synced, setSynced] = React.useState(false)
  // A doc the server could not read: refused, never opened empty.
  const [openError, setOpenError] = React.useState<'unavailable' | null>(null)
  // The server lets this tab read but not write (an older editor, a guest).
  const [readOnly, setReadOnly] = React.useState(false)
  // Edits kept aside when this tab's copy was replaced by the server's.
  const [recovered, setRecovered] = React.useState<RecoveredEdits | null>(null)
  // Bumped to drop this tab's copy and open the doc afresh.
  const [generation, setGeneration] = React.useState(0)
  const keepEditsRef = React.useRef(config?.keepEdits)
  keepEditsRef.current = config?.keepEdits
  const reloadsRef = React.useRef<number[]>([])

  // ---------------------------------------------------------------------------
  // ONE COPY. When the server's copy of the doc is not the one this tab holds
  // (its body was restored or rewritten while the tab was away), merging the
  // two would put every block in twice, for everyone. The server says so
  // ("epoch-changed") and drops this tab's edits; the tab then drops its own
  // copy and opens the doc again. Edits it had not had confirmed are kept
  // aside (`recovered`), never merged.
  const freshCopy = React.useCallback((why: 'epoch' | 'retry') => {
    const now = Date.now()
    reloadsRef.current = reloadsRef.current.filter((t) => now - t < 60_000)
    if (why === 'epoch' && reloadsRef.current.length >= MAX_RELOADS_PER_MINUTE) return
    reloadsRef.current.push(now)
    const current = providerRef.current
    if (why === 'epoch' && current?.hasUnsyncedChanges) {
      try {
        const kept = keepEditsRef.current?.()
        if (kept && kept.text.trim()) setRecovered({ ...kept, at: now })
      } catch {
        // nothing to keep
      }
    }
    setOpenError(null)
    setReadOnly(false)
    setSynced(false)
    setGeneration((g) => g + 1)
  }, [])
  const retry = React.useCallback(() => freshCopy('retry'), [freshCopy])
  const dismissRecovered = React.useCallback(() => setRecovered(null), [])

  // Keep status ref in sync for synchronous checks
  React.useEffect(() => {
    statusRef.current = status
  }, [status])

  // ---------------------------------------------------------------------------
  // PROVIDER LIFECYCLE
  // The provider is constructed exactly ONCE per documentId. The auth token is
  // NOT a dependency of this effect: instead we pass an async `token` callback
  // that Hocuspocus invokes on every (re)connection attempt. This is the
  // canonical pattern and it fixes the reconnect storm we saw in production:
  //
  //   - The collab JWT has a 5-min TTL. Previously the token was fetched once
  //     and baked into the provider; on expiry the server returned 401, the
  //     hook re-fetched the token, the new token changed the effect's deps,
  //     and the effect tore the provider down and built a new one. That
  //     destroy/recreate (plus a stale connect() scheduled on the old
  //     provider) produced the connected→disconnected→connected loop, and
  //     every reconnect re-ran the server's onLoadDocument and re-bound Yjs —
  //     the visible content "flash" and the stuck "connecting" state.
  //
  //   - With an async token callback, an expired token simply means the next
  //     reconnect fetches a fresh one. No teardown, no new provider, no storm.
  //     We let Hocuspocus own reconnection/backoff (its built-in exponential
  //     backoff) instead of hand-rolling setTimeout(connect).
  const fetchCollabToken = React.useCallback(async (): Promise<string> => {
    // Guest viewer: exchange the share-link token for a short-lived read-only
    // collab JWT via the caller-supplied fetcher (no member session involved).
    if (config?.tokenFetcher) {
      try {
        return await config.tokenFetcher()
      } catch (err) {
        console.error('[Collab] Guest token fetch failed:', err)
        return ''
      }
    }
    try {
      return await memberCollabToken()
    } catch (err) {
      console.error('[Collab] Failed to fetch collab token:', err)
      return ''
    }
  }, [config?.tokenFetcher])

  React.useEffect(() => {
    if (!config?.enabled || !config.documentId) {
      if (providerRef.current) {
        providerRef.current.destroy()
        providerRef.current = null
        setProvider(null)
      }
      setStatus('disconnected')
      setSynced(false)
      setActiveUsers(0)
      setAwarenessUsers([])
      return
    }

    log('[Collab] Connecting, docId:', config.documentId)
    // The epoch of the copy this provider opened, once synced.
    const epochRef: { current: string | null } = { current: null }

    const provider = new HocuspocusProvider({
      // No fallback. This used to default to OUR collaboration server, so an
      // install that had not set the variable silently opened a websocket to
      // somebody else's host: the token is rejected there, so the document never
      // syncs, and the only symptom is editing that quietly does not save. An
      // empty URL fails immediately and locally, which is the honest failure.
      url: collabUrl(process.env.NEXT_PUBLIC_COLLABORATION_URL || ''),
      name: config.documentId,
      // Async token provider: invoked on every (re)connect, so an expired
      // 5-min JWT is transparently replaced on the next attempt.
      token: fetchCollabToken,
      onStatus: (data: { status: CollabStatus }) => {
        setStatus(data.status)
        statusRef.current = data.status
      },
      onAuthenticationFailed: ({ reason }: { reason: string }) => {
        // The server could not read the doc and refused to open it rather
        // than serve it empty: say so, with Retry (nothing typed can be saved
        // over the stored copy, because the editor never had it).
        if (reason === UNAVAILABLE_REASON) {
          setOpenError('unavailable')
          return
        }
        // Do NOT tear down or hand-roll a reconnect here. The provider will
        // reconnect on its own and call `fetchCollabToken` again for a fresh
        // token. Tearing down here is exactly what caused the storm.
        console.error(`[Collab] Auth failed for ${config.documentId}:`, reason)
        // The next attempt must not be handed the token just refused.
        if (!config.tokenFetcher) forgetCollabToken()
      },
      onAuthenticated: ({ scope }: { scope: string }) => {
        setReadOnly(scope === 'readonly')
      },
      onStateless: ({ payload }: { payload: string }) => {
        const notice = collabNotice(payload)
        if (notice === 'epoch-changed') freshCopy('epoch')
        if (notice === 'schema-outdated') {
          setReadOnly(true)
          markSchemaOutdated()
        }
      },
      onSynced: () => {
        // The copy this tab holds: if a later sync shows another, the doc was
        // replaced underneath (see ONE COPY).
        const epoch = epochIn(provider.document)
        if (epochRef.current && epoch && epoch !== epochRef.current) {
          freshCopy('epoch')
          return
        }
        if (epoch) epochRef.current = epoch
        setOpenError(null)
        setSynced(true)
        setStatus('synced')
        statusRef.current = 'synced'
        window.setTimeout(() => {
          try {
            provider.setAwarenessField('refresh', Date.now())
          } catch {
            // Provider might be destroyed
          }
        }, 300)
      },
      onAwarenessUpdate: ({ states }: { states: any[] }) => {
        setActiveUsers(states.length)
        const users = states
          .filter((s) => s.user?.name)
          .map((s) => ({
            id: s.user.id || s.user.name,
            name: s.user.name,
            color: s.user.color || '#6366f1',
            profileKey: s.user.profileKey,
          }))
        setAwarenessUsers(users)
      },
    })

    providerRef.current = provider
    setProvider(provider)

    // NO LOCAL COPY OF THE SHARED DOCUMENT. This used to persist it to
    // IndexedDB so a refresh could hydrate from disk. But the collaboration
    // server keeps no Yjs state: it rebuilds the document from the stored HTML
    // on every load, as new, unrelated items. A cached copy from an earlier load
    // therefore does not reconcile with it, it merges alongside it, and every
    // block appears twice; that doubled document is then saved back as the HTML.
    // Copies left by the old cache are removed so they can never be merged.
    discardLocalCopy(config.documentId)

    return () => {
      provider.destroy()
      providerRef.current = null
      setProvider(null)
      setSynced(false)
      setStatus('disconnected')
      statusRef.current = 'disconnected'
      setActiveUsers(0)
      setAwarenessUsers([])
    }
  }, [config?.enabled, config?.documentId, fetchCollabToken, generation, freshCopy])

  // IDLE TAB HANDLING
  React.useEffect(() => {
    const handleVisibilityChange = () => {
      const provider = providerRef.current
      if (!provider || !config?.enabled) return

      if (document.visibilityState === 'visible') {
        const currentStatus = statusRef.current
        if (currentStatus === 'disconnected' || currentStatus === 'offline') {
          log('[Collab] Tab visible, reconnecting…')
          provider.connect()
        } else if (currentStatus === 'synced') {
          // -----------------------------------------------------------------
          // Already connected but awareness might be stale after idle.
          // Force a refresh so remote clients' awareness states are re-synced.
          // -----------------------------------------------------------------
          try {
            provider.setAwarenessField('refresh', Date.now())
          } catch {
            // Provider might be destroyed
          }
        }
      }
    }

    
    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
  }, [config?.enabled])

  // NETWORK HANDLING
  React.useEffect(() => {
    const handleOnline = () => {
      const provider = providerRef.current
      if (!provider || !config?.enabled) return

      const currentStatus = statusRef.current
      if (currentStatus === 'disconnected' || currentStatus === 'offline') {
        log('[Collab] Network online, reconnecting…')
        setStatus('connecting')
        provider.connect()
      }
    }

    const handleOffline = () => {
      if (!config?.enabled) return
      setStatus('offline')
      statusRef.current = 'offline'
      setSynced(false)
    }

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [config?.enabled])

  // PERIODIC HEALTH CHECK: 30s ping to keep connection warm
  React.useEffect(() => {
    if (!config?.enabled || (status !== 'connected' && status !== 'synced')) return

    const interval = setInterval(() => {
      const provider = providerRef.current
      if (!provider) return
      try {
        provider.setAwarenessField('ping', Date.now())
      } catch {
        // Provider might be destroyed
      }
    }, 30000)

    return () => clearInterval(interval)
  }, [config?.enabled, status])

  // ACTIVE AWARENESS REFRESH: every 10s while visible to prevent Yjs timeout
  // Yjs awareness default timeout is ~30s; refreshing at 10s keeps us alive
  React.useEffect(() => {
    if (!config?.enabled || (status !== 'connected' && status !== 'synced')) return

    const interval = setInterval(() => {
      const provider = providerRef.current
      if (!provider) return
      try {
        provider.setAwarenessField('active', Date.now())
      } catch {
        // Provider might be destroyed
      }
    }, 10000)

    return () => clearInterval(interval)
  }, [config?.enabled, status])

  return {
    provider,
    status,
    synced,
    activeUsers,
    awarenessUsers,
    openError,
    readOnly,
    recovered,
    dismissRecovered,
    retry,
  }
}

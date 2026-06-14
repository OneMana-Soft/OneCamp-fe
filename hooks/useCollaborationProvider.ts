/**
 * Hook for managing Hocuspocus collaboration provider lifecycle
 * Handles idle tabs, network drops, and token refresh for production reliability
 * Tracks active users with names, colors, and profile images for presence display
 */
"use client"

import * as React from 'react'
import { HocuspocusProvider } from '@hocuspocus/provider'
import axiosInstance from '@/lib/axiosInstance'

interface TokenResponse {
  data?: { token?: string }
  token?: string
}
export interface CollaborationConfig {
  enabled: boolean
  documentId: string
  /**
   * Optional. The provider fetches and manages its own auth token internally
   * via the authenticated `/auth/token` endpoint (the Authorization cookie is
   * HttpOnly and invisible to JS), so callers do not need to supply one.
   */
  token?: string
  username: string
  userId: string
  color?: string
  profileKey?: string
}

export interface AwarenessUser {
  id: string
  name: string
  color: string
  profileKey?: string
}

export type CollabStatus = 'connecting' | 'connected' | 'disconnected' | 'synced' | 'offline'

const DEV = process.env.NODE_ENV !== 'production'
const log = (...args: unknown[]) => { if (DEV) console.log(...args) }

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
    const url = `${(process.env.NEXT_PUBLIC_BACKEND_URL || '').replace(/\/+$/, '')}/auth/token`
    try {
      const res = await axiosInstance.get<TokenResponse>(url)
      const raw = res.data?.data?.token || res.data?.token || ''
      return raw.startsWith('Bearer ') ? raw.slice(7) : raw
    } catch (err) {
      console.error('[Collab] Failed to fetch collab token:', err)
      return ''
    }
  }, [])

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

    log('[Collab] Connecting — docId:', config.documentId)

    const provider = new HocuspocusProvider({
      url: process.env.NEXT_PUBLIC_COLLABORATION_URL || 'wss://onecamp-collab.onemana.dev',
      name: config.documentId,
      // Async token provider: invoked on every (re)connect, so an expired
      // 5-min JWT is transparently replaced on the next attempt.
      token: fetchCollabToken,
      onStatus: (data: { status: CollabStatus }) => {
        setStatus(data.status)
        statusRef.current = data.status
      },
      onAuthenticationFailed: ({ reason }: { reason: string }) => {
        // Do NOT tear down or hand-roll a reconnect here. The provider will
        // reconnect on its own and call `fetchCollabToken` again for a fresh
        // token. Tearing down here is exactly what caused the storm.
        console.error(`[Collab] Auth failed for ${config.documentId}:`, reason)
      },
      onSynced: () => {
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
  }, [config?.enabled, config?.documentId, fetchCollabToken])

  // IDLE TAB HANDLING
  React.useEffect(() => {
    const handleVisibilityChange = () => {
      const provider = providerRef.current
      if (!provider || !config?.enabled) return

      if (document.visibilityState === 'visible') {
        const currentStatus = statusRef.current
        if (currentStatus === 'disconnected' || currentStatus === 'offline') {
          log('[Collab] Tab visible, reconnecting...')
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
        log('[Collab] Network online, reconnecting...')
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
  }
}

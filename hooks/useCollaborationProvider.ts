/**
 * Hook for managing Hocuspocus collaboration provider lifecycle
 * Handles idle tabs, network drops, and token refresh for production reliability
 * Tracks active users with names, colors, and profile images for presence display
 */
"use client"

import * as React from 'react'
import { HocuspocusProvider } from '@hocuspocus/provider'
import { getCookie } from '@/lib/utils/helpers/getCookie'

export interface CollaborationConfig {
  enabled: boolean
  documentId: string
  token: string
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

export function useCollaborationProvider(config: CollaborationConfig | undefined) {
  const providerRef = React.useRef<HocuspocusProvider | null>(null)
  const statusRef = React.useRef<CollabStatus>('connecting')
  const [status, setStatus] = React.useState<CollabStatus>('connecting')
  const [activeUsers, setActiveUsers] = React.useState<number>(1)
  const [awarenessUsers, setAwarenessUsers] = React.useState<AwarenessUser[]>([])
  const [synced, setSynced] = React.useState(false)
  const reconnectAttemptsRef = React.useRef(0)

  // Keep status ref in sync for synchronous checks
  React.useEffect(() => {
    statusRef.current = status
  }, [status])

  React.useEffect(() => {
    if (!config?.enabled || !config.documentId) {
      if (providerRef.current) {
        providerRef.current.destroy()
        providerRef.current = null
      }
      setStatus('disconnected')
      setSynced(false)
      setActiveUsers(1)
      setAwarenessUsers([])
      reconnectAttemptsRef.current = 0
      return
    }

    const getCleanedToken = () => {
      const currentToken = getCookie('Authorization') || ''
      return currentToken.startsWith('Bearer ') ? currentToken.slice(7) : currentToken
    }

    const cleanedToken = getCleanedToken()
    if (!cleanedToken) {
      setStatus('disconnected')
      return
    }

    const provider = new HocuspocusProvider({
      url: process.env.NEXT_PUBLIC_COLLABORATION_URL || 'wss://onecamp-collab.onemana.dev',
      name: config.documentId,
      token: cleanedToken,
      onStatus: (data: { status: CollabStatus }) => {
        const newStatus = data.status
        setStatus(newStatus)
        statusRef.current = newStatus
        if (newStatus === 'connected') {
          reconnectAttemptsRef.current = 0
        }
      },
      onAuthenticationFailed: (data: { reason: string }) => {
        console.error(`[Collab] Auth failed for ${config.documentId}:`, data.reason)
        const freshToken = getCleanedToken()
        if (freshToken && provider) {
          provider.configuration.token = freshToken
          provider.disconnect()
          const backoff = Math.min(1000 * Math.pow(2, reconnectAttemptsRef.current), 10000)
          reconnectAttemptsRef.current += 1
          setTimeout(() => provider.connect(), backoff)
        }
      },
      onSynced: () => {
        setSynced(true)
        setStatus('synced')
        statusRef.current = 'synced'
        // -------------------------------------------------------------------
        // CRITICAL FIX: After reconnecting from idle, awareness states from
        // other clients take time to propagate through Redis. Force a local
        // awareness broadcast to trigger a full awareness sync exchange.
        // Without this, user count shows 1 for several seconds.
        // -------------------------------------------------------------------
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

    return () => {
      provider.destroy()
      providerRef.current = null
      setSynced(false)
      setStatus('disconnected')
      statusRef.current = 'disconnected'
      setActiveUsers(1)
      setAwarenessUsers([])
      reconnectAttemptsRef.current = 0
    }
  }, [config?.enabled, config?.documentId])

  // IDLE TAB HANDLING
  React.useEffect(() => {
    const handleVisibilityChange = () => {
      const provider = providerRef.current
      if (!provider || !config?.enabled) return

      if (document.visibilityState === 'visible') {
        const currentStatus = statusRef.current
        if (currentStatus === 'disconnected' || currentStatus === 'offline') {
          console.log('[Collab] Tab visible, reconnecting...')
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
        console.log('[Collab] Network online, reconnecting...')
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
    provider: providerRef.current,
    status,
    synced,
    activeUsers,
    awarenessUsers,
  }
}

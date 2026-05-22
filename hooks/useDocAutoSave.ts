/**
 * Notion-like document auto-save hook with collaboration fallback
 * Handles browser background throttling and flushes saves when tab wakes
 */
"use client"

import * as React from 'react'
import { usePost } from './usePost'
import { PostEndpointUrl } from '@/services/endPoints'

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error' | 'offline'

interface UseDocAutoSaveOptions {
  docId: string
  enabled: boolean
  initialBody?: string
  collaborationEnabled?: boolean
  providerSynced?: boolean
  debounceMs?: number
}

export function useDocAutoSave(options: UseDocAutoSaveOptions) {
  const { docId, enabled, initialBody = '', collaborationEnabled, providerSynced, debounceMs = 3000 } = options
  const { makeRequest: updateDoc } = usePost()
  const [saveStatus, setSaveStatus] = React.useState<SaveStatus>('idle')
  const [lastSavedAt, setLastSavedAt] = React.useState<Date | null>(null)
  const pendingBodyRef = React.useRef<string | null>(null)
  const saveTimeoutRef = React.useRef<NodeJS.Timeout | null>(null)
  const isSavingRef = React.useRef(false)
  const lastSavedBodyRef = React.useRef<string>(initialBody)
  const hasUserEditedRef = React.useRef(false)
  const isVisibleRef = React.useRef(true)

  const save = React.useCallback(
    async (body: string) => {
      if (!docId || !enabled || isSavingRef.current) return

      // Skip if body hasn't changed from last saved version
      if (body === lastSavedBodyRef.current && hasUserEditedRef.current) {
        setSaveStatus('idle')
        return
      }

      // Don't save empty content on initial load if we already have content
      if (!hasUserEditedRef.current && body.trim() === '' && initialBody.trim().length > 0) {
        return
      }

      isSavingRef.current = true
      setSaveStatus('saving')

      try {
        await updateDoc({
          apiEndpoint: PostEndpointUrl.UpdateDoc,
          payload: {
            doc_uuid: docId,
            doc_body: body,
          },
        })
        setSaveStatus('saved')
        setLastSavedAt(new Date())
        lastSavedBodyRef.current = body
        pendingBodyRef.current = null
        hasUserEditedRef.current = true
      } catch (err) {
        console.error('[AutoSave] Failed to save document:', err)
        setSaveStatus('error')
        pendingBodyRef.current = body
      } finally {
        isSavingRef.current = false
      }
    },
    [docId, enabled, initialBody, updateDoc]
  )

  const scheduleSave = React.useCallback(
    (body: string) => {
      if (!enabled) return

      // Mark that user has made an edit
      if (body !== lastSavedBodyRef.current) {
        hasUserEditedRef.current = true
      }

      pendingBodyRef.current = body
      setSaveStatus((prev) => (prev === 'saved' ? 'saving' : prev))

      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current)
      }

      // Use a shorter debounce when tab is visible; longer when hidden
      // because browsers throttle background timers anyway
      const effectiveDebounce = isVisibleRef.current ? debounceMs : Math.min(debounceMs * 2, 10000)

      saveTimeoutRef.current = setTimeout(() => {
        save(body)
      }, effectiveDebounce)
    },
    [enabled, save, debounceMs]
  )

  // Retry failed saves periodically
  React.useEffect(() => {
    if (saveStatus !== 'error' || !pendingBodyRef.current) return

    const retryInterval = setInterval(() => {
      if (pendingBodyRef.current && !isSavingRef.current) {
        save(pendingBodyRef.current)
      }
    }, 10000)

    return () => clearInterval(retryInterval)
  }, [saveStatus, save])

  // Clear saved status after a delay
  React.useEffect(() => {
    if (saveStatus !== 'saved') return

    const timer = setTimeout(() => {
      setSaveStatus('idle')
    }, 3000)

    return () => clearTimeout(timer)
  }, [saveStatus])

  // ---------------------------------------------------------------------------
  // IDLE TAB HANDLING: flush pending save immediately when tab wakes up
  // Browsers throttle background setTimeout to ~1 min, so we bypass the delay
  // ---------------------------------------------------------------------------
  React.useEffect(() => {
    const handleVisibilityChange = () => {
      const isVisible = document.visibilityState === 'visible'
      isVisibleRef.current = isVisible

      if (isVisible && pendingBodyRef.current && !isSavingRef.current) {
        console.log('[AutoSave] Tab visible, flushing pending save')
        save(pendingBodyRef.current)
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
  }, [save])

  // ---------------------------------------------------------------------------
  // ONLINE HANDLING: retry failed saves when network comes back
  // ---------------------------------------------------------------------------
  React.useEffect(() => {
    const handleOnline = () => {
      if (pendingBodyRef.current && !isSavingRef.current) {
        console.log('[AutoSave] Network online, retrying save')
        save(pendingBodyRef.current)
      }
    }

    window.addEventListener('online', handleOnline)
    return () => window.removeEventListener('online', handleOnline)
  }, [save])

  // Cleanup on unmount — flush pending save
  React.useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current)
      }
      if (pendingBodyRef.current && !isSavingRef.current) {
        updateDoc({
          apiEndpoint: PostEndpointUrl.UpdateDoc,
          payload: {
            doc_uuid: docId,
            doc_body: pendingBodyRef.current,
          },
        }).catch(() => {})
      }
    }
  }, [docId, updateDoc])

  return {
    saveStatus,
    lastSavedAt,
    scheduleSave,
    save,
  }
}

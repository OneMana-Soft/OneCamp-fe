"use client"

import { useEffect, useRef } from "react"
import { useTheme } from "next-themes"
import { useThemeConfig } from "@/components/activeTheme/activeTheme"
import { usePost } from "@/hooks/usePost"
import { PostEndpointUrl } from "@/services/endPoints"
import { checkAuthCookieExists } from "@/lib/utils/helpers/getCookie"

const MIN_SYNC_INTERVAL_MS = 5000

/**
 * Watches for theme changes (color + mode) and syncs them to the backend.
 *
 * PROBLEM this solves:
 * next-themes resolves theme asynchronously across multiple renders
 * (undefined → 'system' → 'light'). Without tracking, every resolution
 * triggers a false-positive API call. ThemeSync also reads from backend
 * on load and sets local state, which would trigger another call.
 *
 * SOLUTION:
 * Track the last successfully synced values. Only call the API when
 * the current values differ from what was last sent. This eliminates
 * hydration false positives, initial-load noise, and re-render loops.
 */
export function useThemeBackendSync() {
  const { activeTheme } = useThemeConfig()
  const { theme } = useTheme()
  const post = usePost()

  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastSyncedRef = useRef<{ color: string | null; mode: string | null }>({
    color: null,
    mode: null,
  })
  const lastSyncTimeRef = useRef<number>(0)

  useEffect(() => {
    // Skip while theme is still resolving from hydration
    if (theme === undefined) return

    // Don't push theme writes from unauthenticated pages (login, signup,
    // forgot-password, etc.). Without this guard, an anonymous visit
    // triggers a /updateUserTheme POST that 401s, the axios response
    // interceptor walks the refresh-then-logout chain, and isLoggingOut
    // gets latched true — which breaks the very next demo / OAuth login
    // attempt by aborting the post-login /self_profile fetch.
    if (!checkAuthCookieExists()) return

    // Skip if values match what was already synced
    if (
      lastSyncedRef.current.color === activeTheme &&
      lastSyncedRef.current.mode === theme
    ) {
      return
    }

    // Rate limit: max 1 sync per 5 seconds
    const now = Date.now()
    const timeSinceLastSync = now - lastSyncTimeRef.current
    const delay = Math.max(0, MIN_SYNC_INTERVAL_MS - timeSinceLastSync)

    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
    }

    timeoutRef.current = setTimeout(() => {
      // Double-check values haven't changed while waiting
      if (
        lastSyncedRef.current.color === activeTheme &&
        lastSyncedRef.current.mode === theme
      ) {
        return
      }

      post
        .makeRequest({
          apiEndpoint: PostEndpointUrl.UpdateUserTheme,
          payload: {
            user_theme_color: activeTheme,
            user_theme_mode: theme,
          },
          showToast: false,
        })
        .then(() => {
          lastSyncedRef.current = { color: activeTheme, mode: theme }
          lastSyncTimeRef.current = Date.now()
        })
        .catch(() => {
          // Silently fail — localStorage is the primary source of truth
        })
    }, delay)

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }
    }
  }, [activeTheme, theme, post])
}

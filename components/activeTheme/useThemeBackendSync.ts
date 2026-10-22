"use client"

import { useEffect, useRef } from "react"
import { useTheme } from "next-themes"
import { useThemeConfig } from "@/components/activeTheme/activeTheme"
import { usePost } from "@/hooks/usePost"
import { PostEndpointUrl } from "@/services/endPoints"

const MIN_SYNC_INTERVAL_MS = 5000

// The shared demo account belongs to every visitor: a visitor's theme is not
// saved to it (ThemeSync keeps it in their browser), or the next visitor would
// open in it.
const DEMO = process.env.NEXT_PUBLIC_DEMO_MODE === "true"

/** The theme the member's profile holds; null while no profile is held (nobody signed in). */
export type SavedTheme = { color: string | null; mode: string | null } | null

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
export function useThemeBackendSync(saved: SavedTheme) {
  const { activeTheme } = useThemeConfig()
  const { theme } = useTheme()
  const post = usePost()

  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastSyncedRef = useRef<{ color: string | null; mode: string | null }>({
    color: null,
    mode: null,
  })
  const lastSyncTimeRef = useRef<number>(0)
  const seeded = useRef(false)

  useEffect(() => {
    // Skip while theme is still resolving from hydration
    if (theme === undefined) return

    if (DEMO) return

    // Only for a signed-in member, whose profile the app holds. From a page
    // nobody is signed in to, the POST would 401 and the axios interceptor
    // would walk the refresh-then-logout chain, latching isLoggingOut and
    // breaking the next sign-in. (This waited for a cookie JS can't see, the
    // session's being HttpOnly, so no change was ever saved.)
    if (!saved) return
    // What the profile holds is saved already.
    if (!seeded.current) {
      seeded.current = true
      lastSyncedRef.current = { ...saved }
    }

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
  }, [activeTheme, theme, post, saved])
}

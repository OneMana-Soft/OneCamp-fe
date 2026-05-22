"use client"

import { useEffect } from "react"
import { useTheme } from "next-themes"
import { useThemeConfig, isValidColorTheme } from "@/components/activeTheme/activeTheme"
import { useFetchOnlyOnce } from "@/hooks/useFetch"
import { UserProfileInterface } from "@/types/user"
import { GetEndpointUrl } from "@/services/endPoints"
import { useThemeBackendSync } from "./useThemeBackendSync"
import { checkAuthCookieExists } from "@/lib/utils/helpers/getCookie"

export function ThemeSync() {
  const { setTheme, theme } = useTheme()
  const { setActiveTheme } = useThemeConfig()

  // Only fetch profile when authenticated to avoid triggering
  // axios logout redirect loops on public pages (login, signup, etc.)
  const shouldFetch = checkAuthCookieExists()
  const selfProfile = useFetchOnlyOnce<UserProfileInterface>(
    shouldFetch ? GetEndpointUrl.SelfProfile : ""
  )

  // Sync FROM backend TO local state on initial load
  useEffect(() => {
    if (!selfProfile.data?.data) return

    const user = selfProfile.data.data

    // Sync color theme from backend
    if (user.user_theme_color && isValidColorTheme(user.user_theme_color)) {
      setActiveTheme(user.user_theme_color)
    }

    // Sync mode from backend
    if (user.user_theme_mode && ["light", "dark", "system"].includes(user.user_theme_mode)) {
      if (theme !== user.user_theme_mode) {
        setTheme(user.user_theme_mode)
      }
    }
  }, [selfProfile.data, setActiveTheme, setTheme, theme])

  // Sync FROM local state TO backend on user interaction
  useThemeBackendSync()

  return null
}

"use client"

import { useEffect, useRef, useState } from "react"
import useSWR from "swr"
import { useTheme } from "next-themes"
import { useThemeConfig, isValidColorTheme } from "@/components/activeTheme/activeTheme"
import { UserProfileInterface } from "@/types/user"
import { GetEndpointUrl } from "@/services/endPoints"
import { useThemeBackendSync, type SavedTheme } from "./useThemeBackendSync"

// The shared demo account belongs to every visitor: a visitor's theme stays in
// their own browser instead of becoming the next visitor's.
const DEMO = process.env.NEXT_PUBLIC_DEMO_MODE === "true"

const MODES = ["light", "dark", "system"]

export function ThemeSync() {
  const { setTheme, theme } = useTheme()
  const { activeTheme, setActiveTheme } = useThemeConfig()

  // The profile the signed-in app holds (AppProtectedRoute reads it), from
  // the cache and never fetched here: mounted in the app's providers, this
  // sees it once the member is signed in. It used to wait for a cookie JS can
  // never see (the session's are HttpOnly), so the saved theme was never read.
  const selfProfile = useSWR<UserProfileInterface>(DEMO ? null : GetEndpointUrl.SelfProfile, null)

  // What the person changed on this page before the saved preference arrived
  // keeps their change. The mode counts from its first resolved value, since
  // next-themes resolves it after the first render without anyone touching it.
  const firstColor = useRef(activeTheme)
  const colorTouched = useRef(false)
  useEffect(() => {
    if (activeTheme !== firstColor.current) colorTouched.current = true
  }, [activeTheme])
  const firstMode = useRef<string | undefined>(undefined)
  const modeTouched = useRef(false)
  useEffect(() => {
    if (theme === undefined) return
    if (firstMode.current === undefined) firstMode.current = theme
    else if (theme !== firstMode.current) modeTouched.current = true
  }, [theme])

  // The saved preference is applied once per page load. It used to be applied
  // again on every change of mode, from the profile as it was fetched when the
  // page opened: switching to dark, or a new colour and then the mode, was put
  // back to the old preference at once, and the choice seemed not to take.
  const applied = useRef(false)
  // What the profile holds, handed to the backend sync in the same render as
  // the theme applied from it, so applying it is never taken for a change.
  const [saved, setSaved] = useState<SavedTheme>(null)
  useEffect(() => {
    const user = selfProfile.data?.data
    if (!user || applied.current) return
    applied.current = true
    if (!colorTouched.current && user.user_theme_color && isValidColorTheme(user.user_theme_color)) {
      setActiveTheme(user.user_theme_color)
    }
    if (!modeTouched.current && user.user_theme_mode && MODES.includes(user.user_theme_mode)) {
      setTheme(user.user_theme_mode)
    }
    setSaved({ color: user.user_theme_color || null, mode: user.user_theme_mode || null })
  }, [selfProfile.data, setActiveTheme, setTheme])

  // Sync FROM local state TO backend on user interaction
  useThemeBackendSync(saved)

  return null
}

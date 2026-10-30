"use client"

import { useEffect } from "react"
import { usePreferences } from "@/lib/preferences/usePreference"
import { setAccountClock } from "@/lib/utils/date/clock"

const SEEN = "onecamp:clock"

// The last clock this device read, so the first paint already writes times
// the person's way, before their preferences arrive.
try {
  if (typeof window !== "undefined") setAccountClock(window.localStorage.getItem(SEEN))
} catch {
  // Storage blocked: the locale's clock until the preference arrives.
}

/**
 * The account's clock for every time of day (Person Preferences' `clock`,
 * calendar A3): "12" or "24" wins over the browser's own way, "auto" leaves
 * it. Read with the person's other preferences, so a change in settings, or
 * on another device, holds from the next time each view draws.
 */
export function AccountClock() {
  const clock = usePreferences()?.clock
  useEffect(() => {
    if (clock === undefined) return
    setAccountClock(clock)
    try {
      window.localStorage.setItem(SEEN, String(clock))
    } catch {
      // Storage blocked: nothing to remember.
    }
  }, [clock])
  return null
}

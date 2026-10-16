import { useSyncExternalStore } from "react"
import { dayKey } from "@/lib/utils/date/days"

/**
 * Today on this device, "2026-10-14", for everything that reads a day against
 * it: "Today" on a date chip turns into "Yesterday" at midnight, with the page
 * still open (small-details D5). One timer for the page, whatever number of
 * chips read it; a device that slept past midnight catches up when it wakes.
 */

const listeners = new Set<() => void>()
let today = ""
let timer: ReturnType<typeof setTimeout> | null = null

function check() {
  const now = dayKey(new Date())
  if (now === today) return
  today = now
  for (const l of [...listeners]) l()
}

function untilMidnight(): number {
  const now = new Date()
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
  return next.getTime() - now.getTime() + 1000
}

function arm() {
  timer = setTimeout(() => {
    check()
    arm()
  }, untilMidnight())
}

function subscribe(listener: () => void): () => void {
  if (listeners.size === 0) {
    check()
    arm()
    document.addEventListener("visibilitychange", check)
  }
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
    if (listeners.size > 0) return
    if (timer) clearTimeout(timer)
    timer = null
    document.removeEventListener("visibilitychange", check)
  }
}

/** Today, kept current while the page is open. */
export function useToday(): string {
  return useSyncExternalStore(subscribe, () => today || dayKey(new Date()), () => dayKey(new Date()))
}

"use client"

import { useEffect } from "react"
import { useDispatch, useSelector } from "react-redux"
import { useAIAvailable } from "@/hooks/useClientConfig"
import { getNudges } from "@/services/nudgeService"
import { setNudges } from "@/store/slice/nudgeSlice"
import type { RootState } from "@/store/store"

/**
 * How many urgent OneCamp AI nudges are open, for the Inbox row's badge (design v3,
 * shell N1). The bell that counted them is retired; nudges are the "From
 * OneCamp AI" group at the top of Inbox and the urgent ones count in its badge. Read once on load, then kept live by the MQTT handler
 * (store/slice/nudgeSlice). Zero, and no request, where AI is off.
 */
export function useNudgeCount(): number {
  const ai = useAIAvailable()
  const dispatch = useDispatch()
  // Urgent ones (priority above 0) earn the badge; the rest wait in the group.
  const urgent = useSelector((s: RootState) => s.nudge.nudges.filter((n) => n.priority > 0).length)
  useEffect(() => {
    if (!ai) return
    let cancelled = false
    getNudges()
      .then((res) => {
        if (!cancelled) dispatch(setNudges({ nudges: res.nudges, openCount: res.open_count }))
      })
      .catch(() => {
        /* the badge counts notifications alone until the next event */
      })
    return () => {
      cancelled = true
    }
  }, [ai, dispatch])
  return ai ? urgent : 0
}

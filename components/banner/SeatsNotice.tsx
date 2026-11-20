"use client"

// The free plan filling up, said to an admin before an invitation is refused
// (SHELL-15): once from 80 % and once when full, each dismissed for good in
// this browser, with the way past the limit. A chunk of its own, drawn for
// admins only (AdminBanners).

import { useState } from "react"
import { NoticeBar, noticeActionClass } from "@/components/banner/NoticeBar"
import { usePlan } from "@/hooks/usePlan"
import { removeLimit } from "@/lib/plan/planWords"

/** The threshold a free plan has reached: 100, 80, or 0 below 80 % (and with no limit). Pure. */
export function seatsBucket(used: number, limit: number): 0 | 80 | 100 {
  if (limit <= 0) return 0
  return used >= limit ? 100 : used / limit >= 0.8 ? 80 : 0
}

const keyOf = (limit: number, bucket: number) => `onecamp:seats-notice-${limit}-${bucket}`

function dismissedAt(key: string): boolean {
  try {
    return localStorage.getItem(key) === "1"
  } catch {
    return false
  }
}

export function SeatsNotice() {
  const { known, used, limit, upgradeUrl } = usePlan({ quiet: true })
  const bucket = known ? seatsBucket(used, limit) : 0
  const key = keyOf(limit, bucket)
  const [gone, setGone] = useState<string[]>([])
  if (!bucket || gone.includes(key) || dismissedAt(key)) return null
  const left = Math.max(0, limit - used)
  return (
    <NoticeBar
      tone="brand"
      lead={left === 0 ? "No places left on the free plan." : `${left} ${left === 1 ? "place" : "places"} left on the free plan.`}
      action={
        upgradeUrl ? (
          <a href={upgradeUrl} target="_blank" rel="noopener noreferrer" className={noticeActionClass}>
            {removeLimit(limit)}
          </a>
        ) : undefined
      }
      onDismiss={() => {
        setGone((g) => [...g, key])
        try {
          localStorage.setItem(key, "1")
        } catch {
          /* dismissed for this visit only */
        }
      }}
    />
  )
}

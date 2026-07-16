"use client"

/**
 * AiUsageIndicator — shows the CURRENT user their own AI token spend for today,
 * and, when the admin has set a per-user daily cap, how close they are to it.
 *
 * Token usage is metered server-side (every model call records spend against a
 * per-user, per-day counter). The read endpoint GET /ai/usage is available to
 * every member and returns the caller's own usage, so this is a pure,
 * read-only transparency surface — no admin rights needed.
 *
 * Renders nothing until usage loads, and stays hidden for a user who has never
 * spent any tokens and has no cap (so the header isn't cluttered with "0").
 */

import React, { useEffect, useState } from "react"
import { getAIUsage, type AIUsage } from "@/services/aiModelService"

// compact token formatter: 1234 -> "1.2k", 2_000_000 -> "2M".
function fmtTokens(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "0"
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M"
  if (n >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, "") + "k"
  return String(n)
}

const AiUsageIndicator: React.FC<{ refreshSignal?: number }> = ({ refreshSignal }) => {
  const [usage, setUsage] = useState<AIUsage | null>(null)

  useEffect(() => {
    let cancelled = false
    getAIUsage()
      .then((u) => {
        if (!cancelled) setUsage(u)
      })
      .catch(() => {
        /* non-fatal: indicator simply won't render */
      })
    return () => {
      cancelled = true
    }
  }, [refreshSignal])

  if (!usage || !usage.user) return null

  const used = usage.user.used || 0
  const limit = usage.user.limit || 0
  const hasCap = limit > 0

  // Nothing meaningful to show for a user who hasn't spent anything and has no
  // cap — keep the header clean.
  if (used <= 0 && !hasCap) return null

  const pct = hasCap ? Math.min(100, Math.round((used / limit) * 100)) : 0
  const near = hasCap && pct >= 80
  const title = hasCap
    ? `Your AI usage today: ${used.toLocaleString()} / ${limit.toLocaleString()} tokens (${pct}%). Resets at 00:00 UTC.`
    : `Your AI usage today: ${used.toLocaleString()} tokens. Resets at 00:00 UTC.`

  return (
    <span
      className={`hidden sm:inline-flex items-center px-1.5 text-[11px] tabular-nums ${
        near ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground"
      }`}
      title={title}
      aria-label={title}
    >
      {fmtTokens(used)}
      {hasCap ? `/${fmtTokens(limit)}` : ""} today
    </span>
  )
}

export default AiUsageIndicator

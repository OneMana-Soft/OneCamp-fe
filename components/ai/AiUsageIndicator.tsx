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

/**
 * "inline" is the old footer count; "menu" is the row at the top of the AI
 * panel's More menu (hub.md AI12): "32k of 50k today" over a 64 × 4 bar in the
 * accent (the logo gradient in the house theme).
 */
const AiUsageIndicator: React.FC<{ refreshSignal?: number; variant?: "inline" | "menu" }> = ({ refreshSignal, variant = "inline" }) => {
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
    ? `Your AI usage today: ${used.toLocaleString()} / ${limit.toLocaleString()} tokens (${pct}%). Resets at midnight UTC.`
    : `Your AI usage today: ${used.toLocaleString()} tokens. Resets at midnight UTC.`

  if (variant === "menu") {
    return (
      <div className="px-2 pb-2 pt-1.5" title={title} data-ai-usage="">
        <p className={`text-meta tabular-nums ${near ? "text-warning-ink" : "text-ink-2"}`}>
          {fmtTokens(used)}
          {hasCap ? ` of ${fmtTokens(limit)}` : ""} today
        </p>
        {hasCap ? (
          <span className="mt-1.5 block h-1 w-16 overflow-hidden rounded-full bg-press" aria-hidden>
            <span
              className="block h-full origin-left rounded-full bg-[linear-gradient(90deg,var(--progress-from),var(--progress-to))]"
              style={{ transform: `scaleX(${pct / 100})` }}
            />
          </span>
        ) : null}
      </div>
    )
  }

  return (
    <span
      className={`hidden sm:inline-flex items-center px-1.5 text-2xs tabular-nums ${
        near ? "text-warning-ink" : "text-muted-foreground"
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

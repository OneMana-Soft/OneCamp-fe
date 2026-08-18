"use client"

/**
 * WhileYouWereAwayCard — "what did I miss?", answered on the home screen.
 *
 * WHY THIS EXISTS
 * ---------------
 * The first question anyone has when they open a work tool is "what happened
 * while I was gone?", and until now home answered it with four counters: 38
 * notifications, 12 unread channels. A counter is inbox debt — it states the
 * size of the problem and offers no way through it, so the honest reaction is
 * dread, and dread makes people avoid the app rather than open it. Worse, the
 * only way to actually find out what happened was to visit each busy
 * conversation and press "Catch me up" in each one.
 *
 * The backend has been able to answer this across the whole workspace the
 * entire time. `POST /ai/catch-up` accepts `scope_type: "workspace"`, which
 * routes to FetchUnreadAcrossScopes: ONE permission-filtered OpenSearch query
 * over every channel, DM, group and project the member can see, capped at the
 * most recent 80 items, then ONE LLM call. Nothing in the frontend ever sent
 * that scope — `CatchUpScope` even declares "workspace" and uses it as the
 * default in the service's EMPTY value. This card is the missing caller.
 *
 * COST, WHICH IS WHY THE CARD IS SHAPED LIKE THIS
 * -----------------------------------------------
 * The recap costs an LLM call, so it must never fire just because someone
 * loaded a page. Two consequences:
 *
 *  1. The resting state is free. The unread total is computed from the sidebar
 *     already in Redux — the exact same numbers the stat tiles next to it
 *     already display — so the card can state the size of the backlog with no
 *     request at all.
 *  2. The recap is generated on an explicit click, and only then.
 *
 * So the card reframes numbers the user was already being shown, from "38
 * unread, good luck" into "38 unread — want the summary?". Same data, one
 * button, and the payout arrives in one call instead of twelve visits.
 *
 * It is deliberately NOT a streak, a badge, or another red dot. Those raise
 * engagement by adding pressure; this earns the open by removing work. In a
 * shared workspace a streak would also reward showing up over doing good work
 * and would punish weekends and leave.
 */

import React, { useCallback, useEffect, useMemo, useState } from "react"
import { useSelector } from "react-redux"
import type { RootState } from "@/store/store"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import MarkdownMessage from "@/components/ai/MarkdownMessage"
import { useCatchUp } from "@/services/aiService"
import { useFetchOnlyOnce } from "@/hooks/useFetch"
import { GetEndpointUrl } from "@/services/endPoints"
import { isTTLActive, setTTL } from "@/lib/utils/helpers/ttlStorage"
import { Sparkles, X, RefreshCw } from "@/lib/icons"
import { withAI } from "@/components/common/withFeature"

// One dismissal key, not one per scope: this card is about the workspace, so
// there is a single thing to dismiss. TTL matches the per-conversation
// CatchMeUpBanner so the two surfaces forget at the same rate.
const DISMISS_PREFIX = "away_recap_dismissed_"
const DISMISS_ID = "home"
const DISMISS_TTL_MS = 60 * 60 * 1000

/**
 * Below this many unread messages there is no "while you were away" moment —
 * you were not away, you went to lunch. Same threshold as CatchMeUpBanner so a
 * member does not see the two surfaces disagree about what counts as a backlog.
 */
const DEFAULT_THRESHOLD = 10

interface AIStatus {
  data?: { enabled?: boolean }
}

function WhileYouWereAwayCard({
  threshold = DEFAULT_THRESHOLD,
}: {
  threshold?: number
}) {
  const channels = useSelector((s: RootState) => s.users.userSidebar.userChannels)
  const chats = useSelector((s: RootState) => s.users.userSidebar.userChats)
  // /ai/status is an in-memory config read on the server (no DB, no model
  // call), and SWR dedupes it across the app — so gating on it is effectively
  // free and stops us offering a button that would silently do nothing when an
  // admin has AI switched off.
  const { data: aiStatus, isLoading: statusLoading } =
    useFetchOnlyOnce<AIStatus>(GetEndpointUrl.AIStatus)
  const { catchUp, isLoading } = useCatchUp()

  const [dismissed, setDismissed] = useState(false)
  const [summary, setSummary] = useState("")
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (isTTLActive(DISMISS_PREFIX, DISMISS_ID, DISMISS_TTL_MS)) setDismissed(true)
  }, [])

  // The whole resting state, derived from data already in the store. Counting
  // conversations as well as messages matters: "38 unread" is a number, "38
  // across 12 conversations" is why you do not want to read them one by one.
  const { unreadTotal, conversationCount } = useMemo(() => {
    let total = 0
    let convos = 0
    for (const c of channels || []) {
      const n = c.unread_post_count || 0
      if (n > 0) {
        total += n
        convos += 1
      }
    }
    for (const c of chats || []) {
      const n = c.dm_unread || 0
      if (n > 0) {
        total += n
        convos += 1
      }
    }
    return { unreadTotal: total, conversationCount: convos }
  }, [channels, chats])

  const handleDismiss = useCallback(() => {
    setDismissed(true)
    setTTL(DISMISS_PREFIX, DISMISS_ID, DISMISS_TTL_MS)
  }, [])

  const handleCatchUp = useCallback(async () => {
    setError(null)
    try {
      const result = await catchUp({ scope_type: "workspace" })
      if (!result || !result.enabled) {
        // AI went off between the status read and the click. Nothing to offer.
        setDismissed(true)
        return
      }
      if (!result.has_unread) {
        // The sidebar counts and the search index disagreed — the index is the
        // authority on what the recap can actually cover, so believe it and
        // stand down quietly rather than showing an empty recap.
        setDismissed(true)
        setTTL(DISMISS_PREFIX, DISMISS_ID, DISMISS_TTL_MS)
        return
      }
      setSummary(result.summary)
    } catch (err: unknown) {
      const e = err as { response?: { data?: { err?: string } }; message?: string }
      setError(
        e?.response?.data?.err ||
          e?.message ||
          "Could not build your recap. Please try again.",
      )
    }
  }, [catchUp])

  // Hide until we know AI is on, so the button never appears and then vanishes.
  if (statusLoading) return null
  if (!aiStatus?.data?.enabled) return null
  if (dismissed) return null
  // Genuinely caught up, or a trivial backlog: no card. Consistent with the
  // other two home cards, which also self-hide rather than say "nothing here".
  if (unreadTotal < threshold) return null

  return (
    <section
      className="rounded-xl border border-border/60 bg-card/40 overflow-hidden"
      aria-labelledby="away-recap-heading"
    >
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border/50">
        <div className="bg-primary/10 p-1 rounded-md">
          <Sparkles className="h-3.5 w-3.5 text-primary" />
        </div>
        <h2 id="away-recap-heading" className="text-sm font-semibold tracking-tight">
          While you were away
        </h2>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Dismiss the recap"
          onClick={handleDismiss}
          className="ml-auto h-7 w-7 text-muted-foreground hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>

      <div className="px-4 py-3.5">
        {summary ? (
          <MarkdownMessage content={summary} className="text-sm" />
        ) : isLoading ? (
          // Shaped like the recap that replaces it, so the card does not resize
          // when the text lands.
          <div role="status" aria-label="Building your recap" className="space-y-2">
            <Skeleton className="h-3 w-1/3 rounded" />
            <Skeleton className="h-2.5 w-11/12 rounded" />
            <Skeleton className="h-2.5 w-4/5 rounded" />
            <Skeleton className="h-2.5 w-2/3 rounded" />
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            <p className="flex-1 min-w-0 text-sm text-muted-foreground">
              <span className="font-medium text-foreground">
                {unreadTotal} unread {unreadTotal === 1 ? "message" : "messages"}
              </span>{" "}
              across {conversationCount}{" "}
              {conversationCount === 1 ? "conversation" : "conversations"}.
            </p>
            <Button size="sm" onClick={handleCatchUp} className="shrink-0 gap-1.5">
              <Sparkles className="h-3.5 w-3.5" />
              Catch me up
            </Button>
          </div>
        )}

        {error && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <p className="flex-1 min-w-0 text-xs text-destructive">{error}</p>
            <Button
              variant="outline"
              size="sm"
              onClick={handleCatchUp}
              disabled={isLoading}
              className="shrink-0 gap-1.5"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Try again
            </Button>
          </div>
        )}
      </div>
    </section>
  )
}

// Gated on the AI subsystem: hidden entirely on the AI-free v1 edition, and on v2
// whenever an admin has switched AI off. Wrapping the export covers every place this
// is rendered, desktop and mobile, instead of asking each of them to remember.
export default withAI(WhileYouWereAwayCard)

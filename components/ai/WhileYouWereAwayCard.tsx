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

import { useCallback, useMemo, useState } from "react"
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
import { ReadBoundary } from "@/components/ai/ReadBoundary"
import { FEATURE_AI, useFeatureState } from "@/hooks/useClientConfig"

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
  // Whether this server has AI at all: unknown while its config is on the way.
  const ai = useFeatureState(FEATURE_AI)
  // /ai/status is an in-memory config read on the server (no DB, no model
  // call), and SWR dedupes it across the app — so gating on it is effectively
  // free and stops us offering a button that would silently do nothing when an
  // admin has AI switched off.
  const { data: aiStatus, isLoading: statusLoading } =
    useFetchOnlyOnce<AIStatus>(ai === "available" ? GetEndpointUrl.AIStatus : "")
  const { catchUp, isLoading } = useCatchUp()

  // Read before the first render: it used to be read after it, so a recap
  // dismissed an hour ago showed for a moment and then left, and Home moved
  // twice. Home renders only in the browser, after the session is known.
  const [dismissed, setDismissed] = useState(() => typeof window !== "undefined" && isTTLActive(DISMISS_PREFIX, DISMISS_ID, DISMISS_TTL_MS))
  const [summary, setSummary] = useState("")
  // Held beside the summary, not derived from it: the recap and the boundary it
  // was produced under are one answer, and they must appear and clear together.
  const [scopesAllowed, setScopesAllowed] = useState<number | undefined>(undefined)
  const [error, setError] = useState<string | null>(null)

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
      setScopesAllowed(result.scopes_allowed)
    } catch (err: unknown) {
      const e = err as { response?: { data?: { err?: string } }; message?: string }
      setError(
        e?.response?.data?.err ||
          e?.message ||
          "Could not build your recap. Please try again.",
      )
    }
  }, [catchUp])

  if (ai === "unavailable" || dismissed) return null
  // Genuinely caught up, or a trivial backlog: no card. Consistent with the
  // other two home cards, which also self-hide rather than say "nothing here".
  // Known at once from the sidebar, so it is decided before anything loads.
  if (unreadTotal < threshold) return null
  // There will very likely be a card: hold its place while AI is confirmed,
  // rather than appear late and push Home down.
  if (ai === "unknown" || statusLoading) return <AwaySkeleton />
  if (!aiStatus?.data?.enabled) return null

  // H11: a compact row, the last of "What needs me now". The recap opens
  // under it as a sunken block, and costs its one LLM call only on the click.
  const open = Boolean(summary) || isLoading || Boolean(error)
  return (
    <section aria-labelledby="away-recap-heading" data-away-row="">
      <div className="hub-row" data-density="compact">
        <span />
        <span className="hub-row-lead">
          <AwayMark />
        </span>
        {/* Short enough for its column, and never cut: beside Catch me up
            it read "12 unread messages across 3 conversa…" (QA SH-19). */}
        <span id="away-recap-heading" className="min-w-0 line-clamp-2 text-ui font-book">
          {unreadTotal} unread in {conversationCount} {conversationCount === 1 ? "conversation" : "conversations"}
        </span>
        <span className="flex items-center gap-1">
          {!summary ? (
            <Button variant="secondary" size="xs" onClick={handleCatchUp} disabled={isLoading}>
              <Sparkles className="size-3" />
              Catch me up
            </Button>
          ) : null}
          <Button variant="ghost" size="icon-xs" aria-label="Dismiss the recap" onClick={handleDismiss}>
            <X className="size-3.5" />
          </Button>
        </span>
      </div>
      {open ? (
        <div className="hub-pop ml-[48px] mt-1 rounded-lg bg-sunken px-3.5 py-3" data-away-recap="">
          <p className="mb-1.5 text-meta font-semibold text-agent-ink">While you were away</p>
          {summary ? (
            <div className="hub-stream-chunk">
              <MarkdownMessage content={summary} className="text-ui" />
              <ReadBoundary scope="workspace" scopesAllowed={scopesAllowed} className="mt-3 border-t border-line pt-2.5" />
            </div>
          ) : isLoading ? (
            <p role="status" className="hub-shimmer text-ui">
              Reading {conversationCount} {conversationCount === 1 ? "conversation" : "conversations"}…
            </p>
          ) : null}
          {error ? (
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <p className="min-w-0 flex-1 text-meta text-danger-ink"><span>Couldn&apos;t summarise · </span><span>{error}</span></p>
              <Button variant="ghost" size="xs" onClick={handleCatchUp} disabled={isLoading}>
                <RefreshCw className="size-3" />
                Try again
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  )
}

/** The agent square with a spark, 24px. */
function AwayMark() {
  return (
    <span aria-hidden className="avatar-agent grid size-6 place-items-center rounded-[32%] text-white">
      <Sparkles className="size-3.5" />
    </span>
  )
}

// Gated on the AI subsystem inside (useFeatureState), not by withAI: the wrapper
// rendered nothing while the config loaded, and the card then arrived late. The
// AI-free v1 edition doesn't carry this file; on v2 with AI off it renders nothing.
export default WhileYouWereAwayCard

/** The row's own shape while AI is confirmed. */
function AwaySkeleton() {
  return (
    <div className="hub-row" data-density="compact" role="status" aria-label="Loading your recap">
      <span />
      <span className="hub-row-lead">
        <Skeleton className="size-6 rounded-[32%]" />
      </span>
      <Skeleton className="h-3 w-3/5 rounded" />
      <Skeleton className="h-6 w-24 rounded-sm" />
    </div>
  )
}

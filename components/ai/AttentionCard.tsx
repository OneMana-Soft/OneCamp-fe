"use client"

/**
 * AttentionCard — "What needs me now" on the home screen.
 *
 * The cross-surface arm of the workspace AI: one prioritized list of
 * everything that requires the member's action, drawn from every OneCamp
 * surface at once (pending approvals, overdue tasks, overdue commitments,
 * open questions, and upcoming calendar items). The single thing no
 * single-surface tool can do, surfaced as one calm queue so the member stops
 * checking five places.
 *
 * Read-only: each row deep-links to its source. Self-hides when AI is off or
 * there is nothing that needs the member, so it never adds dashboard noise.
 */

import React, { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { useDispatch } from "react-redux"
import { getAttention, ATTENTION_KEY, AttentionResult, AttentionItem } from "@/services/memoryService"
import { forgetShared, peekShared } from "@/lib/utils/sharedRequest"
import { approvePendingAction, rejectPendingAction } from "@/services/pendingActionService"
import { removePendingAction } from "@/store/slice/pendingActionSlice"
import { useToast } from "@/hooks/use-toast"
import {
  Sparkles,
  Inbox,
  CircleCheck,
  CheckCircle2,
  HelpCircle,
  Calendar,
  Clock,
  ArrowUpRight,
  Check,
  X,
  Loader2,
} from "@/lib/icons"
import { withAI } from "@/components/common/withFeature"
import { FEATURE_AI, useFeatureState } from "@/hooks/useClientConfig"
import { Skeleton } from "@/components/ui/skeleton"
import { Tile } from "@/components/ui/graphics/Tile"
import type { CampHue } from "@/lib/campHue"
import { dueLabel } from "@/lib/utils/dueLabel"

// Per-source icon so each row's origin is recognisable at a glance, on a tile
// of the source's camp hue. The hue names the kind of thing, never its state:
// lateness is said in words, in red, on the row itself (every task used to
// carry a red icon whether or not it was late, which read as an error).
const SOURCE_ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  approval: Inbox,
  task: CircleCheck,
  commitment: CheckCircle2,
  question: HelpCircle,
  calendar: Calendar,
}
const SOURCE_HUE: Record<string, CampHue> = {
  approval: "sun",
  task: "moss",
  commitment: "dusk",
  question: "berry",
  calendar: "sky",
}

function AttentionCard() {
  const router = useRouter()
  const dispatch = useDispatch()
  const { toast } = useToast()
  // Start from the answer kept from a moment ago, if any, so coming back to
  // Home shows the list at once instead of a placeholder.
  const [data, setData] = useState<AttentionResult | null>(() => peekShared<AttentionResult>(ATTENTION_KEY) ?? null)
  const [loading, setLoading] = useState(() => peekShared(ATTENTION_KEY) === undefined)
  // Per-approval in-flight state, keyed by pending-action id (ref_id).
  const [busy, setBusy] = useState<Record<string, boolean>>({})

  useEffect(() => {
    let alive = true
    // One retry: this fires on mount right after the dashboard loads, so a
    // transient blip (a request racing the auth token on a fresh session, a
    // cold backend) shouldn't hide the card for the rest of the session with
    // no way to recover. Only give up (treat as "AI off") after a retry.
    const load = (attempt: number) => {
      getAttention()
        .then((res) => {
          if (alive) {
            setData(res)
            setLoading(false)
          }
        })
        .catch(() => {
          if (!alive) return
          if (attempt < 1) {
            setTimeout(() => alive && load(attempt + 1), 1200)
            return
          }
          setData({ enabled: false, items: [], counts: {} })
          setLoading(false)
        })
    }
    load(0)
    return () => {
      alive = false
    }
  }, [])

  // Drop a resolved item from the list and keep the per-source counts honest.
  const removeItem = (it: AttentionItem) => {
    forgetShared(ATTENTION_KEY)
    setData((prev) => {
      if (!prev) return prev
      const items = prev.items.filter((x) => x !== it)
      const counts = { ...prev.counts }
      if (counts[it.source]) counts[it.source] -= 1
      return { ...prev, items, counts }
    })
  }

  const handleApprove = async (it: AttentionItem) => {
    if (!it.ref_id || busy[it.ref_id]) return
    setBusy((b) => ({ ...b, [it.ref_id as string]: true }))
    try {
      const resolved = await approvePendingAction(it.ref_id)
      dispatch(removePendingAction(it.ref_id))
      if (resolved?.status === "failed") {
        toast({ title: "Action failed", description: resolved.error || "Could not complete.", variant: "destructive" })
      } else {
        toast({ title: "Done", description: resolved?.result || it.title })
      }
      removeItem(it)
    } catch {
      toast({ title: "Error", description: "Could not process the approval. Please try again.", variant: "destructive" })
    } finally {
      setBusy((b) => ({ ...b, [it.ref_id as string]: false }))
    }
  }

  const handleDismiss = async (it: AttentionItem) => {
    if (!it.ref_id || busy[it.ref_id]) return
    setBusy((b) => ({ ...b, [it.ref_id as string]: true }))
    try {
      await rejectPendingAction(it.ref_id)
      dispatch(removePendingAction(it.ref_id))
      toast({ title: "Dismissed", description: "I won't run that." })
      removeItem(it)
    } catch {
      toast({ title: "Error", description: "Could not dismiss. Please try again.", variant: "destructive" })
    } finally {
      setBusy((b) => ({ ...b, [it.ref_id as string]: false }))
    }
  }

  // While loading, hold the card's place with its own chrome and one row.
  // Returning nothing here and then appearing pushed the whole Home page down
  // under the reader's eyes (layout shift 0.18 on the demo). This card only
  // mounts where AI is available, so an AI-free install never sees the frame.
  if (loading) return <AttentionCardSkeleton />
  if (!data || !data.enabled) return null
  // Guard the collection defensively: the service normalizes it to an array,
  // but never assume — a null/omitted items slice must hide the card, not
  // throw during render.
  const items = Array.isArray(data.items) ? data.items : []
  // EMPTY IS AN ANSWER, not an absence. The card used to vanish, so a day with
  // nothing to do looked exactly like a card that failed to load, and clearing
  // the last approval made the whole thing disappear under the reader's
  // cursor. Saying "nothing needs you" is the moment the page is finished.
  if (items.length === 0) {
    return (
      <div className="ai-panel" role="status">
        <div className="ai-panel-head">
          <Tile hue="moss" size="sm"><CircleCheck strokeWidth={1.75} /></Tile>
          <h2 className="text-sm font-medium text-foreground">Nothing needs you right now</h2>
        </div>
        <p className="px-4 pb-3 text-xs text-muted-foreground">
          Approvals, overdue work and questions waiting on you land here.
        </p>
      </div>
    )
  }

  // An approval has no navigable destination (it's acted on inline where it
  // was raised); every other source deep-links to its surface.
  const go = (it: AttentionItem) => {
    if (!it.url) return
    if (it.source === "calendar") {
      window.open(it.url, "_blank", "noopener,noreferrer")
      return
    }
    router.push(it.url)
  }

  return (
    <div className="ai-panel">
      <div className="ai-panel-head">
        <Tile hue="sun" size="sm"><Sparkles strokeWidth={1.75} /></Tile>
        <h2 className="text-sm font-medium text-foreground">What needs me now</h2>
        <span className="text-xs tabular-nums text-muted-foreground">{items.length}</span>
      </div>

      <ul className="divide-y divide-border/40">
        {items.map((it, i) => {
          const Icon = SOURCE_ICON[it.source] || Sparkles
          const hue = SOURCE_HUE[it.source] ?? "lake"
          const clickable = !!it.url
          const overdue = it.kind.toLowerCase().startsWith("overdue")
          // Said once and in the reader's zone when the exact moment is known;
          // older backends send only kind and subtitle, which still render.
          const due = dueLabel(it.due_time, new Date())
          const isApproval = it.source === "approval" && !!it.ref_id
          const rowBusy = it.ref_id ? !!busy[it.ref_id] : false
          const Row = (
            <span className="w-full text-left flex items-start gap-2.5 px-4 py-2.5 hover:bg-accent/40 transition-colors">
              <Tile hue={hue} size="sm" className="-mt-0.5"><Icon /></Tile>
              <span className="min-w-0 flex-1">
                <span className="block text-sm leading-snug truncate">{it.title}</span>
                <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-0.5">
                  <span
                    className={`inline-flex items-center gap-1 text-2xs ${
                      overdue ? "text-danger-ink font-medium" : "text-muted-foreground"
                    }`}
                  >
                    {overdue && <Clock className="h-3 w-3" />}
                    {due || it.kind}
                  </span>
                  {(due ? it.context : it.subtitle) && (
                    <span className="text-2xs text-muted-foreground/80 truncate max-w-[220px]">
                      {due ? it.context : it.subtitle}
                    </span>
                  )}
                </span>
              </span>
              {clickable && <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground/50 mt-0.5" />}
            </span>
          )
          // Approval rows are acted on inline (Approve/Dismiss) — runs as the
          // user with their permissions, reusing the durable approval service.
          if (isApproval) {
            return (
              <li key={`${it.source}-${it.ref_id || i}`}>
                <div className="flex items-start gap-1.5 px-4 py-2.5">
                  <Tile hue="sun" size="sm" className="-mt-0.5"><Inbox /></Tile>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm leading-snug">{it.title}</span>
                    <span className="text-2xs text-muted-foreground">{it.subtitle || it.kind}</span>
                  </span>
                  <span className="flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      disabled={rowBusy}
                      onClick={() => handleDismiss(it)}
                      title="Dismiss"
                      className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-50"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      disabled={rowBusy}
                      onClick={() => handleApprove(it)}
                      title="Approve"
                      className="inline-flex items-center gap-1 rounded-md bg-primary px-2 py-1 text-2xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                    >
                      {rowBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                      Approve
                    </button>
                  </span>
                </div>
              </li>
            )
          }
          return (
            <li key={`${it.source}-${it.ref_id || it.url || i}`}>
              {clickable ? (
                <button type="button" onClick={() => go(it)} className="block w-full">
                  {Row}
                </button>
              ) : (
                <div className="block w-full cursor-default">{Row}</div>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}

// Gated on the AI subsystem: hidden entirely on the AI-free v1 edition, and on v2
// whenever an admin has switched AI off. Wrapping the export covers every place this
// is rendered, desktop and mobile, instead of asking each of them to remember.
//
// While the server's config is still on its way, whether AI is on is unknown,
// and the gate rendered nothing: the card then arrived and pushed everything
// under it down (most of Home's layout shift on the demo). It holds its place
// in that moment instead; only a server that turns out to have AI off sees the
// placeholder go.
const GatedAttentionCard = withAI(AttentionCard)

function AttentionCardSlot() {
  const ai = useFeatureState(FEATURE_AI)
  if (ai === "unknown") return <AttentionCardSkeleton />
  return <GatedAttentionCard />
}

export default AttentionCardSlot

function AttentionCardSkeleton() {
  return (
    <div className="ai-panel" role="status" aria-label="Loading what needs you">
      <div className="ai-panel-head">
        <Tile hue="sun" size="sm"><Sparkles strokeWidth={1.75} /></Tile>
        <h2 className="text-sm font-medium text-foreground">What needs me now</h2>
      </div>
      <div className="flex items-start gap-2.5 px-4 py-2.5">
        <Skeleton className="-mt-0.5 size-6 rounded-md" />
        <span className="flex-1 space-y-1.5">
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-3 w-1/3" />
        </span>
      </div>
    </div>
  )
}

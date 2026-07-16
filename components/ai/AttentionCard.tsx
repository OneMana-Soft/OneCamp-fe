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
import { getAttention, AttentionResult, AttentionItem } from "@/services/memoryService"
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

// Per-source icon + tint so each row's origin is recognizable at a glance.
const SOURCE_ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  approval: Inbox,
  task: CircleCheck,
  commitment: CheckCircle2,
  question: HelpCircle,
  calendar: Calendar,
}
const SOURCE_TINT: Record<string, string> = {
  approval: "text-violet-600 dark:text-violet-400",
  task: "text-red-600 dark:text-red-400",
  commitment: "text-blue-600 dark:text-blue-400",
  question: "text-amber-600 dark:text-amber-400",
  calendar: "text-emerald-600 dark:text-emerald-400",
}

export default function AttentionCard() {
  const router = useRouter()
  const dispatch = useDispatch()
  const { toast } = useToast()
  const [data, setData] = useState<AttentionResult | null>(null)
  const [loading, setLoading] = useState(true)
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

  // No skeleton flash for a non-critical card; hide until there's signal.
  if (loading) return null
  if (!data || !data.enabled) return null
  // Guard the collection defensively: the service normalizes it to an array,
  // but never assume — a null/omitted items slice must hide the card, not
  // throw during render.
  const items = Array.isArray(data.items) ? data.items : []
  if (items.length === 0) return null

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
    <div className="rounded-xl border border-border/60 bg-card/40 overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border/50">
        <div className="bg-primary/10 p-1 rounded-md">
          <Sparkles className="h-3.5 w-3.5 text-primary" />
        </div>
        <h2 className="text-sm font-semibold tracking-tight">What needs me now</h2>
        <span className="text-xs text-muted-foreground">{items.length}</span>
      </div>

      <ul className="divide-y divide-border/40">
        {items.map((it, i) => {
          const Icon = SOURCE_ICON[it.source] || Sparkles
          const tint = SOURCE_TINT[it.source] || "text-muted-foreground"
          const clickable = !!it.url
          const overdue = it.kind.toLowerCase().startsWith("overdue")
          const isApproval = it.source === "approval" && !!it.ref_id
          const rowBusy = it.ref_id ? !!busy[it.ref_id] : false
          const Row = (
            <span className="w-full text-left flex items-start gap-2.5 px-4 py-2.5 hover:bg-accent/40 transition-colors">
              <Icon className={`h-4 w-4 mt-0.5 shrink-0 ${tint}`} />
              <span className="min-w-0 flex-1">
                <span className="block text-sm leading-snug truncate">{it.title}</span>
                <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-0.5">
                  <span
                    className={`inline-flex items-center gap-1 text-[11px] ${
                      overdue ? "text-red-600 dark:text-red-400 font-medium" : "text-muted-foreground"
                    }`}
                  >
                    {overdue && <Clock className="h-3 w-3" />}
                    {it.kind}
                  </span>
                  {it.subtitle && (
                    <span className="text-[11px] text-muted-foreground/80 truncate max-w-[220px]">
                      {it.subtitle}
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
                  <Inbox className={`h-4 w-4 mt-0.5 shrink-0 ${tint}`} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm leading-snug">{it.title}</span>
                    <span className="text-[11px] text-muted-foreground">{it.subtitle || it.kind}</span>
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
                      className="inline-flex items-center gap-1 rounded-md bg-primary px-2 py-1 text-[11px] font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
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

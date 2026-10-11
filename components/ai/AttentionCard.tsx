"use client"

/**
 * The AI's part of "What needs me now" on Home (hub.md H8, H9).
 *
 * The cross-surface arm of the workspace AI: agent requests waiting for your
 * yes, and what it found overdue or open across OneCamp (tasks, commitments,
 * questions). It adds those to the rows Home builds without AI (mentions, DMs,
 * tasks due: components/home/useHomeNeeds) and draws them all in the shared
 * section (components/home/NeedsMeSection), so the queue is one list with one
 * row anatomy whether AI is on or not.
 *
 * Agent requests are approved or dismissed in place, as you, through the
 * durable approval service; the outcome is said on the row (an approval that
 * fails keeps its row and names the reason), never only in a toast.
 */

import React, { useEffect, useState, type ReactNode } from "react"
import { useDispatch } from "react-redux"
import { getAttention, ATTENTION_KEY, type AttentionResult, type AttentionItem } from "@/services/memoryService"
import { forgetShared, peekShared } from "@/lib/utils/sharedRequest"
import { approvePendingAction, rejectPendingAction } from "@/services/pendingActionService"
import { removePendingAction } from "@/store/slice/pendingActionSlice"
import { withAI } from "@/components/common/withFeature"
import { dueLabel } from "@/lib/utils/dueLabel"
import { NeedsMeSection } from "@/components/home/NeedsMeSection"
import { SHARED_ACTIONS } from "@/components/home/needsActions"
import { mergeNeeds, type NeedsItem } from "@/components/home/needsMe"

/** The AI's attention items as Home's rows. Calendar items are the agenda's. Pure. */
export function attentionToNeeds(items: AttentionItem[], now: Date): NeedsItem[] {
  const out: NeedsItem[] = []
  items.forEach((it, i) => {
    const id = `ai:${it.source}:${it.ref_id || it.url || i}`
    if (it.source === "approval" && it.ref_id) {
      out.push({ id, kind: "agent", title: it.title, context: it.subtitle || undefined, refId: it.ref_id })
      return
    }
    if (it.source === "task" || it.source === "commitment") {
      const overdue = it.kind.toLowerCase().startsWith("overdue") || (it.due_time ? Date.parse(it.due_time) < now.getTime() : false)
      out.push({
        id,
        kind: "due",
        title: it.title,
        status: "todo",
        due: dueLabel(it.due_time, now) || it.kind,
        overdue,
        project: it.context ? { id: it.context, name: it.context } : undefined,
        href: it.url,
        taskUuid: it.source === "task" ? it.ref_id : undefined,
      })
      return
    }
    if (it.source === "question") {
      out.push({ id, kind: "reply", title: it.title, quote: it.subtitle, href: it.url })
    }
  })
  return out
}

interface AttentionCardProps {
  /** The rows Home has without AI, which this adds to. */
  base?: NeedsItem[]
  baseLoading?: boolean
  footer?: ReactNode
  noChannels?: ReactNode
  className?: string
}

function AttentionCard({ base = [], baseLoading = false, footer, noChannels, className }: AttentionCardProps) {
  const dispatch = useDispatch()
  // Start from the answer kept from a moment ago, if any, so coming back to
  // Home shows the list at once instead of a placeholder.
  const [data, setData] = useState<AttentionResult | null>(() => peekShared<AttentionResult>(ATTENTION_KEY) ?? null)
  const [loading, setLoading] = useState(() => peekShared(ATTENTION_KEY) === undefined)
  const [now] = useState(() => new Date())

  useEffect(() => {
    let alive = true
    // One retry: this fires right after the dashboard loads, so a transient
    // blip (a request racing the auth token, a cold backend) shouldn't hide
    // the AI's rows for the rest of the session.
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

  const forget = () => forgetShared(ATTENTION_KEY)

  const onApprove = async (item: NeedsItem) => {
    if (!item.refId) throw new Error("the request is gone")
    const resolved = await approvePendingAction(item.refId)
    dispatch(removePendingAction(item.refId))
    forget()
    if (resolved?.status === "failed") throw new Error(resolved.error || "it could not be completed")
  }
  const onDismiss = async (item: NeedsItem) => {
    if (!item.refId) return
    await rejectPendingAction(item.refId)
    dispatch(removePendingAction(item.refId))
    forget()
  }

  // Guard the collection: a null items slice must not throw during render.
  const aiItems = data?.enabled && Array.isArray(data.items) ? attentionToNeeds(data.items, now) : []
  // The AI's rows first where both name one task (its due phrase is exact).
  const items = mergeNeeds(aiItems, base)

  return (
    <NeedsMeSection
      items={items}
      loading={(loading && base.length === 0) || baseLoading}
      footer={footer}
      noChannels={noChannels}
      className={className}
      onApprove={onApprove}
      onDismiss={onDismiss}
      {...SHARED_ACTIONS}
    />
  )
}

// Gated on the AI subsystem: hidden on the AI-free edition and wherever an
// admin has switched AI off. Home renders it only when AI is on, and draws the
// same section from its own rows otherwise (components/home/NeedsMe).
export default withAI(AttentionCard)

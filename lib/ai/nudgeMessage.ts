import type { Dispatch } from "@reduxjs/toolkit"

import type { Nudge } from "@/services/nudgeService"
import { clearAllNudges, nudgesCleared, setOpenCount, upsertNudge } from "@/store/slice/nudgeSlice"
import { inboxArrived } from "@/lib/activity/inboxArrived"
import { recountInbox } from "@/services/unreadCache"

/** A OneCamp AI nudge event on the person's own topic (models/mqtt MqttNudge). */
interface NudgeMessage {
  action?: string
  nudge_id?: string
  /** The nudges a "cleared" closes: one event per person per pass. */
  nudge_ids?: string[]
  kind?: Nudge["kind"]
  title?: string
  body?: string
  cta_url?: string
  cta_text?: string
  priority?: number
  open_count?: number
  created_at?: string
}

/**
 * Applies a nudge event to the store. "new" carries a nudge in full: listed,
 * with its dot when it's urgent (the Inbox badge counts an urgent nudge raised
 * since the last look, V-577), and read in as a live item is (inboxArrived).
 * "cleared" names the nudges that closed (resolved, superseded, or dismissed
 * in another tab) in nudge_ids: those go and no other; with none it is the
 * count alone (Clear all: 0). Either changes what the badge counts, so it reads the
 * server's count again.
 */
export function applyNudgeMessage(dispatch: Dispatch, data: NudgeMessage | null | undefined): void {
  if (!data) return
  const count = typeof data.open_count === "number" ? data.open_count : undefined
  if (data.action === "new" && data.nudge_id) {
    const at = data.created_at ?? new Date().toISOString()
    const priority = data.priority ?? 0
    dispatch(
      upsertNudge({
        id: data.nudge_id,
        kind: data.kind ?? "generic",
        title: data.title ?? "",
        body: data.body ?? "",
        cta_url: data.cta_url,
        cta_text: data.cta_text,
        status: "open",
        priority,
        created_at: at,
        updated_at: at,
        unread: priority > 0,
      }),
    )
    if (count !== undefined) dispatch(setOpenCount(count))
    inboxArrived()
    return
  }
  if (data.action !== "cleared") return
  const ids = Array.isArray(data.nudge_ids) ? data.nudge_ids.filter((id): id is string => typeof id === "string") : []
  if (ids.length > 0) dispatch(nudgesCleared({ ids, openCount: count }))
  else if (count === 0) dispatch(clearAllNudges())
  else if (count !== undefined) dispatch(setOpenCount(count))
  recountInbox()
}

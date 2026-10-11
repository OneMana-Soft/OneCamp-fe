"use client"

import { useCallback, useEffect, useState } from "react"

import type { RowProp } from "@/components/task/GroupedTaskList"
import type { ShowCompleted } from "@/components/task/WorkToolbar"
import type { Grouping } from "@/lib/tasks/grouping"

export interface ListDisplay {
  grouping: Grouping
  props: RowProp[]
  showCompleted: ShowCompleted
}

const KEY = (scope: string) => `oc_list_display:${scope}`

function read(scope: string, defaults: ListDisplay): ListDisplay {
  try {
    const raw = window.localStorage.getItem(KEY(scope))
    if (!raw) return defaults
    const v = JSON.parse(raw) as Partial<ListDisplay>
    return { grouping: v.grouping ?? defaults.grouping, props: Array.isArray(v.props) ? v.props : defaults.props, showCompleted: v.showCompleted ?? defaults.showCompleted }
  } catch {
    return defaults
  }
}

/**
 * How a list is arranged (work.md W11's Display): its grouping, the
 * properties its rows show and how much finished work it keeps. Per person
 * and per list, in this browser: a convenience, never shared state.
 */
export function useListDisplay(scope: string, defaults: ListDisplay) {
  const [display, setDisplay] = useState<ListDisplay>(defaults)
  // Read after the first paint, so the server's render and the first client
  // one agree.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => setDisplay(read(scope, defaults)), [scope])
  const set = useCallback(
    (patch: Partial<ListDisplay>) =>
      setDisplay((d) => {
        const next = { ...d, ...patch }
        try {
          window.localStorage.setItem(KEY(scope), JSON.stringify(next))
        } catch {
          /* private mode */
        }
        return next
      }),
    [scope],
  )
  const reset = useCallback(() => {
    try {
      window.localStorage.removeItem(KEY(scope))
    } catch {
      /* private mode */
    }
    setDisplay(defaults)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope])
  return { display, set, reset }
}

/** Whether a finished task stays on a list showing `show` finished work (finished in the last 7 days, by when it entered its status). */
export function keepsFinished(task: { task_status?: string; task_status_since?: string }, show: ShowCompleted, now = Date.now()): boolean {
  if (task.task_status !== "done" && task.task_status !== "canceled") return true
  if (show === "all") return true
  if (show === "none") return false
  const since = task.task_status_since ? Date.parse(task.task_status_since) : NaN
  return Number.isNaN(since) || now - since <= 7 * 86_400_000
}

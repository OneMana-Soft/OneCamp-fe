"use client"

import { useCallback, useMemo, useState } from "react"
import axiosInstance from "@/lib/axiosInstance"
import { GetEndpointUrl } from "@/services/endPoints"
import type { TaskActivityInterface } from "@/types/task"

/** History lines asked for at a time. */
export const EARLIER_PAGE = 50

interface Earlier {
  task: string
  /** Older lines than the task's details carry, oldest to newest. */
  lines: TaskActivityInterface[]
  /** What the last page said about lines older still; undefined until one came. */
  more?: boolean
}

/**
 * A task's history beyond what its details carry (PROJ-BUG-8). The details
 * hold the newest lines, up to 1,000, and say when older ones exist (Dgraph cut
 * the history at 1,000 lines, oldest first, so a long-lived task lost its
 * newest changes). loadEarlier asks for the 50 lines before the oldest one
 * shown, and they go above it. Another task starts again.
 */
export function useEarlierHistory(taskUUID: string, newest: TaskActivityInterface[] | undefined, hasMore: boolean | undefined) {
  const [earlier, setEarlier] = useState<Earlier>({ task: taskUUID, lines: [] })
  const [loading, setLoading] = useState(false)
  const mine = earlier.task === taskUUID ? earlier : { task: taskUUID, lines: [] as TaskActivityInterface[], more: undefined }
  const oldest = mine.lines[0] ?? newest?.[0]
  const more = Boolean((mine.more ?? hasMore) && oldest?.activity_uuid)

  const activities = useMemo(() => {
    if (mine.lines.length === 0) return newest
    const seen = new Set(mine.lines.map((l) => l.activity_uuid))
    return [...mine.lines, ...(newest ?? []).filter((l) => !l.activity_uuid || !seen.has(l.activity_uuid))]
  }, [mine.lines, newest])

  const loadEarlier = useCallback(async () => {
    const before = oldest?.activity_uuid
    if (!before || loading) return
    setLoading(true)
    try {
      const res = await axiosInstance.get<{ data?: { task_activities?: TaskActivityInterface[]; task_activity_has_more?: boolean } }>(
        `${GetEndpointUrl.GetTaskActivityList}/${taskUUID}?before=${encodeURIComponent(before)}&first=${EARLIER_PAGE}`,
      )
      const page = res.data?.data?.task_activities ?? []
      setEarlier((cur) => {
        const base = cur.task === taskUUID ? cur.lines : []
        return { task: taskUUID, lines: [...page, ...base], more: Boolean(res.data?.data?.task_activity_has_more) && page.length > 0 }
      })
    } catch {
      // The request says it failed (the API client's read toast); the button
      // stays, for another try.
    } finally {
      setLoading(false)
    }
  }, [oldest?.activity_uuid, loading, taskUUID])

  // One object while nothing changes, so the memoised stream below doesn't draw again.
  return useMemo(() => ({ activities, more, loading, loadEarlier }), [activities, more, loading, loadEarlier])
}

export type EarlierHistory = ReturnType<typeof useEarlierHistory>

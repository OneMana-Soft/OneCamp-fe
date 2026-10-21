"use client"

import { useCallback, useMemo, useState } from "react"
import type { AxiosError } from "axios"
import axiosInstance from "@/lib/axiosInstance"
import { ChatGet } from "@/services/endpoints/chat"
import type { TaskActivityInterface } from "@/types/task"

/** History lines asked for at a time. */
export const EARLIER_PAGE = 50

interface Earlier {
  task: string
  /** Older lines than the task's details carry, oldest to newest. */
  lines: TaskActivityInterface[]
  /** What the last page said about lines older still; undefined until one came. */
  more?: boolean
  /** The failed page's error, when it said the task isn't this person's to open (cantOpenAnswer). */
  cantOpen?: unknown
}

/**
 * A page's answer that the task isn't this person's to open any more: 404 (a
 * task they may not read answers as one that isn't there, the server's one
 * rule for tasks), or 403 from a server from before that rule.
 */
function cantOpenAnswer(error: unknown): boolean {
  const status = (error as AxiosError)?.response?.status
  return status === 404 || status === 403
}

/**
 * A task's history beyond what its details carry (PROJ-BUG-8). The details
 * hold the newest lines, up to 1,000, and say when older ones exist (Dgraph cut
 * the history at 1,000 lines, oldest first, so a long-lived task lost its
 * newest changes). loadEarlier asks for the 50 lines before the oldest one
 * shown, and they go above it. Another task starts again.
 *
 * A page that answers the task can't be opened (it was deleted, or the person
 * left its project, while the panel was open) is cantOpen, and no more pages
 * are offered: the panel draws its can't-open state in place of the task, as
 * when it opens one.
 */
export function useEarlierHistory(taskUUID: string, newest: TaskActivityInterface[] | undefined, hasMore: boolean | undefined) {
  const [earlier, setEarlier] = useState<Earlier>({ task: taskUUID, lines: [] })
  const [loading, setLoading] = useState(false)
  const mine: Earlier = earlier.task === taskUUID ? earlier : { task: taskUUID, lines: [] }
  const oldest = mine.lines[0] ?? newest?.[0]
  const more = !mine.cantOpen && Boolean((mine.more ?? hasMore) && oldest?.activity_uuid)

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
        `${ChatGet.GetTaskActivityList}/${taskUUID}?before=${encodeURIComponent(before)}&first=${EARLIER_PAGE}`,
      )
      const page = res.data?.data?.task_activities ?? []
      setEarlier((cur) => {
        const base = cur.task === taskUUID ? cur.lines : []
        return { task: taskUUID, lines: [...page, ...base], more: Boolean(res.data?.data?.task_activity_has_more) && page.length > 0 }
      })
    } catch (error) {
      // A task the person can't open any more is the panel's to say, in
      // place of the task (its can't-open state keeps the read's toast
      // quiet). Any other failure the request says (the API client's read
      // toast), and the button stays, for another try.
      if (cantOpenAnswer(error)) {
        setEarlier((cur) => ({ ...(cur.task === taskUUID ? cur : { task: taskUUID, lines: [] }), cantOpen: error }))
      }
    } finally {
      setLoading(false)
    }
  }, [oldest?.activity_uuid, loading, taskUUID])

  const cantOpen = mine.cantOpen
  // One object while nothing changes, so the memoised stream below doesn't draw again.
  return useMemo(() => ({ activities, more, loading, loadEarlier, cantOpen }), [activities, more, loading, loadEarlier, cantOpen])
}

export type EarlierHistory = ReturnType<typeof useEarlierHistory>

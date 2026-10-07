"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { toast } from "@/hooks/use-toast"
import { useFetch } from "@/hooks/useFetch"
import { useTaskUpdate } from "@/hooks/useTaskUpdate"
import axiosInstance, { OWN_ERRORS } from "@/lib/axiosInstance"
import { appMutate } from "@/lib/swrMutate"
import { apiErrorMessage } from "@/lib/utils/apiError"
import { timelineKey } from "@/lib/timelineKey"
import type { TaskDates, TimelineData, TimelineTask } from "@/lib/timeline"
import { GetEndpointUrl, PostEndpointUrl } from "@/services/endPoints"

/** How long the keyboard waits after the last nudge before saving, so a run of presses is one change. */
const NUDGE_SAVE_MS = 700

/** The open task's panel, when it's this task: it shows the new dates too. */
function patchTaskPanel(taskUUID: string, dates: TaskDates) {
  void appMutate(
    `${GetEndpointUrl.GetTaskInfo}/${taskUUID}`,
    (current: { data?: object } | undefined) => (current?.data ? { ...current, data: { ...current.data, ...dates } } : current),
    { revalidate: false },
  )
}

/**
 * A project's timeline, and moving its tasks. A move shows at once on the
 * timeline, the board, the list and an open task; if the server refuses it,
 * all of them are fetched again so nothing shows a change that didn't happen,
 * and the person is told why.
 *
 * Moves of one task are saved one at a time, in the order they were made, so
 * the server always ends on the last. Until it has, the timeline draws the
 * dates last asked for over what it fetched: a fetch that lands meanwhile
 * can't put a bar back, and the next nudge starts from where the bar is.
 */
export function useProjectTimeline(projectId: string) {
  const timeline = useFetch<{ data: TimelineData }>(projectId ? timelineKey(projectId) : "")
  const { optimisticUpdateTask, revalidateTaskKeys } = useTaskUpdate()
  const [moving, setMoving] = useState<ReadonlyMap<string, TaskDates>>(() => new Map())
  const versions = useRef(new Map<string, number>())
  const queues = useRef(new Map<string, Promise<void>>())
  const waiting = useRef(new Map<string, { timer: ReturnType<typeof setTimeout>; run: () => void }>())

  const settle = useCallback(
    (id: string) =>
      setMoving((m) => {
        if (!m.has(id)) return m
        const next = new Map(m)
        next.delete(id)
        return next
      }),
    [],
  )

  const save = useCallback(
    (id: string, dates: TaskDates, version: number) => {
      // Only the last move of a task settles it; an earlier one's answer is old news.
      const latest = () => versions.current.get(id) === version
      const done = (queues.current.get(id) ?? Promise.resolve())
        .then(() => axiosInstance.post(PostEndpointUrl.UpdateTaskDates, { task_uuid: id, ...dates }, OWN_ERRORS))
        .then(
          () => {
            if (!latest()) return
            // A fetch that started before the save may have put the old dates in the cache.
            optimisticUpdateTask({ task_uuid: id, ...dates }, projectId)
            settle(id)
          },
          (err: unknown) => {
            toast({ variant: "destructive", title: "The dates weren't changed", description: apiErrorMessage(err, "Try again in a moment.") })
            if (!latest()) return
            settle(id)
            revalidateTaskKeys(projectId)
            void appMutate(`${GetEndpointUrl.GetTaskInfo}/${id}`)
          },
        )
      queues.current.set(id, done)
      void done.finally(() => {
        if (queues.current.get(id) === done) queues.current.delete(id)
      })
      return done
    },
    [optimisticUpdateTask, revalidateTaskKeys, projectId, settle],
  )

  /**
   * Give a task new dates. later waits for a pause before saving, for the
   * keyboard's one-day nudges; a drag saves at once.
   */
  const reschedule = useCallback(
    (task: Pick<TimelineTask, "task_uuid">, dates: TaskDates, later = false) => {
      const id = task.task_uuid
      const version = (versions.current.get(id) ?? 0) + 1
      versions.current.set(id, version)
      setMoving((m) => new Map(m).set(id, dates))
      optimisticUpdateTask({ task_uuid: id, ...dates }, projectId)
      patchTaskPanel(id, dates)
      const pending = waiting.current.get(id)
      if (pending) clearTimeout(pending.timer)
      waiting.current.delete(id)
      if (!later) return save(id, dates, version)
      const run = () => {
        waiting.current.delete(id)
        void save(id, dates, version)
      }
      waiting.current.set(id, { timer: setTimeout(run, NUDGE_SAVE_MS), run })
    },
    [optimisticUpdateTask, projectId, save],
  )

  // Leaving the timeline saves a nudge that was still waiting.
  useEffect(() => {
    const map = waiting.current
    return () => {
      for (const { timer, run } of [...map.values()]) {
        clearTimeout(timer)
        run()
      }
      map.clear()
    }
  }, [])

  const data = timeline.data?.data
  // What the timeline draws: the fetched tasks, with any move still being saved on top.
  const tasks = useMemo(() => {
    const list = data?.tasks ?? []
    if (moving.size === 0) return list
    return list.map((t) => {
      const dates = moving.get(t.task_uuid)
      return dates ? { ...t, ...dates } : t
    })
  }, [data?.tasks, moving])

  return {
    data,
    tasks,
    isLoading: timeline.isLoading,
    isError: timeline.isError,
    mutate: timeline.mutate,
    reschedule,
  }
}

"use client"

import { useCallback, useEffect, useMemo, useRef } from "react"
import { useSWRConfig } from "swr"

import axiosInstance from "@/lib/axiosInstance"
import { keepWorkCursor, readWorkCursor } from "@/lib/offline/workCursor"
import { revalidateWhileReading } from "@/lib/swrMutate"
import { GetEndpointUrl } from "@/services/endPoints"
import { useTaskUpdate } from "@/hooks/useTaskUpdate"
import type { FieldValue } from "@/lib/tasks/fields"
import type { TaskInfoInterface } from "@/types/task"
import type { TaskPatch, TaskPatchers } from "@/lib/tasks/workChanges"
import type { RunningFeed } from "@/lib/tasks/workFeed"

type AnswerTasks = (Partial<TaskInfoInterface> & { task_uuid: string })[]

/**
 * The one consumer of the Work Change Log on the web (projects WCL-2; ROWS
 * asana-19, jira-19: a teammate's change shows on an open board without a
 * refresh). A Task_Changed entry heard on a project's topic patches every
 * open list, board, timeline and task panel through useTaskUpdate's patchers;
 * catchUp() reads what was missed (GET /work/changes) when the connection's
 * subscriptions are answered again and when the tab is shown again.
 *
 * The feed's code comes as ONE chunk (lib/tasks/workFeed) on the first
 * message or catch-up, never with the screen; it imports no shared code:
 * this hands it the app's HTTP client, already on every page, and the store
 * its place is kept in (the member's Offline Store), which reaches the
 * session's sign-out hooks and so stays on this side.
 */
export function useWorkChanges() {
  // Live: a view whose read is out when its patch lands reads again (WCL-2b).
  const { optimisticUpdateTasks, optimisticUpdateTask, optimisticSetTaskField, optimisticDeleteTask, revalidateTaskKeys } = useTaskUpdate({ live: true })
  const { mutate, cache } = useSWRConfig()

  // An open task panel shows the same fields as its lists.
  const patchPanel = useCallback((patch: TaskPatch) => {
    void mutate(
      `${GetEndpointUrl.GetTaskInfo}/${patch.task_uuid}`,
      (current: { data?: object } | undefined) => (current?.data ? { ...current, data: { ...current.data, ...patch } } : current),
      { revalidate: revalidateWhileReading(cache) },
    )
  }, [mutate, cache])

  const patchers: TaskPatchers = useMemo(() => ({
    updateTasks: (patches, project) => {
      optimisticUpdateTasks(patches as AnswerTasks, project)
      patches.forEach(patchPanel)
    },
    moveTask: (patch, project) => {
      optimisticUpdateTask(patch as AnswerTasks[number], project)
      patchPanel(patch)
    },
    setTaskField: (task, project, field, value) => optimisticSetTaskField(task, project, field, value as FieldValue | null),
    deleteTask: (task, project) => optimisticDeleteTask(task, project),
    rereadProject: (project) => revalidateTaskKeys(project),
  }), [optimisticUpdateTasks, optimisticUpdateTask, optimisticSetTaskField, optimisticDeleteTask, revalidateTaskKeys, patchPanel])

  // The feed lives as long as the app; it reaches the newest patchers.
  const latest = useRef(patchers)
  useEffect(() => {
    latest.current = patchers
  }, [patchers])
  const rereadAll = useCallback(() => revalidateTaskKeys(), [revalidateTaskKeys])
  const rereadLatest = useRef(rereadAll)
  useEffect(() => {
    rereadLatest.current = rereadAll
  }, [rereadAll])

  const feed = useRef<Promise<RunningFeed> | null>(null)
  const getFeed = useCallback(() => {
    feed.current ??= import("@/lib/tasks/workFeed").then((w) =>
      w.startWorkFeed({
        get: (url, config) => axiosInstance.get(url, config as never),
        patchers: () => latest.current,
        rereadAll: () => rereadLatest.current(),
        place: { loadCursor: readWorkCursor, saveCursor: keepWorkCursor },
      }),
    )
    return feed.current
  }, [])

  /** A Task_Changed message's data: an entry is applied, a re-read reads its project's lists again. */
  const onTaskChanged = useCallback((data: unknown) => {
    void getFeed().then(({ feed, signalOf }) => {
      const signal = signalOf(data)
      if (!signal) return
      if ("reread" in signal) latest.current.rereadProject(signal.reread)
      else feed.live(signal.entry)
    }, () => undefined)
  }, [getFeed])

  /** Reads what was missed since the kept place, and applies it. */
  const catchUp = useCallback(() => {
    void getFeed().then(({ feed }) => feed.catchUp(), () => undefined)
  }, [getFeed])

  return { onTaskChanged, catchUp }
}

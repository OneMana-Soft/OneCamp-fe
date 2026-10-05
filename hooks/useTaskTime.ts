"use client"

// Time on tasks, client side: one task's entries, and the person's running
// timer, which the floating chip and every task panel share by SWR key so a
// start or stop anywhere shows everywhere.

import { useEffect, useState } from "react"
import axiosInstance from "@/lib/axiosInstance"
import { useFetch } from "@/hooks/useFetch"
import { appMutate } from "@/lib/swrMutate"
import { GetEndpointUrl } from "@/services/endPoints"
import type { TimeEntry, TimeEntryView } from "@/lib/tasks/time"

export const RUNNING_TIMER_KEY = `${GetEndpointUrl.TaskTime}/running`
const taskKey = (taskUUID: string) => `${GetEndpointUrl.TaskTime}/${taskUUID}`

export interface RunningTimer {
  entry: TimeEntry
  task_name: string
  seconds: number
}

interface TaskTime {
  entries: TimeEntryView[]
  seconds: number
  billable_seconds: number
  running: TimeEntry | null
}

/** Seconds since a moment, ticking once a second while shown. */
export function useElapsed(startedAt?: string | null) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!startedAt) return
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [startedAt])
  return startedAt ? Math.max(0, (now - new Date(startedAt).getTime()) / 1000) : 0
}

/** Refreshes the running timer and, when given, a task's entries. */
async function refreshTime(...taskUUIDs: (string | undefined)[]) {
  await Promise.all([appMutate(RUNNING_TIMER_KEY), ...taskUUIDs.filter(Boolean).map((id) => appMutate(taskKey(id as string)))])
}

export function useRunningTimer() {
  const { data, isLoading } = useFetch<{ data: RunningTimer | null }>(RUNNING_TIMER_KEY, undefined, { refreshInterval: 60_000 })
  return { running: data?.data ?? null, isLoading }
}

export async function startTimer(taskUUID: string, previousTaskUUID?: string) {
  await axiosInstance.post(`${taskKey(taskUUID)}/start`)
  await refreshTime(taskUUID, previousTaskUUID)
}

export async function stopTimer(taskUUID?: string) {
  await axiosInstance.post(`${GetEndpointUrl.TaskTime}/stop`)
  await refreshTime(taskUUID)
}

export interface SpanInput {
  started_at: string
  minutes: number
  note: string
  billable: boolean
}

export function useTaskTime(taskUUID: string) {
  const { data, isLoading } = useFetch<{ data: TaskTime }>(taskUUID ? taskKey(taskUUID) : "")
  const refresh = () => refreshTime(taskUUID)
  return {
    time: data?.data,
    isLoading,
    add: async (span: SpanInput) => {
      await axiosInstance.post(taskKey(taskUUID), span)
      await refresh()
    },
    update: async (id: string, span: SpanInput) => {
      await axiosInstance.post(`${GetEndpointUrl.TaskTime}/entry/${id}/update`, span)
      await refresh()
    },
    remove: async (id: string) => {
      await axiosInstance.post(`${GetEndpointUrl.TaskTime}/entry/${id}/delete`)
      await refresh()
    },
  }
}

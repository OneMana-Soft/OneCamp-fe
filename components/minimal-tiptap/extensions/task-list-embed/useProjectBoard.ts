"use client"

import * as React from "react"
import { useFetch, useFetchOnlyOnce } from "@/hooks/useFetch"
import { useMqttTopic } from "@/hooks/useMqttTopic"
import { OWN_ERRORS } from "@/lib/axiosInstance"
import { refreshEntity, useLiveEntity, type ProjectChipData } from "@/lib/liveEntity"
import { GetTaskStatusQueryParamByStatus } from "@/lib/utils/getTaskStatusQueryParamByStatus"
import { GetEndpointUrl } from "@/services/endPoints"
import { MqttMessageType } from "@/services/mqttService"
import type { ProjectInfoInterface, ProjectInfoRawInterface } from "@/types/project"
import type { TaskInfoInterface } from "@/types/task"
import type { UserProfileInterface } from "@/types/user"

/** A board's columns, each a status category, in the order a list reads them. */
export const COLUMNS = [
  { key: "project_tasks_in_progress", status: "inProgress", label: "In progress" },
  { key: "project_tasks_in_review", status: "inReview", label: "In review" },
  { key: "project_tasks_todo", status: "todo", label: "To do" },
  { key: "project_tasks_backlog", status: "backlog", label: "Backlog" },
  { key: "project_tasks_done", status: "done", label: "Done" },
] as const satisfies ReadonlyArray<{ key: keyof ProjectInfoInterface; status: string; label: string }>

export const OPEN = new Set(["inProgress", "inReview", "todo", "backlog"])

/** A column's tasks, live ones only. */
export const tasksIn = (board: ProjectInfoInterface | undefined, key: (typeof COLUMNS)[number]["key"]): TaskInfoInterface[] =>
  ((board?.[key] as TaskInfoInterface[] | undefined) ?? []).filter((t) => !!t.task_uuid)

/**
 * A project's tasks in a doc (docs C1's /tasks and /board), as the project's
 * board reads them: the same request, so the two share a cache and move
 * together. Read only for someone in the project (its chip says who may: the
 * server decides); kept live, so a task of the project that changes anywhere
 * reads the board again, once for a burst. "Mine" is each reader's own.
 */
export function useProjectBoard(projectId: string, opts: { mine?: boolean; enabled?: boolean } = {}) {
  const project = useLiveEntity<ProjectChipData>("project", opts.enabled === false ? null : projectId)
  const self = useFetchOnlyOnce<UserProfileInterface>(opts.mine ? GetEndpointUrl.SelfProfile : "")
  const uid = self.data?.data?.uid
  const ready = project.state === "ok" && (!opts.mine || !!uid)
  const query = GetTaskStatusQueryParamByStatus({ assigneeFilter: opts.mine && uid ? [uid] : [], priorityFilter: [] })
  const res = useFetch<ProjectInfoRawInterface>(ready ? `${GetEndpointUrl.GetProjectTaskListForKanban}/${projectId}?${query}` : "", undefined, undefined, OWN_ERRORS)

  const { mutate } = res
  const again = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  React.useEffect(() => () => void (again.current && clearTimeout(again.current)), [])
  const onMessage = React.useCallback(
    (raw: string) => {
      let type: number | undefined
      try {
        type = JSON.parse(raw)?.type
      } catch {
        return
      }
      if (type !== MqttMessageType.Task_Changed && type !== MqttMessageType.Task_Dates) return
      if (again.current) clearTimeout(again.current)
      again.current = setTimeout(() => void mutate(), 300)
    },
    [mutate],
  )
  useMqttTopic({ topic: project.state === "ok" ? project.topic ?? "" : "", onMessage })

  return {
    project,
    board: res.data?.data,
    loading: project.state === "loading" || (ready && res.isLoading),
    // "Mine" needs the reader's own profile: one that can't be read is a failure, never a skeleton for good.
    failed: project.state === "error" || !!res.isError || (!!opts.mine && !!self.isError),
    // Again what failed: the project's read, or the board's.
    retry: () => (project.state === "error" ? refreshEntity("project", projectId) : void mutate()),
  }
}

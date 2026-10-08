"use client"

// A project's custom task fields, and the moves its admins make: add one,
// change it, reorder, delete. Errors carry the server's message, written for
// the person. See lib/tasks/fields.

import { useCallback, useMemo } from "react"
import { useSWRConfig } from "swr"
import axiosInstance from "@/lib/axiosInstance"
import { useFetch } from "@/hooks/useFetch"
import { GetEndpointUrl } from "@/services/endPoints"
import { holdsProjectTasks } from "@/lib/taskStatus"
import type { FieldOption, FieldType, TaskField } from "@/lib/tasks/fields"
import type { ProjectInfoRawInterface } from "@/types/project"

export const projectFieldsKey = (projectId: string) => `${GetEndpointUrl.ProjectFields}/${projectId}/fields`

export interface FieldInput {
  name: string
  type: FieldType
  options?: Partial<FieldOption>[]
  currency?: string
  on_card?: boolean
}

const NONE: TaskField[] = []

export function useProjectFields(projectId: string | undefined) {
  const key = projectId ? projectFieldsKey(projectId) : ""
  const { data, isLoading, isError, mutate } = useFetch<{ data: { fields: TaskField[]; can_edit: boolean } }>(key, undefined, { revalidateOnFocus: false })
  const { mutate: mutateAll } = useSWRConfig()
  // Taking an option away or deleting a field changes tasks' values on the
  // server, so what the app holds of the project's tasks is fetched again.
  const refreshTasks = useCallback(() => mutateAll((k) => holdsProjectTasks(k, projectId ?? "")), [mutateAll, projectId])

  const create = useCallback(
    async (input: FieldInput) => {
      const res = await axiosInstance.post(projectFieldsKey(projectId!), input)
      await mutate()
      return (res.data as { data: TaskField }).data
    },
    [projectId, mutate],
  )
  const update = useCallback(
    async (id: string, input: FieldInput) => {
      const res = await axiosInstance.post(`${projectFieldsKey(projectId!)}/${id}`, input)
      const changed = (res.data as { data: { changed: number } }).data.changed
      await Promise.all([mutate(), changed > 0 ? refreshTasks() : undefined])
    },
    [projectId, mutate, refreshTasks],
  )
  const reorder = useCallback(
    async (ids: string[]) => {
      await axiosInstance.post(`${projectFieldsKey(projectId!)}/reorder`, { ids })
      await mutate()
    },
    [projectId, mutate],
  )
  const remove = useCallback(
    async (id: string) => {
      await axiosInstance.post(`${projectFieldsKey(projectId!)}/${id}/delete`, {})
      await Promise.all([mutate(), refreshTasks()])
    },
    [projectId, mutate, refreshTasks],
  )

  return {
    fields: data?.data?.fields ?? NONE,
    canEdit: !!data?.data?.can_edit,
    isLoading,
    isError,
    create,
    update,
    reorder,
    remove,
    refresh: mutate,
  }
}

/** The project's people, for person fields: to name a value and to filter
 * on one. Fetched only when the project has a person field. */
export function usePeople(projectId: string | undefined, fields: TaskField[]) {
  const needed = !!projectId && fields.some((f) => f.type === "person")
  const { data } = useFetch<ProjectInfoRawInterface>(needed ? `${GetEndpointUrl.GetProjectMembers}/${projectId}` : "", undefined, { revalidateOnFocus: false })
  const members = data?.data?.project_members
  return useMemo(() => {
    // Named as the task panel's picker names them; bots are named but not
    // offered as a filter.
    const all = (members ?? []).filter((m) => m.user_uuid).map((m) => ({ id: m.user_uuid, name: m.user_name || m.user_full_name || "A member", bot: !!m.is_bot }))
    const byId = new Map(all.map((p) => [p.id, p.name]))
    return { people: all.filter((p) => !p.bot).map(({ id, name }) => ({ id, name })), nameOf: (id: string) => byId.get(id) }
  }, [members])
}

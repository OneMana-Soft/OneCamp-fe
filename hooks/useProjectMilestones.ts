"use client"

// A project's milestones (linear-16), in its order, with their progress and
// span over the tasks the reader may open, and what its admins do with them:
// make, edit, order, share, take off and delete. Errors carry the server's
// message, written for the person.

import { useCallback } from "react"
import axiosInstance, { OWN_ERRORS } from "@/lib/axiosInstance"
import { useFetch } from "@/hooks/useFetch"
import { milestonesPath, type Milestone, type MilestoneInput, type MilestonesAnswer } from "@/lib/work/milestones"
import { listOnceRead } from "@/lib/utils/listOf"

export function useProjectMilestones(projectId: string | undefined) {
  const key = projectId ? milestonesPath(projectId) : ""
  const read = useFetch<MilestonesAnswer>(key, undefined, undefined, OWN_ERRORS)
  const { data, mutate } = read

  // Every change is read again after: the server orders, counts and marks next.
  const post = useCallback(
    async (path: string, body: object) => {
      await axiosInstance.post(`${key}${path}`, body, OWN_ERRORS)
      await mutate()
    },
    [key, mutate],
  )
  const create = useCallback((input: MilestoneInput) => post("", input), [post])
  const edit = useCallback((id: string, input: MilestoneInput) => post(`/${id}/edit`, input), [post])
  const remove = useCallback((id: string) => post(`/${id}/delete`, {}), [post])
  const share = useCallback((id: string, project: string) => post(`/${id}/share`, { project_uuid: project }), [post])
  /** Takes it off project (none: this one, from its own list). */
  const unshare = useCallback((id: string, project?: string) => post(`/${id}/unshare`, project ? { project_uuid: project } : {}), [post])
  /** The new order paints at once, and goes back if the server refuses it. */
  const reorder = useCallback(
    async (ids: string[]) => {
      if (!data) return
      const byId = new Map((data.data.milestones ?? []).map((m) => [m.id, m]))
      const moved = ids.flatMap((id) => byId.get(id) ?? [])
      await mutate({ data: { ...data.data, milestones: moved } }, { revalidate: false })
      try {
        await post("/reorder", { ids })
      } catch (e) {
        await mutate(data, { revalidate: false })
        throw e
      }
    },
    [data, mutate, post],
  )

  // None is an empty list however the server says it (V-51: it answered null),
  // so only an answer not read yet reads as not read: the section's rows stop
  // loading and Add comes on.
  const milestones = listOnceRead<MilestonesAnswer, Milestone>(data, (a) => a.data?.milestones)
  return { read, milestones, canManage: !!data?.data?.can_manage, create, edit, remove, share, unshare, reorder,
    // The client, for restoreService's restore: the lazy section's dialog may not import it itself (V-49).
    http: axiosInstance }
}

"use client"

import { useCallback, useRef } from "react"
import { useStore } from "react-redux"
import { useSWRConfig } from "swr"

import { usePost } from "@/hooks/usePost"
import { useTaskUpdate } from "@/hooks/useTaskUpdate"
import { chainMoves, effectiveRank, ranksBetween, type MovePlan, type RankMove } from "@/lib/tasks/listOrder"
import { rerankProjectCaches } from "@/lib/tasks/rankCache"
import type { RootState } from "@/store/store"
import { statusPatch, type StatusOption } from "@/lib/taskStatus"
import { PostEndpointUrl } from "@/services/endPoints"
import type { TaskInfoInterface } from "@/types/task"

type Request = ReturnType<typeof usePost>["makeRequest"]

/**
 * THE ONE WAY A LIST MOVES TASKS in the project's order (L-1), so the bulk
 * writer can take over here alone when it lands: until then each task is a
 * POST /task/moveTask of its own, in order, the first between the drop's
 * neighbours and each next right after the one before it. No task_status is
 * the Task Writer's rank op; with one (a row dropped in another status's
 * group) it is the board's move, place and status together.
 */
export async function sendMoves(moves: RankMove[], request: Request): Promise<void> {
  for (const m of moves) {
    await request({
      apiEndpoint: PostEndpointUrl.MoveTask,
      payload: { task_uuid: m.task_uuid, before_task_uuid: m.before, after_task_uuid: m.after, ...(m.status ? { task_status: m.status } : {}) },
      // The server's words (Work Access says who may), in one toast.
      showErrorToast: true,
      failureTitle: "Couldn't move the task",
    })
  }
}

/**
 * Where a move puts its tasks, as the server will: their new ranks, spaced
 * between their neighbours' (TaskRank BetweenMany), a status for those that
 * change group, and the drop's place. What a list shows at once, before the
 * server answers: the caches here, and the list the move was made in
 * (components/task/listReorder) straight away.
 */
export function movedPlaces(plan: MovePlan, tasks: readonly TaskInfoInterface[], options: StatusOption[]) {
  const byId = new Map(tasks.map((t) => [t.task_uuid, t]))
  const rankOf = (id: string) => {
    const t = id ? byId.get(id) : undefined
    return t ? effectiveRank(t) : null
  }
  const between = ranksBetween(rankOf(plan.before), rankOf(plan.after), plan.ids.length)
  const ranks: Record<string, number> = Object.fromEntries(plan.ids.map((id, i) => [id, between[i]]))
  const patches = plan.status && Object.keys(plan.status).length ? Object.fromEntries(Object.entries(plan.status).map(([id, v]) => [id, statusPatch(v, options)])) : undefined
  return { ranks, patches, place: { ids: plan.ids, before: plan.before, after: plan.after } }
}

/**
 * Moves tasks at once on screen (new ranks, and a status, in every cached
 * list and board of the project) and then on the server, one move after
 * another. Resolves whether the server took it; refused, the project's lists
 * are read again so they show where the tasks really are.
 */
export function useListMove(projectId: string, options: StatusOption[]) {
  const { makeRequest } = usePost()
  const { mutate, cache } = useSWRConfig()
  const store = useStore<RootState>()
  const { revalidateTaskKeys } = useTaskUpdate()
  // One move at a time, in the order they were made: the second names the
  // first's tasks as its neighbours.
  const queue = useRef<Promise<unknown>>(Promise.resolve())

  return useCallback(
    (plan: MovePlan, tasks: readonly TaskInfoInterface[]): Promise<boolean> => {
      // Where it was dropped, in every list that holds it; the ranks go with it.
      const { ranks, patches, place } = movedPlaces(plan, tasks, options)
      rerankProjectCaches(cache.keys() as Iterable<string>, mutate as never, projectId, ranks, patches, store, place)
      const run = queue.current.then(() => sendMoves(chainMoves(plan.ids, plan.before, plan.after, plan.status), makeRequest)).then(
        () => true,
        () => {
          revalidateTaskKeys(projectId)
          return false
        },
      )
      queue.current = run
      return run
    },
    [cache, mutate, makeRequest, options, projectId, revalidateTaskKeys, store],
  )
}

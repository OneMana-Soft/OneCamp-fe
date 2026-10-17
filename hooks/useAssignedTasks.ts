"use client"

import useSWR from "swr"
import type { AxiosRequestConfig } from "axios"
import axiosInstance from "@/lib/axiosInstance"
import { readEveryByIndex } from "@/lib/http/pageIndex"
import { GetEndpointUrl } from "@/services/endPoints"
import type { TaskInfoInterface } from "@/types/task"
import type { UserInfoRawInterface } from "@/types/user"

/** The list's own page size. */
const PAGE_SIZE = 100
/** Pages read at most: 5,000 tasks, far past one person's few weeks. */
const PAGES_MAX = 50
/** By id: one order with no ties, so no task falls between two pages. */
const BY_ID = encodeURIComponent(JSON.stringify([{ id: "task_uuid", desc: false }]))

/** Every page as one answer, shaped as one page of the list. */
export interface AssignedTasks {
  msg: string
  data: { user_tasks: TaskInfoInterface[] }
}

/**
 * Every task assigned to you in a range of dates (`range`: the list's
 * startDate and endDate), read page by page: the calendar asked for the first
 * 100 and showed them as the month (FE-F-1). The pages are kept as one answer
 * shaped like the list's own, under a key that starts with the list's path, so
 * what patches the assigned-task lists or asks for them again (useTaskUpdate,
 * a project's status change) reaches it too. `requestConfig` is the reads'
 * own, as useFetch's is: a screen that says its failures itself passes
 * OWN_ERRORS.
 */
export function useAssignedTasks(range: string, requestConfig?: AxiosRequestConfig) {
  const key = `${GetEndpointUrl.GetUserTaskList}?${range}&sorting=${BY_ID}`
  const { data, error, isLoading, mutate } = useSWR<AssignedTasks>(
    key,
    async () => {
      const { items } = await readEveryByIndex<TaskInfoInterface>(
        async (pageIndex, pageSize) =>
          (await axiosInstance.get<UserInfoRawInterface>(`${key}&pageIndex=${pageIndex}&pageSize=${pageSize}`, requestConfig)).data?.data?.user_tasks ?? [],
        { pageSize: PAGE_SIZE, maxPages: PAGES_MAX, key: (t) => t.task_uuid },
      )
      return { msg: "", data: { user_tasks: items } }
    },
    // As useFetch reads: the last answer kept while the next loads, and a
    // focus asks again at most once a minute.
    { keepPreviousData: true, focusThrottleInterval: 60_000 },
  )
  return { data, isLoading, isError: error, mutate }
}

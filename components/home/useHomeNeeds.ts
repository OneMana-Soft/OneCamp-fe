"use client"

/**
 * What needs the reader, from the parts of OneCamp that work without AI
 * (hub.md H8, "AI off"): mentions still waiting, DMs with unread messages, and
 * tasks overdue or due today. The AI adds agent requests and its own finds on
 * top of these (components/ai/AttentionCard); with AI off, this is the list.
 *
 * Every request here is one the app already makes (Activity's first page, the
 * calendar's task list, the sidebar in the store), so SWR shares the answers.
 */
import { useMemo, useState } from "react"
import { useSelector } from "react-redux"

import { useFetch, useFetchOnlyOnce } from "@/hooks/useFetch"
import { GetEndpointUrl } from "@/services/endPoints"
import type { RootState } from "@/store/store"
import type { UnifiedActivityPaginationRes } from "@/types/activity"
import type { UserInfoRawInterface, UserProfileInterface } from "@/types/user"
import { dmsToNeeds, mentionsToNeeds, tasksToNeeds, type NeedsItem } from "@/components/home/needsMe"

const DAY = 24 * 3600 * 1000

/** The range the due list reads: the last 60 days of due dates, to the end of today. */
export function dueRangeQuery(now: Date): string {
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
  const start = new Date(end.getTime() - 61 * DAY)
  return `pageIndex=0&pageSize=100&startDate=${start.toISOString()}&endDate=${end.toISOString()}`
}

export function useHomeNeeds() {
  const [now] = useState(() => new Date())
  const self = useFetchOnlyOnce<UserProfileInterface>(GetEndpointUrl.SelfProfile)
  const selfId = self.data?.data?.user_uuid
  const chats = useSelector((s: RootState) => s.users.userSidebar.userChats)
  const activity = useFetch<UnifiedActivityPaginationRes>(`${GetEndpointUrl.GetUnifiedActivity}?limit=20`)
  const tasks = useFetch<UserInfoRawInterface>(`${GetEndpointUrl.GetUserTaskList}?${dueRangeQuery(now)}`)

  const items = useMemo<NeedsItem[]>(
    () => [
      ...mentionsToNeeds(activity.data?.data?.activities ?? [], selfId, now),
      ...dmsToNeeds(chats ?? [], selfId),
      ...tasksToNeeds(tasks.data?.data?.user_tasks ?? [], now),
    ],
    [activity.data, tasks.data, chats, selfId, now],
  )

  const loading = (activity.isLoading && !activity.data) || (tasks.isLoading && !tasks.data)
  const error = Boolean(activity.isError && tasks.isError)
  const retry = () => {
    void activity.mutate()
    void tasks.mutate()
  }
  return { items, loading, error, retry, selfId }
}

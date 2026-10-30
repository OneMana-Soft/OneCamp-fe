"use client"

/**
 * What needs the reader, from the parts of OneCamp that work without AI
 * (hub.md H8, "AI off"): approvals waiting for their yes, mentions still
 * waiting, DMs with unread messages, and tasks overdue or due today. The AI
 * adds agent requests and its own finds on top of these
 * (components/ai/AttentionCard); with AI off, this is the list.
 *
 * Activity's first page and the sidebar are requests the app already makes, so
 * SWR shares those answers; the due list asks the server for what is due by
 * the end of today. A source that fails holds nothing back: the list waits
 * only for sources that haven't answered, and says it couldn't load only when
 * every one failed.
 */
import { useMemo, useState } from "react"
import { useSelector } from "react-redux"

import { useFetch, useFetchOnlyOnce } from "@/hooks/useFetch"
import { useWaitingApprovals } from "@/hooks/useWaitingApprovals"
import { GetEndpointUrl } from "@/services/endPoints"
import type { RootState } from "@/store/store"
import type { UnifiedActivityPaginationRes } from "@/types/activity"
import type { UserInfoRawInterface, UserProfileInterface } from "@/types/user"
import { approvalsToNeeds, dmsToNeeds, mentionsToNeeds, tasksToNeeds, type NeedsItem } from "@/components/home/needsMe"

/** What the due list reads: open tasks due by the end of today (the server's dueBy, PR1). */
export function dueRangeQuery(now: Date): string {
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
  return `pageIndex=0&pageSize=100&dueBy=${end.toISOString()}`
}

export function useHomeNeeds() {
  const [now] = useState(() => new Date())
  const self = useFetchOnlyOnce<UserProfileInterface>(GetEndpointUrl.SelfProfile)
  const selfId = self.data?.data?.user_uuid
  const chats = useSelector((s: RootState) => s.users.userSidebar.userChats)
  const activity = useFetch<UnifiedActivityPaginationRes>(`${GetEndpointUrl.GetUnifiedActivity}?limit=20`)
  const tasks = useFetch<UserInfoRawInterface>(`${GetEndpointUrl.GetUserTaskList}?${dueRangeQuery(now)}`)
  const waiting = useWaitingApprovals()

  const items = useMemo<NeedsItem[]>(
    () => [
      ...approvalsToNeeds(waiting.data?.data?.items ?? [], now),
      ...mentionsToNeeds(activity.data?.data?.activities ?? [], selfId, now),
      ...dmsToNeeds(chats ?? [], selfId),
      ...tasksToNeeds(tasks.data?.data?.user_tasks ?? [], now),
    ],
    [waiting.data, activity.data, tasks.data, chats, selfId, now],
  )

  const sources = [activity, tasks, waiting]
  const loading = sources.some((s) => s.isLoading && !s.data)
  const error = sources.every((s) => Boolean(s.isError))
  const retry = () => sources.forEach((s) => void s.mutate())
  return { items, loading, error, retry, selfId }
}

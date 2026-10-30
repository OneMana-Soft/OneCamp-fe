"use client"

import { useCallback, useEffect, useSyncExternalStore } from "react"
import { useSWRConfig } from "swr"
import { useDispatch } from "react-redux"
import { useRouter } from "next/navigation"
import { useFetchOnlyOnce } from "@/hooks/useFetch"
import { useToast } from "@/hooks/use-toast"
import { GetEndpointUrl } from "@/services/endPoints"
import type { UserProfileInterface } from "@/types/user"
import type { TaskInfoInterface } from "@/types/task"
import { emptyOfflineStatus, getOfflineStatus, reviewOfflineChanges, subscribeOfflineStatus } from "@/lib/offline/status"
import { keepsOffline } from "@/lib/offline/http"
import { OFFLINE_MADE, OFFLINE_REFRESH, discard, resolveConflict, retryChange, start, stop, type ScreenCache } from "@/lib/offline/engine"
import { COMMENT } from "@/lib/offline/tasks"
import { withNewTask } from "@/lib/tasks/taskLists"
import { madeTaskComment } from "@/store/slice/createTaskCommentSlice"
import { OfflineChanges } from "@/components/offline/OfflineChanges"

/**
 * The Offline Store for the member signed in (projects P7-1): opens it for
 * them, sends what waits when the network is back, reads screens again once
 * their changes are sent or put back, and shows the changes that need them.
 * Loaded after the page in a chunk of its own (app/app/layout), so no route's
 * first load carries the store.
 */
export function OfflineLoader() {
  const member = useFetchOnlyOnce<UserProfileInterface>(GetEndpointUrl.SelfProfile).data?.data?.user_uuid
  const { mutate, cache } = useSWRConfig()
  const dispatch = useDispatch()
  const router = useRouter()
  const { toast } = useToast()
  const status = useSyncExternalStore(subscribeOfflineStatus, getOfflineStatus, emptyOfflineStatus)

  useEffect(() => {
    if (!member) return
    void start(member, cache as unknown as ScreenCache)
    return () => stop()
  }, [member, cache])

  // Sent, refused or put back: the task's screens are read again. A comment
  // made offline first takes the id the server made it under, and a page
  // still open on an id the device gave goes on under the server's, so its
  // address can be copied (CODE-REVIEWER-79 SF1).
  useEffect(() => {
    const onRefresh = (event: Event) => {
      const detail = (event as CustomEvent<{ ids?: string[]; made?: { kind: string; from: string; to: string }[] }>).detail
      const ids: string[] = detail?.ids ?? []
      for (const m of detail?.made ?? []) if (m.kind === COMMENT) dispatch(madeTaskComment({ from: m.from, to: m.to }))
      const here = `${window.location.pathname}${window.location.search}`
      const moved = (detail?.made ?? []).reduce((at, m) => at.split(m.from).join(m.to), here)
      if (moved !== here) router.replace(moved)
      void mutate((key) => typeof key === "string" && keepsOffline(key) && (key.startsWith(GetEndpointUrl.GetTaskInfo) ? ids.some((id) => key.includes(id)) : true))
    }
    window.addEventListener(OFFLINE_REFRESH, onRefresh)
    return () => window.removeEventListener(OFFLINE_REFRESH, onRefresh)
  }, [mutate, dispatch, router])

  // A task made with no network joins the lists on screen at once (P7-1c), as
  // one made online does (lib/tasks/taskLists): what is on screen stays, since
  // reading a list again can't reach the server.
  useEffect(() => {
    const onMade = (event: Event) => {
      const task = (event as CustomEvent<{ task?: TaskInfoInterface }>).detail?.task
      if (!task) return
      for (const key of (cache as unknown as ScreenCache).keys()) {
        if (typeof key !== "string" || !keepsOffline(key) || key.startsWith(GetEndpointUrl.GetTaskInfo)) continue
        void mutate(key, (data: { data?: Record<string, unknown> } | undefined) => withNewTask(key, data, task, { member }), { revalidate: false })
      }
    }
    window.addEventListener(OFFLINE_MADE, onMade)
    return () => window.removeEventListener(OFFLINE_MADE, onMade)
  }, [mutate, cache, member])

  // Changes that won't be sent are said, once each pass.
  const notice = status.notice
  useEffect(() => {
    if (!notice) return
    const name = notice.label ? `“${notice.label}”` : "a task"
    const lost = notice.gone + notice.refused
    const what = lost === 1 ? "A change made offline wasn't sent" : `${lost} changes made offline weren't sent`
    const why = notice.gone > 0 ? `You no longer have access to ${name}.` : `The server didn't accept the change to ${name}, so it's back as it was.`
    toast({ variant: "destructive", title: what, description: why })
  }, [notice, toast])

  const close = useCallback(() => reviewOfflineChanges(false), [])
  if (!status.reviewing) return null
  return <OfflineChanges conflicts={status.conflicts} failed={status.failed} held={status.held} onKeep={resolveConflict} onRetry={retryChange} onDiscard={discard} onClose={close} />
}

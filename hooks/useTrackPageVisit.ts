"use client"

import { displayNameOf } from "@/lib/personName"
import { useEffect, useRef } from "react"
import { usePathname } from "next/navigation"
import { useDispatch, useStore } from "react-redux"
import type { RootState } from "@/store/store"
import { addRecentItem, type RecentItem } from "@/store/slice/recentItemsSlice"

/** The page's title and kind, from what the store holds, or null if it doesn't hold it yet. */
function visitOf(state: RootState, entity: string, id: string): { title: string; type: RecentItem["type"] } | null {
  switch (entity) {
    case "task": {
      const task = (state.TaskInfo?.taskListVisibleInfo ?? []).find((t) => t.task_uuid === id)
      return task ? { title: task.task_name, type: "task" } : null
    }
    case "project": {
      const project = (state.users?.userSidebar?.userProjects ?? []).find((p) => p.project_uuid === id)
      return project ? { title: project.project_name, type: "project" } : null
    }
    case "channel": {
      const channel = (state.users?.userSidebar?.userChannels ?? []).find((c) => c.ch_uuid === id)
      return channel ? { title: channel.ch_name, type: "channel" } : null
    }
    case "team": {
      const team = (state.users?.userSidebar?.userTeams ?? []).find((t) => t.team_uuid === id)
      return team ? { title: team.team_name, type: "team" } : null
    }
    case "chat": {
      const chat = (state.users?.userSidebar?.userChats ?? []).find((c) => c.dm_grouping_id === id)
      if (!chat) return null
      const participants = chat.dm_participants || []
      return { title: participants.length > 0 ? participants.map((p) => displayNameOf(p)).join(", ") : "Chat", type: "chat" }
    }
    default:
      return null
  }
}

/**
 * Watches pathname changes and tracks page visits with real entity names
 * derived from Redux state. No UUIDs, no localStorage.
 *
 * It reads the store when the address changes, and listens to it only until
 * the page's name is there. It used to subscribe to the task list and the
 * sidebar's four lists for the life of the app, and the always-mounted
 * command palette that calls it re-rendered on every unread count.
 */
export function useTrackPageVisit() {
  const pathname = usePathname()
  const dispatch = useDispatch()
  const store = useStore<RootState>()
  const trackedRef = useRef<string>("")

  useEffect(() => {
    if (!pathname) return

    // Only track each pathname once per mount (avoid re-tracking when data loads)
    if (trackedRef.current === pathname) return

    const parts = pathname.split("/").filter(Boolean)
    if (parts.length < 3 || parts[0] !== "app") return

    const entity = parts[1]
    const id = parts[2]
    if (!id) return

    const tryTrack = (): boolean => {
      // Tracked already, perhaps by the dispatch below calling back in here.
      if (trackedRef.current === pathname) return true
      const visit = visitOf(store.getState(), entity, id)
      if (!visit || !visit.title) return false
      // Mark as tracked only when we successfully got a name
      trackedRef.current = pathname
      dispatch(addRecentItem({ id, type: visit.type, title: visit.title, path: pathname }))
      return true
    }

    if (tryTrack()) return
    // Not in the store yet: try again as it fills, until it's there.
    const unsubscribe = store.subscribe(() => {
      if (tryTrack()) unsubscribe()
    })
    return unsubscribe
  }, [pathname, dispatch, store])
}

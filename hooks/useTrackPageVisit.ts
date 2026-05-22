"use client"

import { useEffect, useRef } from "react"
import { usePathname } from "next/navigation"
import { useSelector, useDispatch } from "react-redux"
import type { RootState } from "@/store/store"
import { addRecentItem, type RecentItem } from "@/store/slice/recentItemsSlice"

/**
 * Watches pathname changes and tracks page visits with real entity names
 * derived from Redux state. No UUIDs, no localStorage.
 */
export function useTrackPageVisit() {
  const pathname = usePathname()
  const dispatch = useDispatch()
  const trackedRef = useRef<string>("")

  // Select entity data from Redux
  const taskList = useSelector((state: RootState) => state.TaskInfo?.taskListVisibleInfo || [])
  const projects = useSelector((state: RootState) => state.users?.userSidebar?.userProjects || [])
  const channels = useSelector((state: RootState) => state.users?.userSidebar?.userChannels || [])
  const teams = useSelector((state: RootState) => state.users?.userSidebar?.userTeams || [])
  const chats = useSelector((state: RootState) => state.users?.userSidebar?.userChats || [])

  useEffect(() => {
    if (!pathname) return

    // Only track each pathname once per mount (avoid re-tracking when data loads)
    if (trackedRef.current === pathname) return

    const parts = pathname.split("/").filter(Boolean)
    if (parts.length < 3 || parts[0] !== "app") return

    const entity = parts[1]
    const id = parts[2]
    if (!id) return

    let title: string | null = null
    let type: RecentItem["type"] | null = null

    switch (entity) {
      case "task": {
        const task = taskList.find((t) => t.task_uuid === id)
        if (task) {
          title = task.task_name
          type = "task"
        }
        break
      }
      case "project": {
        const project = projects.find((p) => p.project_uuid === id)
        if (project) {
          title = project.project_name
          type = "project"
        }
        break
      }
      case "channel": {
        const channel = channels.find((c) => c.ch_uuid === id)
        if (channel) {
          title = channel.ch_name
          type = "channel"
        }
        break
      }
      case "team": {
        const team = teams.find((t) => t.team_uuid === id)
        if (team) {
          title = team.team_name
          type = "team"
        }
        break
      }
      case "chat": {
        const chat = chats.find((c) => c.dm_grouping_id === id)
        if (chat) {
          const participants = chat.dm_participants || []
          if (participants.length > 0) {
            title = participants.map((p) => p.user_name || p.user_full_name).join(", ")
          } else {
            title = "Chat"
          }
          type = "chat"
        }
        break
      }
      default:
        return
    }

    if (!type || !title) {
      // Data not in Redux yet — try again next time data changes
      // by NOT setting trackedRef, so when Redux updates, this re-runs
      return
    }

    // Mark as tracked only when we successfully got a name
    trackedRef.current = pathname

    dispatch(
      addRecentItem({
        id,
        type,
        title,
        path: pathname,
      })
    )
  }, [pathname, dispatch, taskList, projects, channels, teams, chats])
}

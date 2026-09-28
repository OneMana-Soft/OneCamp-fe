"use client"

import { useEffect, useMemo } from "react"
import { usePathname } from "next/navigation"
import { useSelector } from "react-redux"
import type { RootState } from "@/store/store"
import { pageTitle, type TitleLookups } from "@/lib/utils/pageTitle"

const byId = <T,>(items: T[] | undefined, id: (t: T) => string | undefined, name: (t: T) => string | undefined) => {
  const out: Record<string, string> = {}
  for (const t of items || []) {
    const k = t && id(t)
    const v = t && name(t)
    if (k && v) out[k] = v
  }
  return out
}

/** Keeps the tab title equal to the page and what is waiting; see pageTitle. */
export function DocumentTitle() {
  const pathname = usePathname()
  const sidebar = useSelector((s: RootState) => s.users.userSidebar)

  const lookups = useMemo<TitleLookups>(() => {
    const people: Record<string, string> = {}
    for (const chat of sidebar.userChats || []) {
      for (const p of chat?.dm_participants || []) {
        const name = p?.user_name || p?.user_full_name || ""
        if (p?.user_uuid && name) people[p.user_uuid] = name
      }
    }
    return {
      channels: byId(sidebar.userChannels, (c) => c.ch_uuid, (c) => c.ch_name),
      projects: byId(sidebar.userProjects, (p) => p.project_uuid, (p) => p.project_name),
      teams: byId(sidebar.userTeams, (t) => t.team_uuid, (t) => t.team_name),
      docs: byId(sidebar.userDocs, (d) => d.doc_uuid, (d) => d.doc_title),
      boards: byId(sidebar.userBoards, (b) => b.board_uuid, (b) => b.board_title),
      people,
    }
  }, [sidebar])

  const unread =
    (sidebar.totalUnreadActivityCount || 0) +
    (sidebar.userChats || []).reduce((n, c) => n + (c?.dm_unread || 0), 0)

  const title = pageTitle(pathname || "", lookups, unread)

  // Next applies the route's static metadata title after hydration, and on a
  // full page load streams that <title> into <body>, not <head>. So the title
  // is held: set it, and set it again whenever the <title> element changes or
  // is replaced. It writes only when the value differs, so it cannot loop.
  useEffect(() => {
    let watched: Element | null = null
    const onTitle = new MutationObserver(() => hold())
    const watch = () => {
      const el = document.querySelector("title")
      if (el && el !== watched) {
        onTitle.disconnect()
        onTitle.observe(el, { subtree: true, childList: true, characterData: true })
        watched = el
      }
    }
    const hold = () => {
      watch()
      if (document.title !== title) document.title = title
    }
    hold()
    // A new <title> can be inserted at the top of <head> or <body>.
    const onInsert = new MutationObserver(() => hold())
    onInsert.observe(document.head, { childList: true })
    onInsert.observe(document.body, { childList: true })
    return () => {
      onTitle.disconnect()
      onInsert.disconnect()
    }
  }, [title])

  return null
}

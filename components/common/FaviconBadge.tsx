"use client"

import { useEffect } from "react"
import { useSelector } from "react-redux"
import type { RootState } from "@/store/store"
import { rowSignal } from "@/lib/nav/sidebarSignal"
import { isMutedChannel } from "@/lib/nav/sidebarChannels"

/** The icon while something needs you: logo.svg's ring with a dot. */
const DOT_ICON = "/favicon-dot.svg"

/**
 * A dot on the tab's icon while something needs you (SD-62): a DM's unread,
 * a channel's mention of you, anything new in the Inbox; what the sidebar
 * puts on its brand badge (lib/nav/sidebarSignal), and the Inbox the tab's
 * title counts. Plain chatter in a channel doesn't. A pinned tab said nothing.
 *
 * The dot is an icon link of its own, added after the page's and removed when
 * nothing does: the browser takes the last icon given, and goes back to the
 * page's own once it's gone.
 */
export function FaviconBadge() {
  const needed = useSelector((s: RootState) => {
    const sidebar = s.users.userSidebar
    if ((sidebar.totalUnreadActivityCount || 0) > 0) return true
    if ((sidebar.userChats || []).some((c) => !!c && !!rowSignal({ badge: true, unread_count: c.dm_unread }).badge)) return true
    return (sidebar.userChannels || []).some(
      (c) => !!c && !!rowSignal({ unread_count: c.unread_post_count, mentions: c.unread_mention_count, muted: isMutedChannel(c) }).badge,
    )
  })

  useEffect(() => {
    if (!needed) return
    const link = document.createElement("link")
    link.rel = "icon"
    link.type = "image/svg+xml"
    link.setAttribute("sizes", "any")
    link.href = DOT_ICON
    link.dataset.faviconDot = ""
    document.head.appendChild(link)
    return () => link.remove()
  }, [needed])

  return null
}

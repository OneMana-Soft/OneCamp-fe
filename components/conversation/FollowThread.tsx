"use client"

import { useEffect, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { useThreadFollow } from "@/components/conversation/useThreadFollow"
import { Bell } from "@/lib/icons"
import { refreshFollowedLists, setThreadRead } from "@/lib/conversation/threadFollow"
import { cn } from "@/lib/utils/helpers/cn"

// A thread's header bell and its reads (chat P2): the thread panels' own, which
// load with a thread. A message's More menu has FollowMenuItem.

/**
 * Opening a thread reads it (chat P2): once it's on screen, and again as
 * replies arrive while it stays open, a moment after the last. Quiet: a read
 * that doesn't reach the server leaves the thread unread, which is all.
 */
export function useReadsThread(root: string | undefined, replies: number) {
  const last = useRef("")
  useEffect(() => {
    if (!root) return
    const mark = `${root}:${replies}`
    if (last.current === mark) return
    const t = setTimeout(() => {
      last.current = mark
      void setThreadRead(root, true)
        .then(refreshFollowedLists)
        .catch(() => {})
    }, 600)
    return () => clearTimeout(t)
  }, [root, replies])
}

/**
 * "Follow" in a thread's header, beside Close: a bell, filled while you follow
 * it, its words in the tooltip and to a screen reader. The thread is read
 * while the panel shows it (useReadsThread).
 */
export function FollowThreadButton({ root, replies }: { root: string; replies: number }) {
  const { following, toggle } = useThreadFollow(root)
  useReadsThread(root, replies)
  if (following === undefined) return null
  const label = following ? "Unfollow thread" : "Follow thread"
  // The bell says the state, as a pressed toggle does: the selected tint and a
  // bell filled in the accent while you follow it, an outline while you don't.
  // Not the layer's ring for a pressed control: beside Close it read as focus
  // (DESIGN-BUILD-2, 18 Oct), and the ring means focus only.
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          size="icon"
          variant="ghost"
          aria-label={label}
          aria-pressed={following}
          data-follow-thread={following ? "on" : "off"}
          onClick={() => void toggle()}
          className={cn("h-7 w-7 shrink-0 text-ink-3 hover:text-ink", following && "text-brand-text [--tw-inset-ring-shadow:0_0_#0000] hover:text-brand-text")}
        >
          <Bell className={cn("h-4 w-4", following && "fill-current")} aria-hidden="true" />
        </Button>
      </TooltipTrigger>
      <TooltipContent>{following ? "Following · replies reach your Threads" : "Follow · replies reach your Threads"}</TooltipContent>
    </Tooltip>
  )
}

"use client"

import { DropdownMenuItem } from "@/components/ui/dropdown-menu"
import { useThreadFollow } from "@/components/conversation/useThreadFollow"
import { Bell, BellOff } from "@/lib/icons"

/**
 * "Follow thread" or "Unfollow thread" in a message's More menu (chat P2): its
 * thread, whether it has replies yet or not. The menu draws it only while
 * open, so the standing is read then.
 */
export function FollowMenuItem({ root }: { root: string }) {
  const { following, toggle } = useThreadFollow(root)
  const Icon = following ? BellOff : Bell
  return (
    <DropdownMenuItem onSelect={() => void toggle()} data-follow-thread={following ? "on" : "off"}>
      <Icon className="text-ink-3" aria-hidden="true" /> {following ? "Unfollow thread" : "Follow thread"}
    </DropdownMenuItem>
  )
}

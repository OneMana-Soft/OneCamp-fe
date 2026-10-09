"use client"

import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { relayInitials } from "@/lib/relayedAuthor"

/**
 * The avatar beside a message from someone who is not a member: a channel or
 * doc guest, or a person in a linked Slack channel. A person, so a circle,
 * but neutral: no image (they have none, and the relaying bot's would stand
 * in for every one of them) and no member's colour.
 */
export function RelayedAvatar({ name }: { name: string }) {
  return (
    <Avatar className="h-full w-full" data-relayed-avatar="">
      <AvatarFallback className="bg-muted text-2xs font-semibold text-muted-foreground">
        {relayInitials(name)}
      </AvatarFallback>
    </Avatar>
  )
}

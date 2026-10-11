"use client"

import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { relayInitials } from "@/lib/relayedAuthor"
import { getAvatarFallbackClass } from "@/lib/utils/getAvatarColor"
import { cn } from "@/lib/utils/helpers/cn"

/**
 * The avatar beside a message from someone who is not a member: a channel or
 * doc guest, or a person in a linked Slack channel. A person, so a circle in
 * their own hue (design v3 chat, C09), seeded by the name they wrote under, as
 * every person's is. No image: they have none, and the relaying bot's would
 * stand in for every one of them. The tag beside the name says what they are;
 * the grey disc they had read as an empty state.
 */
export function RelayedAvatar({ name, className }: { name: string; className?: string }) {
    return (
        <Avatar className={cn("h-full w-full", className)} data-relayed-avatar="">
            <AvatarFallback className={cn("text-xs font-semibold", getAvatarFallbackClass(name))}>
                {relayInitials(name)}
            </AvatarFallback>
        </Avatar>
    )
}

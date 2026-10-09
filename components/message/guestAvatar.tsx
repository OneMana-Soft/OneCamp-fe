"use client"

import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { guestInitials } from "@/lib/guestAuthor"

/**
 * A guest's avatar beside their message: someone outside the workspace (a
 * channel or doc guest). A person, so a circle, but neutral: no image (they
 * have none, and the Guests bot's would stand in for every guest) and no
 * member's colour.
 */
export function GuestAvatar({ name }: { name: string }) {
  return (
    <Avatar className="h-full w-full" data-guest-avatar="">
      <AvatarFallback className="bg-muted text-2xs font-semibold text-muted-foreground">
        {guestInitials(name)}
      </AvatarFallback>
    </Avatar>
  )
}

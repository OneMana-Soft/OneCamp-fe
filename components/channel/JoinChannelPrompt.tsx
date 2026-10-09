"use client"

// What someone who isn't in a channel sees where the message box would be:
// why they can't write, and the button that fixes it. It said "you are not the
// member of the channel" above a bare "Join channel", on desktop and on a
// phone alike.

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils/helpers/cn"

interface Props {
  /** The channel's name without the #, or "" while it isn't known. */
  channelName: string
  onJoin: () => void
  joining?: boolean
  className?: string
}

export function JoinChannelPrompt({ channelName, onJoin, joining = false, className }: Props) {
  const name = channelName ? `#${channelName}` : "this channel"
  return (
    <div className={cn("flex w-full flex-col items-center justify-center gap-2 text-center", className)}>
      <p className="text-sm text-muted-foreground">
        You&apos;re not in {name} yet. Join to send messages here.
      </p>
      <Button onClick={onJoin} disabled={joining}>
        {joining ? "Joining…" : `Join ${name}`}
      </Button>
    </div>
  )
}

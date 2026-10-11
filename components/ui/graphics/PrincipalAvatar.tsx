import type { ReactNode } from "react"

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { cn } from "@/lib/utils/helpers/cn"

import { Spark } from "./motifs"

/**
 * Non-people get a different SHAPE (design v3, §3.9), so the difference
 * survives colour blindness and a custom photo:
 *
 *   AgentAvatar  a 32%-radius square in the agent gradient, a white spark at
 *                55%: never initials, so an agent never reads as a person;
 *   BotAvatar    a 32%-radius square on the sunken surface with a ring and an
 *                ink-2 glyph (Check-in, the Slack bridge).
 *
 * Both fill their box (size it with the caller's classes, as an Avatar).
 */
export function AgentAvatar({ src, className }: { src?: string; className?: string }) {
  return (
    <Avatar className={cn("h-full w-full rounded-[32%]", className)} data-agent-avatar="">
      {src ? <AvatarImage src={src} className="rounded-[32%] object-cover" /> : null}
      <AvatarFallback className="avatar-agent rounded-[32%] text-white">
        <Spark className="size-[55%]" />
      </AvatarFallback>
    </Avatar>
  )
}

export function BotAvatar({ src, children, className }: { src?: string; children?: ReactNode; className?: string }) {
  return (
    <Avatar className={cn("h-full w-full rounded-[32%]", className)} data-bot-avatar="">
      {src ? <AvatarImage src={src} className="rounded-[32%] object-cover" /> : null}
      <AvatarFallback className="avatar-bot rounded-[32%] text-2xs font-semibold text-muted-foreground [&_svg]:size-[55%]">{children}</AvatarFallback>
    </Avatar>
  )
}

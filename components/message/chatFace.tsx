"use client"

import { memo, type ReactNode } from "react"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { AgentAvatar, BotAvatar } from "@/components/ui/graphics/PrincipalAvatar"
import { useUserAvatar } from "@/hooks/useUserAvatar"
import { useBotKind } from "@/hooks/useBotKinds"
import { isAIBot } from "@/lib/botCopy"
import { getNameInitials } from "@/lib/utils/getNameInitials"
import { getAvatarFallbackClass } from "@/lib/utils/getAvatarColor"
import { relayInitials } from "@/lib/relayedAuthor"
import { ArrowDownToLine, ArrowLeftRight, Clock, Plug } from "@/lib/icons"
import { cn } from "@/lib/utils/helpers/cn"

/**
 * A bot's glyph by its kind (design v3 chat, C09): the Check-in a clock, the
 * Slack bridge two arrows (the Slack mark is not ours to draw), a workflow or
 * webhook a plug, an import an arrow into a tray. Anything else keeps its
 * initial.
 */
export function botGlyph(kind: string | null | undefined): ReactNode | null {
    switch (kind) {
        case "checkin":
            return <Clock aria-hidden="true" />
        case "bridge":
            return <ArrowLeftRight aria-hidden="true" />
        case "automation":
            return <Plug aria-hidden="true" />
        case "import":
            return <ArrowDownToLine aria-hidden="true" />
        default:
            return null
    }
}

interface ChatFaceProps {
    name: string
    profileKey?: string | null
    userUUID?: string
    isBot?: boolean
    /** A guest or Slack person: a person in their own hue, never an image. */
    relayed?: boolean
    /** Its size in px; initials are two letters from 28px up and one below. */
    size: number
    className?: string
}

/**
 * Every face in a conversation that isn't a row's own avatar: a stack in the
 * header, a thread's facepile, a reply line, the mention list, a seen
 * receipt. One drawing for each kind of principal (design v3, §3.9): a person
 * a saturated disc with white initials (or their photo), an agent the 32%
 * square with the spark, a bot the neutral square with its glyph.
 */
export const ChatFace = memo(function ChatFace({ name, profileKey, userUUID, isBot = false, relayed = false, size, className }: ChatFaceProps) {
    const { src } = useUserAvatar(relayed ? undefined : profileKey)
    const kind = useBotKind(userUUID, isBot && !relayed)
    const box = { width: size, height: size }
    if (isBot && !relayed) {
        return (
            <span className={cn("inline-flex shrink-0", className)} style={box}>
                {isAIBot(kind) ? <AgentAvatar src={src} /> : <BotAvatar src={src}>{botGlyph(kind) ?? getNameInitials(name).slice(0, 1)}</BotAvatar>}
            </span>
        )
    }
    const initials = relayed ? relayInitials(name) : getNameInitials(name || "?")
    const shown = size >= 28 ? initials.slice(0, 2) : initials.slice(0, 1)
    return (
        <Avatar className={cn("shrink-0", className)} style={box}>
            {src ? <AvatarImage src={src} alt="" /> : null}
            <AvatarFallback className={cn("font-semibold leading-none", getAvatarFallbackClass(name))} style={{ fontSize: Math.round(size * 0.375 * 10) / 10 }}>
                {shown}
            </AvatarFallback>
        </Avatar>
    )
})

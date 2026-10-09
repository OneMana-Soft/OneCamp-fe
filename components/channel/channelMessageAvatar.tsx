"use client"

import { useUserAvatar } from "@/hooks/useUserAvatar"
import { getNameInitials } from "@/lib/utils/getNameInitials"
import { getAvatarFallbackClass } from "@/lib/utils/getAvatarColor"
import { cn } from "@/lib/utils/helpers/cn"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Sparkles } from "@/lib/icons"
import { useBotKind } from "@/hooks/useBotKinds"
import { isAIBot } from "@/lib/botCopy"
import { guestInitials } from "@/lib/guestAuthor"

interface ChannelMessageAvatarProps {
    userProfileKey?: string
    userName: string
    /**
     * A bot is drawn as a different kind of thing: a rounded square, never a
     * person's pastel circle. The shape carries the meaning, so it survives
     * colour blindness and a custom profile image. An agent (an AI is behind
     * it) also takes the agent colour and a small sparkle; the Check-in, Slack
     * and other plain bots stay neutral, claiming no AI.
     */
    isBot?: boolean
    /** Whose avatar, for a bot to be told apart by its kind. */
    userUUID?: string
    /**
     * Someone outside the workspace (a channel or doc guest), named by userName.
     * A person, so a circle, but neutral: no profile image (they have none; the
     * Guests bot's would stand in for every guest) and no member's colour.
     */
    guest?: boolean
}

export const ChannelMessageAvatar = ({
    userName,
    userProfileKey,
    isBot = false,
    userUUID,
    guest = false,
}: ChannelMessageAvatarProps) => {
    const { src: imageSrc } = useUserAvatar(guest ? undefined : userProfileKey)
    const kind = useBotKind(userUUID, isBot && !guest)
    const nameInitial = getNameInitials(userName)

    if (guest) {
        return (
            <Avatar className="h-full w-full" data-guest-avatar="">
                <AvatarFallback className="bg-muted text-2xs font-semibold text-muted-foreground">
                    {guestInitials(userName)}
                </AvatarFallback>
            </Avatar>
        )
    }

    if (isBot && !isAIBot(kind)) {
        return (
            <Avatar className="h-full w-full rounded-[28%] ring-1 ring-border" data-bot-avatar="">
                <AvatarImage src={imageSrc} className="rounded-[28%]" />
                <AvatarFallback className="rounded-[28%] bg-muted text-2xs font-semibold text-muted-foreground">
                    {nameInitial}
                </AvatarFallback>
            </Avatar>
        )
    }

    if (isBot) {
        return (
            <span className="relative block h-full w-full" data-agent-avatar="">
                <Avatar className="h-full w-full rounded-[28%] ring-1 ring-agent/30">
                    <AvatarImage src={imageSrc} className="rounded-[28%]" />
                    <AvatarFallback className="rounded-[28%] bg-agent-muted text-2xs font-semibold text-agent">
                        {nameInitial}
                    </AvatarFallback>
                </Avatar>
                <span
                    aria-hidden="true"
                    className="absolute -bottom-0.5 -right-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-agent text-agent-foreground ring-2 ring-background"
                >
                    <Sparkles className="h-2 w-2" strokeWidth={2.5} />
                </span>
            </span>
        )
    }

    return (
        <Avatar className="h-full w-full">
            <AvatarImage src={imageSrc} />
            <AvatarFallback
                className={cn(
                    "text-2xs font-semibold",
                    getAvatarFallbackClass(userName),
                )}
            >
                {nameInitial}
            </AvatarFallback>
        </Avatar>
    )
}

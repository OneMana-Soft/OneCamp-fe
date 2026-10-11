"use client"

import { useUserAvatar } from "@/hooks/useUserAvatar"
import { getNameInitials } from "@/lib/utils/getNameInitials"
import { getAvatarFallbackClass } from "@/lib/utils/getAvatarColor"
import { cn } from "@/lib/utils/helpers/cn"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { AgentAvatar, BotAvatar } from "@/components/ui/graphics/PrincipalAvatar"
import { useBotKind } from "@/hooks/useBotKinds"
import { isAIBot } from "@/lib/botCopy"
import { botGlyph } from "@/components/message/chatFace"

interface ChannelMessageAvatarProps {
    userProfileKey?: string
    userName: string
    /**
     * A bot is drawn as a different kind of thing: a 32% square, never a
     * person's circle (design v3). The shape carries the meaning, so it
     * survives colour blindness and a custom profile image. An agent (an AI
     * is behind it) is the agent gradient with the spark; the Check-in, Slack
     * and other plain bots stay neutral, claiming no AI.
     */
    isBot?: boolean
    /** Whose avatar, for a bot to be told apart by its kind. */
    userUUID?: string
}

export const ChannelMessageAvatar = ({
    userName,
    userProfileKey,
    isBot = false,
    userUUID,
}: ChannelMessageAvatarProps) => {
    const { src: imageSrc } = useUserAvatar(userProfileKey)
    const kind = useBotKind(userUUID, isBot)
    const nameInitial = getNameInitials(userName)

    if (isBot && !isAIBot(kind)) {
        return <BotAvatar src={imageSrc}>{botGlyph(kind) ?? nameInitial.slice(0, 1)}</BotAvatar>
    }

    if (isBot) {
        return <AgentAvatar src={imageSrc} />
    }

    return (
        <Avatar className="h-full w-full">
            <AvatarImage src={imageSrc} />
            {/* About 37.5% of the 36px disc (design v3, §3.9). */}
            <AvatarFallback
                className={cn("text-ui-sm leading-none", getAvatarFallbackClass(userName))}
            >
                {nameInitial}
            </AvatarFallback>
        </Avatar>
    )
}

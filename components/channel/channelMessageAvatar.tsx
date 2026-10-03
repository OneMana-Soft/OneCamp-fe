"use client"

import { useUserAvatar } from "@/hooks/useUserAvatar"
import { getNameInitials } from "@/lib/utils/getNameInitials"
import { getAvatarFallbackClass } from "@/lib/utils/getAvatarColor"
import { cn } from "@/lib/utils/helpers/cn"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Sparkles } from "@/lib/icons"

interface ChannelMessageAvatarProps {
    userProfileKey?: string
    userName: string
    /**
     * An agent is drawn as a different kind of thing: a rounded square in the
     * agent colour with a small sparkle, never a person's pastel circle. The
     * shape carries the meaning too, so it survives colour blindness and a
     * custom profile image.
     */
    isAgent?: boolean
}

export const ChannelMessageAvatar = ({
    userName,
    userProfileKey,
    isAgent = false,
}: ChannelMessageAvatarProps) => {
    const { src: imageSrc } = useUserAvatar(userProfileKey)
    const nameInitial = getNameInitials(userName)

    if (isAgent) {
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

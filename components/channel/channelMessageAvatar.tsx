"use client"

import { useUserAvatar } from "@/hooks/useUserAvatar"
import { getNameInitials } from "@/lib/utils/getNameInitials"
import { getAvatarFallbackClass } from "@/lib/utils/getAvatarColor"
import { cn } from "@/lib/utils/helpers/cn"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"

interface ChannelMessageAvatarProps {
    userProfileKey?: string
    userName: string
}

export const ChannelMessageAvatar = ({
    userName,
    userProfileKey,
}: ChannelMessageAvatarProps) => {
    const { src: imageSrc } = useUserAvatar(userProfileKey)
    const nameInitial = getNameInitials(userName)

    return (
        <Avatar className="h-full w-full">
            <AvatarImage src={imageSrc} />
            <AvatarFallback
                className={cn(
                    "text-[11px] font-semibold",
                    getAvatarFallbackClass(userName),
                )}
            >
                {nameInitial}
            </AvatarFallback>
        </Avatar>
    )
}

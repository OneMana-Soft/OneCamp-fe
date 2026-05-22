"use client"

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import * as React from "react"
import { useUserAvatar } from "@/hooks/useUserAvatar"
import { getNameInitials } from "@/lib/utils/format/getNameIntials"
import { getAvatarFallbackClass } from "@/lib/utils/getAvatarColor"
import { cn } from "@/lib/utils/helpers/cn"

interface UserAvatarNavProp {
    userProfileObjKey?: string
    userName?: string
}

export function ChatUserAvatar({ userProfileObjKey, userName }: UserAvatarNavProp) {
    const { src: imageSrc } = useUserAvatar(userProfileObjKey)
    const nameInitial = getNameInitials(userName)

    return (
        <Avatar className="h-9 w-9 hover:cursor-pointer">
            <AvatarImage src={imageSrc || ""} />
            <AvatarFallback
                className={cn(
                    "text-xs font-semibold",
                    getAvatarFallbackClass(userName),
                )}
            >
                {nameInitial}
            </AvatarFallback>
        </Avatar>
    )
}

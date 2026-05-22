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

export function ChatUserListUserAvatar({ userProfileObjKey, userName }: UserAvatarNavProp) {
    const { src: imageSrc } = useUserAvatar(userProfileObjKey)
    const nameInitial = getNameInitials(userName)

    return (
        <Avatar className="h-8 w-8 hover:cursor-pointer">
            <AvatarImage src={imageSrc || ""} />
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

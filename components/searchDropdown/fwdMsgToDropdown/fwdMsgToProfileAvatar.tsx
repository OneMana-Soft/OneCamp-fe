"use client"

import { useUserAvatar } from "@/hooks/useUserAvatar"
import { getNameInitials } from "@/lib/utils/getNameInitials"
import { getAvatarFallbackClass } from "@/lib/utils/getAvatarColor"
import { cn } from "@/lib/utils/helpers/cn"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"

interface FwdMsgToProfileAvatarProps {
    userProfileObjKey: string | undefined
    userName: string
}

export const FwdMsgToProfileAvatar = ({
    userProfileObjKey,
    userName,
}: FwdMsgToProfileAvatarProps) => {
    const { src: imageSrc } = useUserAvatar(userProfileObjKey)
    const nameInitial = getNameInitials(userName)

    return (
        <Avatar className="w-6 h-6">
            <AvatarImage src={imageSrc} />
            <AvatarFallback
                className={cn(
                    "text-[9px] font-semibold",
                    getAvatarFallbackClass(userName),
                )}
            >
                {nameInitial}
            </AvatarFallback>
        </Avatar>
    )
}

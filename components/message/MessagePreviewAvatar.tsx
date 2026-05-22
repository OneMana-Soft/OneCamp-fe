import { UserProfileDataInterface } from "@/types/user"
import { useUserAvatar } from "@/hooks/useUserAvatar"
import { getNameInitials } from "@/lib/utils/getNameInitials"
import { getAvatarFallbackClass } from "@/lib/utils/getAvatarColor"
import { cn } from "@/lib/utils/helpers/cn"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import type * as React from "react"

interface MessagePreviewAvatarProps {
    userInfo?: UserProfileDataInterface
}

export const MessagePreviewAvatar = ({ userInfo }: MessagePreviewAvatarProps) => {
    const { src: imageSrc } = useUserAvatar(userInfo?.user_profile_object_key)
    const nameInitial = getNameInitials(userInfo && userInfo.user_name)

    return (
        <Avatar className="h-9 w-9">
            <AvatarImage src={imageSrc} />
            <AvatarFallback
                className={cn(
                    "text-[11px] font-semibold",
                    getAvatarFallbackClass(userInfo?.user_name),
                )}
            >
                {nameInitial}
            </AvatarFallback>
        </Avatar>
    )
}

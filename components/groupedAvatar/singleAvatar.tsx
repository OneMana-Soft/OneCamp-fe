import type * as React from "react"
import { UserProfileDataInterface } from "@/types/user"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { useUserAvatar } from "@/hooks/useUserAvatar"
import { getNameInitials } from "@/lib/utils/format/getNameIntials"
import { getAvatarFallbackClass } from "@/lib/utils/getAvatarColor"
import { cn } from "@/lib/utils/helpers/cn"

interface SingleAvatarProps {
    userInfo: UserProfileDataInterface
}

export function SingleAvatar({ userInfo, size }: SingleAvatarProps & { size?: number }) {
    const { src: imageSrc } = useUserAvatar(userInfo.user_profile_object_key)
    const nameInitial = getNameInitials(userInfo.user_name)

    // Scale font size relative to avatar size to prevent overflow
    const fontSize = size ? `${size * 0.4}px` : undefined

    return (
        <Avatar className="h-full w-full">
            <AvatarImage src={imageSrc} />
            <AvatarFallback
                className={cn(
                    "font-semibold flex items-center justify-center",
                    getAvatarFallbackClass(userInfo.user_name),
                )}
                style={fontSize ? { fontSize } : undefined}
            >
                {nameInitial}
            </AvatarFallback>
        </Avatar>
    )
}

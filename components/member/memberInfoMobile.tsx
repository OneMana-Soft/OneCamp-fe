"use client"

import React from "react"
import { Crown, LogOut } from "@/lib/icons"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { UserProfileDataInterface } from "@/types/user"
import { getNameInitials } from "@/lib/utils/getNameInitials"
import { getAvatarFallbackClass } from "@/lib/utils/getAvatarColor"
import { useUserAvatar } from "@/hooks/useUserAvatar"
import { useLongPress } from "@/hooks/useLongPress"
import { cn } from "@/lib/utils/helpers/cn"

interface MemberPropInfoInterface {
    userInfo: UserProfileDataInterface
    isAdmin: boolean
    longPressAction: () => void
    isSelf: boolean
}

const MemberInfoMobile: React.FC<MemberPropInfoInterface> = ({
    userInfo,
    isAdmin,
    isSelf,
    longPressAction,
}) => {
    const { src: imageSrc } = useUserAvatar(userInfo.user_profile_object_key)
    const nameInitial = getNameInitials(userInfo.user_name)

    const longPressEvent = useLongPress(longPressAction, { threshold: 500 })

    const showCrown = userInfo.user_is_admin || isAdmin
    const crownInteractive = !isSelf && isAdmin

    return (
        <div
            className="flex items-center gap-3 px-3 py-2.5 active:bg-accent/50 transition-colors duration-100 select-none"
            {...longPressEvent}
        >
            <Avatar className="h-10 w-10 shrink-0">
                <AvatarImage src={imageSrc} alt={userInfo.user_name} />
                <AvatarFallback
                    className={cn(
                        "text-xs font-semibold",
                        getAvatarFallbackClass(userInfo.user_name),
                    )}
                >
                    {nameInitial}
                </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 min-w-0">
                    <span className="text-sm font-medium text-foreground truncate">
                        {userInfo.user_name}
                    </span>
                    {isSelf && (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-muted text-muted-foreground shrink-0">
                            You
                        </span>
                    )}
                </div>
                <div className="text-xs text-muted-foreground truncate mt-0.5">
                    {userInfo.user_email_id}
                </div>
            </div>
            {showCrown && (
                <Crown
                    className={cn(
                        "size-4 shrink-0",
                        userInfo.user_is_admin
                            ? "text-amber-500 fill-amber-500"
                            : "text-muted-foreground",
                        crownInteractive && "cursor-pointer",
                    )}
                    aria-label={userInfo.user_is_admin ? "Admin" : undefined}
                />
            )}
        </div>
    )
}

export default MemberInfoMobile

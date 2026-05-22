"use client"

import React from "react"
import { Crown, LogOut } from "@/lib/icons"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { UserProfileDataInterface, UserProfileInterface } from "@/types/user"
import { getNameInitials } from "@/lib/utils/getNameInitials"
import { getAvatarFallbackClass } from "@/lib/utils/getAvatarColor"
import { useFetchOnlyOnce } from "@/hooks/useFetch"
import { useUserAvatar } from "@/hooks/useUserAvatar"
import { GetEndpointUrl } from "@/services/endPoints"
import { Button } from "@/components/ui/button"
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "@/components/ui/tooltip"
import { cn } from "@/lib/utils/helpers/cn"

interface MemberPropInfoInterface {
    userInfo: UserProfileDataInterface
    isAdmin: boolean
    handleMakeAdmin: (id: string) => void
    handleRemoveAdmin: (id: string) => void
    handleRemoveMember: (id: string) => void
    blockedUUID: boolean
}

const MemberInfo: React.FC<MemberPropInfoInterface> = ({
    userInfo,
    isAdmin,
    blockedUUID,
    handleRemoveAdmin,
    handleMakeAdmin,
    handleRemoveMember,
}) => {
    const { src: imageSrc } = useUserAvatar(userInfo.user_profile_object_key)
    const nameInitial = getNameInitials(userInfo.user_name)

    const selfProfile = useFetchOnlyOnce<UserProfileInterface>(
        GetEndpointUrl.SelfProfile,
    )

    const isSelf =
        selfProfile.data?.data &&
        selfProfile.data?.data.user_uuid === userInfo.user_uuid

    const handleCrownClick = () => {
        if (!isAdmin || blockedUUID) return
        if (userInfo.user_is_admin) {
            handleRemoveAdmin(userInfo.user_uuid)
        } else {
            handleMakeAdmin(userInfo.user_uuid)
        }
    }

    const handleLogOutClick = () => {
        if (!blockedUUID) {
            handleRemoveMember(userInfo.user_uuid)
        }
    }

    return (
        <TooltipProvider>
            <div
                className={cn(
                    "group flex items-center justify-between gap-3 px-3 py-2 rounded-md",
                    "transition-colors duration-100",
                    "hover:bg-accent/50",
                )}
            >
                <div className="flex items-center gap-3 min-w-0">
                    <div className="relative shrink-0">
                        <Avatar className="h-9 w-9">
                            <AvatarImage
                                src={imageSrc || ""}
                                alt={userInfo.user_name}
                                className="object-cover"
                            />
                            <AvatarFallback
                                className={cn(
                                    "text-[11px] font-semibold",
                                    getAvatarFallbackClass(userInfo.user_name),
                                )}
                            >
                                {nameInitial}
                            </AvatarFallback>
                        </Avatar>
                        {userInfo.user_is_admin && (
                            <div
                                className={cn(
                                    "absolute -top-0.5 -right-0.5",
                                    "flex h-4 w-4 items-center justify-center rounded-full",
                                    "bg-amber-500 text-white ring-2 ring-background",
                                )}
                                aria-label="Admin"
                            >
                                <Crown className="h-2.5 w-2.5 fill-current" />
                            </div>
                        )}
                    </div>
                    <div className="flex flex-col min-w-0">
                        <div className="flex items-center gap-1.5 min-w-0">
                            <span className="truncate text-sm font-medium text-foreground">
                                {userInfo.user_name}
                            </span>
                            {isSelf && (
                                <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-muted text-muted-foreground">
                                    You
                                </span>
                            )}
                        </div>
                        <span className="truncate text-xs text-muted-foreground">
                            {userInfo.user_email_id}
                        </span>
                    </div>
                </div>

                <div className="flex items-center gap-0.5 shrink-0">
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Button
                                variant="ghost"
                                size="icon"
                                className={cn(
                                    "h-8 w-8 transition-colors",
                                    userInfo.user_is_admin
                                        ? "text-amber-500 hover:text-amber-600"
                                        : "text-muted-foreground hover:text-foreground",
                                )}
                                onClick={handleCrownClick}
                                disabled={!isAdmin || blockedUUID}
                                aria-label={
                                    userInfo.user_is_admin ? "Remove admin role" : "Make admin"
                                }
                            >
                                <Crown
                                    className="h-4 w-4"
                                    fill={userInfo.user_is_admin ? "currentColor" : "none"}
                                />
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="text-xs">
                            {userInfo.user_is_admin ? "Remove admin role" : "Make admin"}
                        </TooltipContent>
                    </Tooltip>

                    {blockedUUID || (!isAdmin && !isSelf) ? (
                        <div className="w-8" />
                    ) : (
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                                    onClick={handleLogOutClick}
                                    aria-label="Remove member"
                                >
                                    <LogOut className="h-4 w-4" />
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent side="top" className="text-xs">
                                Remove member
                            </TooltipContent>
                        </Tooltip>
                    )}
                </div>
            </div>
        </TooltipProvider>
    )
}

export default MemberInfo

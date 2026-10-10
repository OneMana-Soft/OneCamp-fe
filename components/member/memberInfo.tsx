"use client"

import { addressOrHandleOf, displayNameOf } from "@/lib/personName"
import React from "react"
import { Crown, LogOut } from "@/lib/icons"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { BotTag } from "@/components/ui/botTag"
import { UserProfileDataInterface, UserProfileInterface } from "@/types/user"
import { getNameInitials } from "@/lib/utils/getNameInitials"
import { getAvatarFallbackClass } from "@/lib/utils/getAvatarColor"
import { useFetchOnlyOnce } from "@/hooks/useFetch"
import { useUserAvatar } from "@/hooks/useUserAvatar"
import { useBotKind } from "@/hooks/useBotKinds"
import { botSubtitle } from "@/lib/botCopy"
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
    const botKind = useBotKind(userInfo.user_uuid, userInfo.is_bot)
    const nameInitial = getNameInitials(displayNameOf(userInfo))
    const secondLine = userInfo.is_bot ? botSubtitle(botKind) : addressOrHandleOf(userInfo)

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
                                alt={displayNameOf(userInfo)}
                                className="object-cover"
                            />
                            <AvatarFallback
                                className={cn(
                                    "text-2xs font-semibold",
                                    getAvatarFallbackClass(displayNameOf(userInfo)),
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
                                    "bg-warning text-white ring-2 ring-background",
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
                                {displayNameOf(userInfo)}
                            </span>
                            {userInfo.is_bot && (
                                <BotTag userUUID={userInfo.user_uuid} />
                            )}
                            {isSelf && (
                                <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-2xs font-medium bg-muted text-muted-foreground">
                                    You
                                </span>
                            )}
                        </div>
                        {secondLine && <span className="truncate text-xs text-muted-foreground">{secondLine}</span>}
                    </div>
                </div>

                <div className="flex items-center gap-0.5 shrink-0">
                    {userInfo.is_bot ? (
                        // AI teammates are managed from the "AI teammates" control,
                        // not the human admin/remove actions — keep the row clean.
                        <div className="w-8" />
                    ) : (
                    <>
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Button
                                variant="ghost"
                                size="icon"
                                className={cn(
                                    "h-8 w-8 transition-colors",
                                    userInfo.user_is_admin
                                        ? "text-warning-ink hover:text-warning-ink"
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
                                    className="h-8 w-8 text-muted-foreground hover:text-danger-ink hover:bg-destructive/10"
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
                    </>
                    )}
                </div>
            </div>
        </TooltipProvider>
    )
}

export default MemberInfo

"use client"

import { ArrowLeft, LogOut, Plus } from "@/lib/icons"
import { Button } from "@/components/ui/button"
import {
    Sheet,
    SheetContent,
    SheetFooter,
    SheetHeader,
    SheetTitle,
} from "@/components/ui/sheet"
import { useFetch, useFetchOnlyOnce } from "@/hooks/useFetch"
import { GetEndpointUrl, PostEndpointUrl } from "@/services/endPoints"
import {
    ChannelInfoInterfaceResp,
    ChannelMemberUpdateInterface,
    ChannelNotificationInterface,
    NotificationType,
} from "@/types/channel"
import { GroupedAvatar } from "@/components/groupedAvatar/groupedAvatar"
import { NotificationBell } from "@/components/Notification/notificationBell"
import React, { useEffect, useState } from "react"
import { getNextNotification } from "@/lib/utils/getNextNotification"
import { usePost } from "@/hooks/usePost"
import { useDispatch } from "react-redux"
import { openUI } from "@/store/slice/uiSlice"
import { UserProfileInterface } from "@/types/user"
import { cn } from "@/lib/utils/helpers/cn"

interface SidePanelProps {
    channelId: string
    open: boolean
    onOpenChange: (open: boolean) => void
}

export function ChannelMobileSheet({ open, onOpenChange, channelId }: SidePanelProps) {
    const [channelNotification, setChannelNotificationType] = useState<string>(
        NotificationType.NotificationAll,
    )
    const postNotification = usePost()
    const post = usePost()
    const selfProfile = useFetchOnlyOnce<UserProfileInterface>(GetEndpointUrl.SelfProfile)
    const channelInfo = useFetch<ChannelInfoInterfaceResp>(
        `${channelId ? GetEndpointUrl.ChannelBasicInfo + "/" + channelId : ""}`,
    )
    const isChannelCreator =
        selfProfile.data?.data.user_uuid ==
        channelInfo.data?.channel_info.ch_created_by.user_uuid

    useEffect(() => {
        if (channelInfo.data?.channel_info.notification_type) {
            setChannelNotificationType(channelInfo.data?.channel_info.notification_type)
        }
    }, [channelInfo.data?.channel_info])

    const dispatch = useDispatch()

    const UpdateNotification = async () => {
        const nextNotification = getNextNotification(channelNotification)
        await postNotification.makeRequest<ChannelNotificationInterface>({
            payload: { channel_id: channelId, notification_type: nextNotification },
            apiEndpoint: PostEndpointUrl.UpdateChannelNotification,
        })
        setChannelNotificationType(nextNotification)
    }

    const handleRemoveMember = async () => {
        if (!selfProfile.data?.data.user_uuid || isChannelCreator) return

        await post.makeRequest<ChannelMemberUpdateInterface>({
            apiEndpoint: PostEndpointUrl.RemoveChannelMember,
            payload: { channel_id: channelId, user_id: selfProfile.data?.data.user_uuid },
        })
    }

    const memberCount = channelInfo.data?.channel_info.ch_member_count || 0

    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetContent className="w-[85vw] sm:max-w-md flex flex-col h-full p-0">
                <SheetHeader className="border-b border-border/60 px-3 py-3">
                    <div className="flex justify-between items-center gap-2">
                        <div className="flex items-center gap-1 min-w-0">
                            <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => onOpenChange(false)}
                                aria-label="Close"
                                className="h-8 w-8 shrink-0"
                            >
                                <ArrowLeft className="h-4 w-4" />
                            </Button>
                            <SheetTitle className="text-base font-semibold truncate">
                                {channelInfo.data?.channel_info.ch_name}
                            </SheetTitle>
                        </div>
                        <NotificationBell
                            notificationType={channelNotification}
                            isLoading={postNotification.isSubmitting}
                            onNotCLick={UpdateNotification}
                        />
                    </div>
                </SheetHeader>

                <div className="flex flex-col flex-1 gap-6 p-4 overflow-y-auto">
                    <section className="space-y-2">
                        <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                            About
                        </h3>
                        <p className="text-sm text-foreground/90">
                            {channelInfo.data?.channel_info.ch_about || (
                                <span className="text-muted-foreground italic">No description</span>
                            )}
                        </p>
                    </section>

                    <section className="space-y-3">
                        <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                            {memberCount} {memberCount === 1 ? "member" : "members"}
                        </h3>
                        <div className="flex items-center">
                            <GroupedAvatar
                                users={channelInfo.data?.channel_info.ch_members || []}
                                max={3}
                                size={36}
                            />
                            <button
                                type="button"
                                onClick={() =>
                                    dispatch(
                                        openUI({
                                            key: "editChannelMember",
                                            data: { channelUUID: channelId },
                                        }),
                                    )
                                }
                                aria-label="Add or manage members"
                                className={cn(
                                    "rounded-full border border-dashed border-border h-9 w-9",
                                    "flex justify-center items-center text-muted-foreground",
                                    "hover:bg-accent hover:text-foreground hover:border-border",
                                    "transition-colors",
                                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
                                )}
                            >
                                <Plus className="h-4 w-4" />
                            </button>
                        </div>
                    </section>
                </div>

                {!isChannelCreator && (
                    <SheetFooter className="px-3 py-3 border-t border-border/60">
                        <button
                            type="button"
                            onClick={handleRemoveMember}
                            className={cn(
                                "flex items-center gap-2 px-3 py-2 rounded-md w-full text-sm font-medium",
                                "text-destructive hover:bg-destructive/10",
                                "active:bg-destructive/15",
                                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive/40",
                                "transition-colors",
                            )}
                        >
                            <LogOut className="h-4 w-4" />
                            Leave channel
                        </button>
                    </SheetFooter>
                )}
            </SheetContent>
        </Sheet>
    )
}

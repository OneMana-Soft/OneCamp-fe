"use client"

import * as React from "react"
import { Clapperboard, Pencil, Users, Video } from "@/lib/icons"
import {
    Drawer,
    DrawerContent,
    DrawerDescription,
    DrawerHeader,
    DrawerTitle,
} from "@/components/ui/drawer"
import { useDispatch } from "react-redux"
import { useEffect, useState } from "react"
import { usePost } from "@/hooks/usePost"
import { getNextNotification } from "@/lib/utils/getNextNotification"
import { GetEndpointUrl, PostEndpointUrl } from "@/services/endPoints"
import {
    ChannelInfoInterfaceResp,
    ChannelNotificationInterface,
    NotificationType,
} from "@/types/channel"
import { NotificationBell } from "@/components/Notification/notificationBell"
import { openUI } from "@/store/slice/uiSlice"
import { useFetch } from "@/hooks/useFetch"
import { app_channel_call } from "@/types/paths"
import { useRouter } from "next/navigation"
import { DrawerItem } from "@/components/drawers/drawerItem"

interface ChannelOptionsDrawerProps {
    drawerOpenState: boolean
    channelId: string
    setOpenState: (state: boolean) => void
}

export function ChannelOptionsDrawer({
    drawerOpenState,
    setOpenState,
    channelId,
}: ChannelOptionsDrawerProps) {
    const channelInfo = useFetch<ChannelInfoInterfaceResp>(
        `${channelId ? GetEndpointUrl.ChannelBasicInfo + "/" + channelId : ""}`,
    )

    const [channelNotification, setChannelNotificationType] = useState<string>(
        NotificationType.NotificationAll,
    )
    const postNotification = usePost()

    useEffect(() => {
        if (channelInfo.data?.channel_info.notification_type) {
            setChannelNotificationType(channelInfo.data?.channel_info.notification_type)
        }
    }, [channelInfo.data?.channel_info])

    const updateNotification = async () => {
        const nextNotification = getNextNotification(channelNotification)
        await postNotification.makeRequest<ChannelNotificationInterface>({
            payload: { channel_id: channelId, notification_type: nextNotification },
            apiEndpoint: PostEndpointUrl.UpdateChannelNotification,
        })
        setChannelNotificationType(nextNotification)
    }

    const dispatch = useDispatch()
    const router = useRouter()

    const closeDrawer = () => setOpenState(false)

    const notificationDescription =
        channelNotification === NotificationType.NotificationAll
            ? "All messages"
            : channelNotification === NotificationType.NotificationMention
              ? "Mentions only"
              : "Muted"

    return (
        <Drawer onOpenChange={closeDrawer} open={drawerOpenState}>
            <DrawerContent>
                <DrawerHeader className="sr-only">
                    <DrawerTitle className="capitalize">
                        {process.env.NEXT_PUBLIC_ORG_NAME}
                    </DrawerTitle>
                    <DrawerDescription>Channel options</DrawerDescription>
                </DrawerHeader>
                <div className="p-3 pb-6 space-y-0.5">
                    <DrawerItem
                        label="Notifications"
                        description={notificationDescription}
                        onClick={updateNotification}
                        trailing={
                            <NotificationBell
                                notificationType={channelNotification}
                                isLoading={postNotification.isSubmitting}
                                onNotCLick={updateNotification}
                            />
                        }
                    />

                    {channelInfo.data?.channel_info.ch_is_admin && (
                        <DrawerItem
                            icon={Pencil}
                            label="Edit channel"
                            onClick={() => {
                                dispatch(
                                    openUI({
                                        key: "editChannel",
                                        data: { channelUUID: channelId },
                                    }),
                                )
                                closeDrawer()
                            }}
                        />
                    )}

                    <DrawerItem
                        icon={Users}
                        label="Channel members"
                        onClick={() => {
                            dispatch(
                                openUI({
                                    key: "editChannelMember",
                                    data: { channelUUID: channelId },
                                }),
                            )
                            closeDrawer()
                        }}
                    />

                    <DrawerItem
                        icon={Video}
                        label="Join call"
                        onClick={() => {
                            closeDrawer()
                            router.push(app_channel_call + "/" + channelId)
                        }}
                    />

                    <DrawerItem
                        icon={Clapperboard}
                        label="Call recordings"
                        onClick={() => {
                            closeDrawer()
                            router.push(`/app/channel/${channelId}/recording`)
                        }}
                    />
                </div>
            </DrawerContent>
        </Drawer>
    )
}

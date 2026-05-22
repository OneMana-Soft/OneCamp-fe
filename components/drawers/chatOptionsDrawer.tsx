"use client"

import * as React from "react"
import { Clapperboard, Video } from "@/lib/icons"
import {
    Drawer,
    DrawerContent,
    DrawerDescription,
    DrawerHeader,
    DrawerTitle,
} from "@/components/ui/drawer"
import { useEffect, useState } from "react"
import { usePost } from "@/hooks/usePost"
import { getNextNotification } from "@/lib/utils/getNextNotification"
import { GetEndpointUrl, PostEndpointUrl } from "@/services/endPoints"
import { NotificationType } from "@/types/channel"
import { NotificationBell } from "@/components/Notification/notificationBell"
import { useFetchOnlyOnce } from "@/hooks/useFetch"
import { useRouter } from "next/navigation"
import { app_chat_call } from "@/types/paths"
import { ChatNotificationInterface } from "@/types/chat"
import { UserProfileInterface } from "@/types/user"
import { DrawerItem } from "@/components/drawers/drawerItem"

interface ChatOptionsDrawerProps {
    drawerOpenState: boolean
    chatId: string
    setOpenState: (state: boolean) => void
}

export function ChatOptionsDrawer({
    drawerOpenState,
    setOpenState,
    chatId,
}: ChatOptionsDrawerProps) {
    const router = useRouter()

    const [chatNotification, setChatNotificationType] = useState<string>(
        NotificationType.NotificationAll,
    )
    const postNotification = usePost()

    const otherUserInfo = useFetchOnlyOnce<UserProfileInterface>(
        `${GetEndpointUrl.SelfProfile}/${chatId}`,
    )

    const updateNotification = async () => {
        const nextNotification = getNextNotification(chatNotification)
        await postNotification.makeRequest<ChatNotificationInterface>({
            payload: { to_user_id: chatId, notification_type: nextNotification },
            apiEndpoint: PostEndpointUrl.UpdateChatNotification,
        })
        setChatNotificationType(nextNotification)
    }

    useEffect(() => {
        if (otherUserInfo.data?.data) {
            setChatNotificationType(
                otherUserInfo.data?.data.notification_type || NotificationType.NotificationAll,
            )
        }
    }, [otherUserInfo.data?.data])

    const closeDrawer = () => setOpenState(false)

    const notificationDescription =
        chatNotification === NotificationType.NotificationAll
            ? "All messages"
            : chatNotification === NotificationType.NotificationMention
              ? "Mentions only"
              : "Muted"

    return (
        <Drawer onOpenChange={closeDrawer} open={drawerOpenState}>
            <DrawerContent>
                <DrawerHeader className="sr-only">
                    <DrawerTitle className="capitalize">
                        {process.env.NEXT_PUBLIC_ORG_NAME}
                    </DrawerTitle>
                    <DrawerDescription>Chat options</DrawerDescription>
                </DrawerHeader>
                <div className="p-3 pb-6 space-y-0.5">
                    <DrawerItem
                        label="Notifications"
                        description={notificationDescription}
                        onClick={updateNotification}
                        trailing={
                            <NotificationBell
                                notificationType={chatNotification}
                                isLoading={postNotification.isSubmitting}
                                onNotCLick={updateNotification}
                            />
                        }
                    />

                    <DrawerItem
                        icon={Video}
                        label="Join call"
                        onClick={() => {
                            closeDrawer()
                            router.push(app_chat_call + "/" + chatId)
                        }}
                    />

                    <DrawerItem
                        icon={Clapperboard}
                        label="Call recordings"
                        onClick={() => {
                            closeDrawer()
                            router.push(`/app/chat/${chatId}/recording`)
                        }}
                    />
                </div>
            </DrawerContent>
        </Drawer>
    )
}

export default ChatOptionsDrawer

"use client"

import * as React from "react"
import { Clapperboard, Users, Video } from "@/lib/icons"
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
import { NotificationType } from "@/types/channel"
import { NotificationBell } from "@/components/Notification/notificationBell"
import { openUI } from "@/store/slice/uiSlice"
import { useRouter } from "next/navigation"
import { app_grp_call } from "@/types/paths"
import { useFetchOnlyOnce } from "@/hooks/useFetch"
import { RawUserDMInterface } from "@/types/user"
import { GetEndpointUrl, PostEndpointUrl } from "@/services/endPoints"
import { updateChatCallStatus } from "@/store/slice/chatSlice"
import { GrpChatNotificationInterface } from "@/types/chat"
import { DrawerItem } from "@/components/drawers/drawerItem"

interface GroupChatOptionsDrawerProps {
    drawerOpenState: boolean
    grpId: string
    setOpenState: (state: boolean) => void
}

export function GroupChatOptionsDrawer({
    drawerOpenState,
    setOpenState,
    grpId,
}: GroupChatOptionsDrawerProps) {
    const dispatch = useDispatch()
    const router = useRouter()

    const dmParticipantsInfo = useFetchOnlyOnce<RawUserDMInterface>(
        `${GetEndpointUrl.GetDmGroupParticipants}/${grpId}`,
    )

    const [grpNotification, setGrpNotificationType] = useState<string>(
        NotificationType.NotificationAll,
    )
    const postNotification = usePost()

    const updateNotification = async () => {
        const nextNotification = getNextNotification(grpNotification)
        await postNotification.makeRequest<GrpChatNotificationInterface>({
            payload: { grp_id: grpId, notification_type: nextNotification },
            apiEndpoint: PostEndpointUrl.UpdateGroupChatNotification,
        })
        setGrpNotificationType(nextNotification)
    }

    useEffect(() => {
        if (dmParticipantsInfo.data?.data) {
            setGrpNotificationType(
                dmParticipantsInfo.data?.data?.dm_notification_type ||
                    NotificationType.NotificationAll,
            )
            dispatch(
                updateChatCallStatus({
                    grpId,
                    callStatus: !!dmParticipantsInfo.data?.data?.dm_call_active,
                }),
            )
        }
    }, [dmParticipantsInfo.data?.data])

    const closeDrawer = () => setOpenState(false)

    const notificationDescription =
        grpNotification === NotificationType.NotificationAll
            ? "All messages"
            : grpNotification === NotificationType.NotificationMention
              ? "Mentions only"
              : "Muted"

    return (
        <Drawer onOpenChange={closeDrawer} open={drawerOpenState}>
            <DrawerContent>
                <DrawerHeader className="sr-only">
                    <DrawerTitle className="capitalize">
                        {process.env.NEXT_PUBLIC_ORG_NAME}
                    </DrawerTitle>
                    <DrawerDescription>Group chat options</DrawerDescription>
                </DrawerHeader>
                <div className="p-3 pb-6 space-y-0.5">
                    <DrawerItem
                        label="Notifications"
                        description={notificationDescription}
                        onClick={updateNotification}
                        trailing={
                            <NotificationBell
                                notificationType={grpNotification}
                                isLoading={postNotification.isSubmitting}
                                onNotCLick={updateNotification}
                            />
                        }
                    />

                    <DrawerItem
                        icon={Users}
                        label="Group members"
                        onClick={() => {
                            closeDrawer()
                            dispatch(openUI({ key: "editDmMember", data: { grpId } }))
                        }}
                    />

                    <DrawerItem
                        icon={Video}
                        label="Join call"
                        onClick={() => {
                            closeDrawer()
                            router.push(app_grp_call + "/" + grpId)
                        }}
                    />

                    <DrawerItem
                        icon={Clapperboard}
                        label="Call recordings"
                        onClick={() => {
                            closeDrawer()
                            router.push(`/app/chat/group/${grpId}/recording`)
                        }}
                    />
                </div>
            </DrawerContent>
        </Drawer>
    )
}

export default GroupChatOptionsDrawer

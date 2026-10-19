"use client"

import { Clapperboard, Users, Video } from "@/lib/icons"
import {
    Drawer,
    SheetCancel,
    SheetGroup,
    DrawerContent,
    DrawerDescription,
    DrawerHeader,
    DrawerTitle,
} from "@/components/ui/drawer"
import { useDispatch } from "react-redux"
import { useEffect } from "react"
import { useGroupNotification } from "@/hooks/useConversationNotification"
import { getNextNotification } from "@/lib/utils/getNextNotification"
import { NotificationType } from "@/types/channel"
import { NotificationBell } from "@/components/Notification/notificationBell"
import { openUI } from "@/store/slice/uiSlice"
import { useRouter } from "next/navigation"
import { app_grp_call } from "@/types/paths"
import { useFetchOnlyOnce } from "@/hooks/useFetch"
import { RawUserDMInterface } from "@/types/user"
import { GetEndpointUrl } from "@/services/endPoints"
import { updateChatCallStatus } from "@/store/slice/chatSlice"
import { DrawerItem } from "@/components/drawers/drawerItem"
import { FeatureGate } from "@/components/common/withFeature"
import { FEATURE_CALLS } from "@/hooks/useClientConfig"
import { WorkspaceName } from "@/hooks/useWorkspaceName"

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

    // The header's write: shown at once, a refusal taken back and said, never
    // left unhandled (hooks/useConversationNotification).
    const notification = useGroupNotification(grpId, dmParticipantsInfo.data?.data?.dm_notification_type)
    const grpNotification = notification.level
    const updateNotification = () => notification.choose(getNextNotification(grpNotification))

    useEffect(() => {
        if (dmParticipantsInfo.data?.data) {
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
        <Drawer detent="menu" onOpenChange={closeDrawer} open={drawerOpenState}>
            <DrawerContent>
                <DrawerHeader className="sr-only">
                    <DrawerTitle>
                        <WorkspaceName />
                    </DrawerTitle>
                    <DrawerDescription>Group chat options</DrawerDescription>
                </DrawerHeader>
                <div className="pb-2">
                    <SheetGroup label="Group chat">
                    <DrawerItem
                        label="Notifications"
                        description={notificationDescription}
                        onClick={updateNotification}
                        trailing={
                            <NotificationBell
                                notificationType={grpNotification}
                                isLoading={notification.busy}
                                onNotCLick={updateNotification}
                            />
                        }
                    />

                    <DrawerItem
                        icon={Users}
                        label="People and details"
                        onClick={() => {
                            closeDrawer()
                            dispatch(openUI({ key: "editDmMember", data: { grpId } }))
                        }}
                    />

                    {/* Calls need a LiveKit server, which the shipped stack does not include.
                        Hidden rather than shown-and-failing when the operator has not run one. */}
                    <FeatureGate feature={FEATURE_CALLS}>
                    <DrawerItem
                        icon={Video}
                        label="Join call"
                        onClick={() => {
                            closeDrawer()
                            router.push(app_grp_call + "/" + grpId)
                        }}
                    />
                    </FeatureGate>

                    <DrawerItem
                        icon={Clapperboard}
                        label="Call recordings"
                        onClick={() => {
                            closeDrawer()
                            router.push(`/app/chat/group/${grpId}/recording`)
                        }}
                    />
                </SheetGroup>
                    <SheetCancel />
                </div>
            </DrawerContent>
        </Drawer>
    )
}


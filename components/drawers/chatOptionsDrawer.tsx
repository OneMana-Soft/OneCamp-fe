"use client"

import { Clapperboard, Video } from "@/lib/icons"
import {
    Drawer,
    SheetCancel,
    SheetGroup,
    DrawerContent,
    DrawerDescription,
    DrawerHeader,
    DrawerTitle,
} from "@/components/ui/drawer"
import { useChatNotification } from "@/hooks/useConversationNotification"
import { getNextNotification } from "@/lib/utils/getNextNotification"
import { GetEndpointUrl } from "@/services/endPoints"
import { NotificationType } from "@/types/channel"
import { NotificationBell } from "@/components/Notification/notificationBell"
import { useFetchOnlyOnce } from "@/hooks/useFetch"
import { useRouter } from "next/navigation"
import { app_chat_call } from "@/types/paths"
import { UserProfileInterface } from "@/types/user"
import { DrawerItem } from "@/components/drawers/drawerItem"
import { FeatureGate } from "@/components/common/withFeature"
import { FEATURE_CALLS } from "@/hooks/useClientConfig"
import { WorkspaceName } from "@/hooks/useWorkspaceName"

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

    const otherUserInfo = useFetchOnlyOnce<UserProfileInterface>(
        `${GetEndpointUrl.SelfProfile}/${chatId}`,
    )

    // The header's write: shown at once, a refusal taken back and said, never
    // left unhandled (hooks/useConversationNotification).
    const notification = useChatNotification(chatId, otherUserInfo.data?.data?.notification_type)
    const chatNotification = notification.level
    const updateNotification = () => notification.choose(getNextNotification(chatNotification))

    const closeDrawer = () => setOpenState(false)

    const notificationDescription =
        chatNotification === NotificationType.NotificationAll
            ? "All messages"
            : chatNotification === NotificationType.NotificationMention
              ? "Mentions only"
              : "Muted"

    return (
        <Drawer detent="menu" onOpenChange={closeDrawer} open={drawerOpenState}>
            <DrawerContent>
                <DrawerHeader className="sr-only">
                    <DrawerTitle>
                        <WorkspaceName />
                    </DrawerTitle>
                    <DrawerDescription>Chat options</DrawerDescription>
                </DrawerHeader>
                <div className="pb-2">
                    <SheetGroup label="Chat">
                    <DrawerItem
                        label="Notifications"
                        description={notificationDescription}
                        onClick={updateNotification}
                        trailing={
                            <NotificationBell
                                notificationType={chatNotification}
                                isLoading={notification.busy}
                                onNotCLick={updateNotification}
                            />
                        }
                    />

                    {/* Calls need a LiveKit server, which the shipped stack does not include.
                        Hidden rather than shown-and-failing when the operator has not run one. */}
                    <FeatureGate feature={FEATURE_CALLS}>
                    <DrawerItem
                        icon={Video}
                        label="Join call"
                        onClick={() => {
                            closeDrawer()
                            router.push(app_chat_call + "/" + chatId)
                        }}
                    />
                    </FeatureGate>

                    <DrawerItem
                        icon={Clapperboard}
                        label="Call recordings"
                        onClick={() => {
                            closeDrawer()
                            router.push(`/app/chat/${chatId}/recording`)
                        }}
                    />
                </SheetGroup>
                    <SheetCancel />
                </div>
            </DrawerContent>
        </Drawer>
    )
}


"use client"

import * as React from "react"
import {Clapperboard, UserCircle2, Video} from "lucide-react"

import {
    Drawer,
    DrawerContent,
    DrawerDescription,
    DrawerHeader,
    DrawerTitle,
} from "@/components/ui/drawer"
import {useDispatch} from "react-redux";
import {useEffect, useState} from "react";
import {usePost} from "@/hooks/usePost";
import {getNextNotification} from "@/lib/utils/getNextNotification";
import {PostEndpointUrl, GetEndpointUrl} from "@/services/endPoints";
import {ChannelNotificationInterface, NotificationType} from "@/types/channel";
import {NotificationBell} from "@/components/Notification/notificationBell";
import {openUI} from "@/store/slice/uiSlice";
import {useFetch, useFetchOnlyOnce} from "@/hooks/useFetch";
import {useRouter} from "next/navigation";
import {app_chat_call} from "@/types/paths";
import {ChatNotificationInterface} from "@/types/chat";
import {updateUserConnectedDeviceCount, updateUserEmojiStatus, updateUserStatus} from "@/store/slice/userSlice";
import {UserEmojiStatus, UserProfileInterface} from "@/types/user";


interface chatOptionsDrawerProps {
    drawerOpenState: boolean;
    chatId: string;
    setOpenState: (state: boolean) => void;
}

export function ChatOptionsDrawer({drawerOpenState, setOpenState, chatId}: chatOptionsDrawerProps) {
    const router = useRouter();

    const [chatNotification, setChatNotificationType] = useState<string>(NotificationType.NotificationAll);
    const postNotification  = usePost();

    const otherUserInfo  = useFetchOnlyOnce<UserProfileInterface>(`${GetEndpointUrl.SelfProfile}/${chatId}`)

    const UpdateNotification = async () => {
        const nextNotification = getNextNotification(chatNotification)
        await postNotification.makeRequest<ChatNotificationInterface>({payload:{to_user_id: chatId, notification_type: nextNotification}, apiEndpoint: PostEndpointUrl.UpdateChatNotification})
        setChatNotificationType(nextNotification)
    }

    useEffect(() => {

        if(otherUserInfo.data?.data) {
            setChatNotificationType(otherUserInfo.data?.data.notification_type || NotificationType.NotificationAll)
        }

    }, [otherUserInfo.data?.data])

    function closeDrawer() {
        setOpenState(false);
    }

    const clickVideoCall = () => {
        closeDrawer();
        router.push(app_chat_call + "/" + chatId);
    }

    return (
    <Drawer onOpenChange={closeDrawer} open={drawerOpenState}>
            <DrawerContent>
                <div className="w-full mb-6">
                    <DrawerHeader className='hidden'>
                        <DrawerTitle className='capitalize'>{process.env.NEXT_PUBLIC_ORG_NAME}</DrawerTitle>
                        <DrawerDescription>Chat level</DrawerDescription>
                    </DrawerHeader>
                    <div className="p-4 pb-6">
                        <div className="flex flex-col items-center justify-start space-y-1">
                            
                            <div
                                className='w-full h-16 flex items-center justify-between cursor-pointer transition-colors hover:bg-muted/80 bg-muted/40 rounded-xl px-4 mb-2'
                                onClick={UpdateNotification}
                            >
                                <div className="flex flex-col">
                                    <span className="text-base font-semibold">Notifications</span>
                                    <span className="text-xs text-muted-foreground mt-0.5">
                                        {chatNotification === NotificationType.NotificationAll ? "All messages" :
                                        chatNotification === NotificationType.NotificationMention ? "Mentions only" : "Muted"}
                                    </span>
                                </div>
                                <div className="pointer-events-none -mr-2 bg-background/50 rounded-full shadow-sm flex items-center justify-center">
                                    <NotificationBell notificationType={chatNotification} isLoading={postNotification.isSubmitting} onNotCLick={UpdateNotification}/>
                                </div>
                            </div>

                            <div
                                className='w-full h-14 flex space-x-4 items-center cursor-pointer transition-colors hover:bg-muted/50 rounded-xl px-4'
                                onClick={clickVideoCall}
                            >
                                <Video className="h-5 w-5 text-muted-foreground"/>
                                <span className="text-base font-medium">Join Call</span>
                            </div>

                            <div
                                className='w-full h-14 flex space-x-4 items-center cursor-pointer transition-colors hover:bg-muted/50 rounded-xl px-4'
                                onClick={() => {
                                    closeDrawer();
                                    router.push(`/app/chat/${chatId}/recording`);
                                }}
                            >
                                <Clapperboard className="h-5 w-5 text-muted-foreground"/>
                                <span className="text-base font-medium">Call Recordings</span>
                            </div>
                        </div>

                    </div>
                </div>
            </DrawerContent>
        </Drawer>
    )
}

export default ChatOptionsDrawer;

"use client"

import * as React from "react"
import {Clapperboard, Users, Video} from "lucide-react"

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
import {NotificationType} from "@/types/channel";
import {NotificationBell} from "@/components/Notification/notificationBell";
import {openUI} from "@/store/slice/uiSlice";
import {useRouter} from "next/navigation";
import {app_grp_call} from "@/types/paths";
import {useFetchOnlyOnce} from "@/hooks/useFetch";
import {RawUserDMInterface} from "@/types/user";
import {GetEndpointUrl, PostEndpointUrl} from "@/services/endPoints";
import {updateChatCallStatus} from "@/store/slice/chatSlice";
import {GrpChatNotificationInterface} from "@/types/chat";


interface groupChatOptionsDrawerProps {
    drawerOpenState: boolean;
    grpId: string;
    setOpenState: (state: boolean) => void;
}

export function GroupChatOptionsDrawer({drawerOpenState, setOpenState, grpId}: groupChatOptionsDrawerProps) {
    const dispatch = useDispatch();
    const router = useRouter();

    const dmParticipantsInfo  = useFetchOnlyOnce<RawUserDMInterface>(`${GetEndpointUrl.GetDmGroupParticipants}/${grpId}`)

    const [grpNotification, setGrpNotificationType] = useState<string>(NotificationType.NotificationAll);
    const postNotification  = usePost();


    const UpdateNotification = async () => {
        const nextNotification = getNextNotification(grpNotification)
        await postNotification.makeRequest<GrpChatNotificationInterface>({payload:{grp_id: grpId, notification_type: nextNotification}, apiEndpoint: PostEndpointUrl.UpdateGroupChatNotification})
        setGrpNotificationType(nextNotification)
    }

    useEffect(() => {

        if(dmParticipantsInfo.data?.data) {
            setGrpNotificationType(dmParticipantsInfo.data?.data.dm_notification_type || NotificationType.NotificationAll)
            dispatch(updateChatCallStatus({grpId: grpId, callStatus: !!dmParticipantsInfo.data?.data.dm_call_active}))
        }

    }, [dmParticipantsInfo.data?.data])

    function closeDrawer() {
        setOpenState(false);
    }

    const clickVideoCall = () => {
        closeDrawer();
        router.push(app_grp_call + "/" + grpId);
    }

    return (
    <Drawer onOpenChange={closeDrawer} open={drawerOpenState}>
            <DrawerContent>
                <div className="w-full mb-6">
                    <DrawerHeader className='hidden'>
                        <DrawerTitle className='capitalize'>{process.env.NEXT_PUBLIC_ORG_NAME}</DrawerTitle>
                        <DrawerDescription>Group level</DrawerDescription>
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
                                        {grpNotification === NotificationType.NotificationAll ? "All messages" :
                                        grpNotification === NotificationType.NotificationMention ? "Mentions only" : "Muted"}
                                    </span>
                                </div>
                                <div className="pointer-events-none -mr-2 bg-background/50 rounded-full shadow-sm flex items-center justify-center">
                                    <NotificationBell notificationType={grpNotification} isLoading={postNotification.isSubmitting} onNotCLick={UpdateNotification}/>
                                </div>
                            </div>

                            <div
                                className='w-full h-14 flex space-x-4 items-center cursor-pointer transition-colors hover:bg-muted/50 rounded-xl px-4'
                                onClick={()=>{
                                    closeDrawer();
                                    dispatch(openUI({ key: 'editDmMember', data: {grpId} }));
                                }}
                            >
                                <Users className="h-5 w-5 text-muted-foreground" />
                                <span className="text-base font-medium">Group Members</span>
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
                                    router.push(`/app/chat/group/${grpId}/recording`);
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

export default GroupChatOptionsDrawer;

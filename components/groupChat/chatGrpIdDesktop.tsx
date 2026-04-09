import { useFetchOnlyOnce} from "@/hooks/useFetch";
import {NotificationType} from "@/types/channel";
import {GetEndpointUrl, PostEndpointUrl} from "@/services/endPoints";
import MinimalTiptapTextInput from "@/components/textInput/textInput";
import {cn} from "@/lib/utils/helpers/cn";
import {SendHorizontal, Users, Video, Clapperboard} from "lucide-react";
import {useDispatch, useSelector} from "react-redux";
import {RootState} from "@/store/store";
import {NotificationBell} from "@/components/Notification/notificationBell";
import {usePost} from "@/hooks/usePost";
import React, {useEffect, useState, useMemo} from "react";
import {getNextNotification} from "@/lib/utils/getNextNotification";



import {
    RawUserDMInterface,

} from "@/types/user";
import { GrpChatNotificationInterface} from "@/types/chat";
import {TypingIndicator} from "@/components/typingIndicator/typyingIndicaator";
import {createOrUpdateGroupChatBody, LocallyCreatedGrpInfoInterface, ChatInputState} from "@/store/slice/groupChatSlice";
import {GroupChatFileUpload} from "@/components/fileUpload/groupChatFileUpload";
import {GroupChatMessageList} from "@/components/groupChat/groupChatMessageList";
import {GroupedAvatar} from "@/components/groupedAvatar/groupedAvatar";
import {ErrorState} from "@/components/error/errorState";
import {LoadingStateCircle} from "@/components/loading/loadingStateCircle";
import {Button} from "@/components/ui/button";
import {openUI} from "@/store/slice/uiSlice";
import {addUserToUserChatList} from "@/store/slice/userSlice";
import {AddUserInChatList, updateChatCallStatus} from "@/store/slice/chatSlice";
import {getGroupingId} from "@/lib/utils/getGroupingId";
import {useRouter} from "next/navigation";
import {app_grp_call, app_grp_chat_path, app_home_path} from "@/types/paths";
import {usePublishTyping} from "@/hooks/usePublishTyping";
import CatchMeUpBanner from "@/components/ai/CatchMeUpBanner";


const EMPTY_GRP_INFO: LocallyCreatedGrpInfoInterface = {} as LocallyCreatedGrpInfoInterface
const EMPTY_TYPING_LIST: any[] = []
const EMPTY_INPUT_STATE: ChatInputState = { chatBody: '', filesUploaded: [], filesPreview: [] }

export const ChatGrpIdDesktop = ({grpId, handleSend, unreadCount}: {grpId: string, handleSend: ()=>void, unreadCount?: number}) => {

    const dispatch = useDispatch()
    const grpChatCreatedLocally = useSelector((state: RootState) => state.groupChat.locallyCreatedGrpInfo[grpId] || EMPTY_GRP_INFO);

    const postNotification  = usePost()
    const dmParticipantsInfo  = useFetchOnlyOnce<RawUserDMInterface>(`${GetEndpointUrl.GetDmGroupParticipants}/${grpId}`)
    const [chatNotification, setChatNotificationType] = useState<string>(NotificationType.NotificationAll)

    const chatState = useSelector((state: RootState) => state.groupChat.chatInputState[grpId] || EMPTY_INPUT_STATE);

    const chatCallActive = useSelector((state: RootState) => state.chat.chatCallStatus[grpId]?.active || false);

    const { publishTyping } = usePublishTyping({ targetType: 'groupChat', targetId: grpId });

    const router = useRouter();

    useEffect(() => {

        if(dmParticipantsInfo.data?.data) {
            setChatNotificationType(dmParticipantsInfo.data?.data?.dm_notification_type || NotificationType.NotificationAll)
            dispatch(updateChatCallStatus({grpId: grpId, callStatus: !!dmParticipantsInfo.data?.data?.dm_call_active}))

        }

    }, [dmParticipantsInfo.data?.data, grpId, dispatch])

    useEffect(() => {

        if(grpChatCreatedLocally.grpId || dmParticipantsInfo.data?.data?.dm_grouping_id) {


            let d =  dmParticipantsInfo.data?.data

            if(!d) {
                 d = {
                     dm_unread: 0,
                     dm_grouping_id: grpChatCreatedLocally.grpId,
                     dm_participants: grpChatCreatedLocally.participants,
                     dm_notification_type: NotificationType.NotificationAll,
                     dm_recording: [],
                 }
            }

            dispatch(addUserToUserChatList({ chatUserDm: d }));
            dispatch(AddUserInChatList({ usersDm: d }));
        }


    }, [grpChatCreatedLocally, dmParticipantsInfo.data, dispatch]);

    if(dmParticipantsInfo.isLoading && !grpChatCreatedLocally.participants) return <LoadingStateCircle />

    if(!dmParticipantsInfo.isLoading && !grpChatCreatedLocally.participants && !dmParticipantsInfo.data?.data) {
        return <ErrorState   errorMessage={'failed to fetch group chat'} errorTitle={'Conversation not found'}/>
    }

    // const toggleFavourite = async () => {
    //         if(isFavorite) {
    //            await postFav.makeRequest({apiEndpoint: PostEndpointUrl.RemoveFavChannel, appendToUrl:`/${channelId}`, onSuccess : ()=>{
    //                    setFavorite(false)}})
    //         } else {
    //             await postFav.makeRequest({apiEndpoint: PostEndpointUrl.AddFavChannel, appendToUrl:`/${channelId}`, onSuccess : ()=>{setFavorite(true)}})
    //         }
    // }

    const clickVideoCall = () => {
        router.push(app_grp_call + "/" + grpId);

    }

    const UpdateNotification = async () => {
        const nextNotification = getNextNotification(chatNotification)
        await postNotification.makeRequest<GrpChatNotificationInterface>({payload:{grp_id: grpId, notification_type: nextNotification}, apiEndpoint: PostEndpointUrl.UpdateGroupChatNotification})
        setChatNotificationType(nextNotification)
    }

    const participants = grpChatCreatedLocally.participants || dmParticipantsInfo.data?.data?.dm_participants || []


    return (
        <div className='flex flex-col h-full relative'>
            <div
                className='flex font-semibold text-lg p-2 truncate overflow-auto overflow-ellipsis justify-start border-b'>
                <div className='flex justify-center items-center space-x-2'>
                    <div className='relative'>
                        {/*<ChatUserAvatar userName={otherUserInfo.data?.data.user_name}*/}
                        {/*                userProfileObjKey={otherUserInfo.data?.data.user_profile_object_key}/>*/}

                    </div>
                    <div>
                        {/*{otherUserInfo.data?.data.user_name}*/}
                    </div>
                </div>
                <div className='flex justify-center items-center ml-2 gap-x-2'>
                {/*<Button size='icon' variant='ghost' onClick={toggleFavourite}><Star  className='text-muted-foreground' fill={isFavorite ?"#ffcc00":'none'}/></Button>*/}

                    <GroupedAvatar users={participants} max={2} overlap={20} className={'!pr-0'}/>

                    {/*<Button size='icon' variant='ghost' onClick={()=>{dispatch(openUpdateChannelDialog({channelUUID: channelId}))}}><Pencil /></Button>*/}
                    {/*<Button size='icon' variant='ghost' onClick={()=>{dispatch(openUpdateChannelMemberDialog({channelUUID: channelId}))}}> <Users /></Button>*/}

                    <div className="text-ellipsis truncate max-w-40">

                        {participants.map((item, index) => (
                            <span key={index}>
                                {item.user_name}
                                {index < participants.length - 1 && ', '}
                            </span>
                        ))}

                    </div>

                    {
                        dmParticipantsInfo.data?.data &&
                        <NotificationBell notificationType={chatNotification} isLoading={postNotification.isSubmitting} onNotCLick={UpdateNotification}/>
                    }
                    <Button size='icon' variant='ghost' onClick={()=>{dispatch(openUI({ key: 'editDmMember', data: {grpId: grpId} }))}}> <Users /></Button>
                    <Button
                        size='icon'
                        variant={chatCallActive ? 'secondary' : 'ghost'}
                        className={cn(
                            "relative transition-all duration-300",
                            chatCallActive && "bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 hover:bg-green-200 dark:hover:bg-green-800/40"
                        )}
                        onClick={clickVideoCall}
                    >
                        <Video size={18} />
                        {chatCallActive && (
                            <span className="absolute -top-0.5 -right-0.5 flex h-2.5 w-2.5">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500"></span>
                            </span>
                        )}
                    </Button>
                    <Button size='icon' variant='ghost' onClick={() => router.push(`/app/chat/group/${grpId}/recording`)}> <Clapperboard /></Button>


                </div>


            </div>
            <div className="flex-1 overflow-y-auto">
                <CatchMeUpBanner
                    channelUUID={grpId}
                    unreadCount={unreadCount || 0}
                    channelName={participants.slice(0, 3).map(u => u.user_name).join(', ') + (participants.length > 3 ? '...' : '')}
                    isChannel={false}
                    type="group"
                />
                <GroupChatMessageList grpId={grpId} />
            </div>

            <div className="sticky bottom-0 left-0 right-0 z-50 border-t p-4 ">
                <div>
                    <MinimalTiptapTextInput
                        throttleDelay={300}
                        attachmentOnclick = {()=>{dispatch(openUI({ key: 'groupChatFileUpload' }))}}
                        className={cn("max-w-full rounded-xl h-auto border-none")}
                        editorContentClassName="overflow-auto mb-2"
                        output="html"
                        content={chatState.chatBody}
                        placeholder={"message"}
                        editable={true}
                        ButtonIcon={SendHorizontal}
                        buttonOnclick={handleSend}
                        editorClassName="focus:outline-none px-2 py-2"
                        onChange={(content ) => {
                            publishTyping()
                            dispatch(createOrUpdateGroupChatBody({grpID:grpId, body: content as string}))
                        }}
                    >
                        <GroupChatFileUpload groupChatID={grpId} />
                    </MinimalTiptapTextInput>
                </div>
            </div>

        </div>
    )
}
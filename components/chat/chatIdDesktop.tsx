import {useFetch, useFetchOnlyOnce} from "@/hooks/useFetch";
import {NotificationType} from "@/types/channel";
import {GetEndpointUrl, PostEndpointUrl} from "@/services/endPoints";
import MinimalTiptapTextInput from "@/components/textInput/textInput";
import {cn} from "@/lib/utils/helpers/cn";
import {SendHorizontal, Video, Clapperboard} from "lucide-react";
import {useDispatch, useSelector} from "react-redux";
import {RootState} from "@/store/store";
import {NotificationBell} from "@/components/Notification/notificationBell";
import {usePost} from "@/hooks/usePost";
import React, {useEffect, useMemo, useState} from "react";
import {getNextNotification} from "@/lib/utils/getNextNotification";

import {openUI} from "@/store/slice/uiSlice";


import {ChatMessageList} from "@/components/chat/chatMessageList";
import {USER_STATUS_ONLINE, UserEmojiStatus, UserProfileInterface} from "@/types/user";
import {ChatNotificationInterface} from "@/types/chat";
import {ChatUserAvatar} from "@/components/chat/chatUserAvatar";
import {ChatFileUpload} from "@/components/fileUpload/chatFileUpload";
import {createOrUpdateChatBody} from "@/store/slice/chatSlice";
import {TypingIndicator} from "@/components/typingIndicator/typyingIndicaator";
import {updateUserConnectedDeviceCount, updateUserEmojiStatus, updateUserStatus, UserEmojiInterface} from "@/store/slice/userSlice";
import {ChatUserEmojiStatus} from "@/components/chat/chatUserEmojiStatus";
import {Button} from "@/components/ui/button";
import {app_channel_call, app_chat_call} from "@/types/paths";
import Link from "next/link";
import { ChatSkeleton } from "@/components/ui/AppSkeleton";
import {usePublishTyping} from "@/hooks/usePublishTyping";
import {useUserInfoState} from "@/hooks/useUserInfoState";
import CatchMeUpBanner from "@/components/ai/CatchMeUpBanner";


export const ChatIdDesktop = ({chatId, handleSend, unreadCount}: {chatId: string, handleSend: ()=>void, unreadCount?: number}) => {

    const dispatch = useDispatch()
    const postNotification  = usePost()
    const otherUserInfo  = useFetchOnlyOnce<UserProfileInterface>(`${GetEndpointUrl.SelfProfile}/${chatId}`)
    const [chatNotification, setChatNotificationType] = useState<string>(NotificationType.NotificationAll)


    const { publishTyping } = usePublishTyping({ targetType: 'chat', targetId: chatId });

    // Use a memoized selector with custom equality to prevent unnecessary re-renders
    const rawChatTypingState = useSelector(
        (state: RootState) => state.typing.chatTyping[chatId],
        // Custom equality function to prevent re-renders when array reference changes but content is the same
        (prev, next) => {
            // If both are undefined, they're equal
            if (!prev && !next) return true;
            
            // If one is undefined and the other isn't, they're different
            if (!prev || !next) return false;
            
            // If lengths differ, they're different
            if (prev.length !== next.length) return false;
            
            // Compare user IDs to check if the typing users are the same
            return prev.every((item, index) => 
                item.userId === next[index]?.userId
            );
        }
    );

    const chatCallHref = `${app_chat_call}/${chatId}`;
    const chatRecordingHref = `/app/chat/${chatId}/recording`;
    // Memoize the mapped result to prevent creating a new array on every render
    const chatTypingState = useMemo(() => 
        (rawChatTypingState || []).map(item => item.user),
        [rawChatTypingState]
    );

    const EMPTY_INPUT_STATE = {};
    const EMPTY_USER_STATUS: UserEmojiInterface = { deviceConnected: 0 } as UserEmojiInterface;

    const chatState = useSelector((state: RootState) => state.chat.chatInputState[chatId] || EMPTY_INPUT_STATE);

    const chatCallStatusActive = useSelector((state: RootState) => state.chat.chatCallStatus[chatId]?.active || false);

    const userStatusState = useUserInfoState(chatId);

    useEffect(() => {

        if(otherUserInfo.data?.data) {
            setChatNotificationType(otherUserInfo.data?.data.notification_type || NotificationType.NotificationAll)
            dispatch(updateUserEmojiStatus({userUUID: otherUserInfo.data?.data.user_uuid, status:otherUserInfo.data?.data?.user_emoji_statuses?.[0] || {}  as UserEmojiStatus}));
            dispatch(updateUserStatus({userUUID: otherUserInfo.data?.data.user_uuid, status:otherUserInfo.data.data.user_status || 'online'}));
            dispatch(updateUserConnectedDeviceCount({userUUID: otherUserInfo.data?.data.user_uuid, deviceConnected:otherUserInfo.data?.data.user_device_connected || 0}));

        }

    }, [otherUserInfo.data?.data])

    if(otherUserInfo.isLoading) return <ChatSkeleton />

    if(!otherUserInfo.data?.data && !otherUserInfo.isLoading) return

    // const toggleFavourite = async () => {
    //         if(isFavorite) {
    //            await postFav.makeRequest({apiEndpoint: PostEndpointUrl.RemoveFavChannel, appendToUrl:`/${channelId}`, onSuccess : ()=>{
    //                    setFavorite(false)}})
    //         } else {
    //             await postFav.makeRequest({apiEndpoint: PostEndpointUrl.AddFavChannel, appendToUrl:`/${channelId}`, onSuccess : ()=>{setFavorite(true)}})
    //         }
    // }


    const UpdateNotification = async () => {
        const nextNotification = getNextNotification(chatNotification)
        await postNotification.makeRequest<ChatNotificationInterface>({payload:{to_user_id: chatId, notification_type: nextNotification}, apiEndpoint: PostEndpointUrl.UpdateChatNotification})
        setChatNotificationType(nextNotification)
    }

    const isReduxLoaded = userStatusState && userStatusState.deviceConnected !== -1;
    const currentStatus = isReduxLoaded && userStatusState.status ? userStatusState.status : (otherUserInfo.data?.data.user_status || 'offline');
    const currentDeviceCount = isReduxLoaded ? userStatusState.deviceConnected : (otherUserInfo.data?.data.user_device_connected || 0);

    const isOnline = currentStatus === USER_STATUS_ONLINE && currentDeviceCount > 0;


    return (
        <div className='flex flex-col h-full relative'>
            <div
                className='flex font-semibold text-lg p-2 truncate overflow-auto overflow-ellipsis justify-start border-b'>
                <div className='flex justify-center items-center space-x-2'>
                    <div className='relative'>
                        <ChatUserAvatar userName={otherUserInfo.data?.data.user_name ?? undefined}
                                        userProfileObjKey={otherUserInfo.data?.data.user_profile_object_key ?? undefined}/>
                        {isOnline && <div className={`h-2.5 w-2.5 ring-[2px] ring-background rounded-full bg-green-500 absolute bottom-0 right-0`}></div>}

                    </div>
                    <div>{otherUserInfo.data?.data.user_name}</div>
                </div>
                <div className='flex justify-center items-center ml-2'>
                {/*<Button size='icon' variant='ghost' onClick={toggleFavourite}><Star  className='text-muted-foreground' fill={isFavorite ?"#ffcc00":'none'}/></Button>*/}
                    <ChatUserEmojiStatus userUUID={chatId}/>
                    <NotificationBell notificationType={chatNotification} isLoading={postNotification.isSubmitting} onNotCLick={UpdateNotification}/>
                    <Link href={chatCallHref}>
                    <Button
                        size='icon'
                        variant={chatCallStatusActive ? 'secondary' : 'ghost'}
                        className={cn(
                            "relative transition-all duration-300",
                            chatCallStatusActive && "bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 hover:bg-green-200 dark:hover:bg-green-800/40"
                        )}
                    >
                        <Video size={18} />
                        {chatCallStatusActive && (
                            <span className="absolute -top-0.5 -right-0.5 flex h-2.5 w-2.5">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500"></span>
                            </span>
                        )}
                    </Button>
                    </Link>
                    <Link href={chatRecordingHref}><Button size='icon' variant='ghost'> <Clapperboard /></Button></Link>
                    {/*<Button size='icon' variant='ghost' onClick={()=>{dispatch(openUpdateChannelDialog({channelUUID: channelId}))}}><Pencil /></Button>*/}
                    {/*<Button size='icon' variant='ghost' onClick={()=>{dispatch(openUpdateChannelMemberDialog({channelUUID: channelId}))}}> <Users /></Button>*/}


                </div>


            </div>
            <div className="flex-1 overflow-y-auto">
                <CatchMeUpBanner
                    channelUUID={chatId}
                    unreadCount={unreadCount || 0}
                    channelName={otherUserInfo.data?.data.user_name}
                    isChannel={false}
                    type="dm"
                />
                <ChatMessageList chatId={chatId} />
            </div>

            <div className="sticky bottom-0 left-0 right-0 z-50 border-t p-4 ">
                <div>
                    <MinimalTiptapTextInput
                        throttleDelay={300}
                        attachmentOnclick = {()=>{dispatch(openUI({ key: 'chatFileUpload' }))}}
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
                            dispatch(createOrUpdateChatBody({chatUUID:chatId, body: content as string}))
                        }}
                    >
                        <ChatFileUpload chatUUID={chatId} />
                    </MinimalTiptapTextInput>
                </div>
            </div>

        </div>
    )
}
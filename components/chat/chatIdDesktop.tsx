import {useFetch, useFetchOnlyOnce} from "@/hooks/useFetch";
import {NotificationType} from "@/types/channel";
import {GetEndpointUrl, PostEndpointUrl} from "@/services/endPoints";
import MinimalTiptapTextInput from "@/components/textInput/textInput";
import {cn} from "@/lib/utils/helpers/cn";
import { statusColors } from "@/lib/colors";
import { SendHorizontal, Video, Clapperboard } from "@/lib/icons";
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
import {useUploadFile} from "@/hooks/useUploadFile";
import {getGroupingId} from "@/lib/utils/getGroupingId";
import CommandSurface from "@/components/command/CommandSurface";


export const ChatIdDesktop = ({chatId, handleSend, unreadCount}: {chatId: string, handleSend: (latestContent?: string)=>void, unreadCount?: number}) => {

    const dispatch = useDispatch()
    const postNotification  = usePost()
    const otherUserInfo  = useFetchOnlyOnce<UserProfileInterface>(`${GetEndpointUrl.SelfProfile}/${chatId}`)
    const selfProfile = useFetchOnlyOnce<UserProfileInterface>(GetEndpointUrl.SelfProfile)
    const [chatNotification, setChatNotificationType] = useState<string>(NotificationType.NotificationAll)
    const uploadFile = useUploadFile()

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
            // Reducer ignores empty/undefined payloads — see
            // userSlice.updateUserEmojiStatus. Profile responses omit
            // user_emoji_statuses when there is no active status, and
            // we mustn't let that absence clobber a value delivered by
            // MQTT or the self-profile load.
            dispatch(updateUserEmojiStatus({userUUID: otherUserInfo.data?.data.user_uuid, status: otherUserInfo.data?.data?.user_emoji_statuses?.[0] as UserEmojiStatus}));
            dispatch(updateUserStatus({userUUID: otherUserInfo.data?.data.user_uuid, status:otherUserInfo.data.data.user_status || 'online'}));
            dispatch(updateUserConnectedDeviceCount({userUUID: otherUserInfo.data?.data.user_uuid, deviceConnected:otherUserInfo.data?.data.user_device_connected || 0}));

        }

    }, [otherUserInfo.data?.data])

    if(otherUserInfo.isLoading) return <ChatSkeleton />

    if(!otherUserInfo.data?.data && !otherUserInfo.isLoading) return


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
            <header className='flex items-center justify-between gap-2 h-12 md:h-14 px-3 md:px-4 border-b border-border/60 bg-background sticky top-0 z-[var(--z-sticky)]'>
                <div className='flex items-center gap-2.5 min-w-0'>
                    <div className='relative shrink-0'>
                        <ChatUserAvatar userName={otherUserInfo.data?.data.user_name ?? undefined}
                                        userProfileObjKey={otherUserInfo.data?.data.user_profile_object_key ?? undefined}/>
                        {isOnline && <span aria-hidden className={`h-2.5 w-2.5 ring-2 ring-background rounded-full ${statusColors.online.solid} absolute bottom-0 right-0`}/>}

                    </div>
                    <div className='flex flex-col min-w-0'>
                        <span className='text-sm font-semibold text-foreground truncate leading-tight'>{otherUserInfo.data?.data.user_name}</span>
                        {isOnline && <span className='text-[11px] text-muted-foreground leading-tight'>Active now</span>}
                    </div>
                </div>
                <div className='flex items-center gap-0.5 shrink-0'>
                    <ChatUserEmojiStatus userUUID={chatId}/>
                    <NotificationBell notificationType={chatNotification} isLoading={postNotification.isSubmitting} onNotCLick={UpdateNotification}/>
                    <Link href={chatCallHref} aria-label={chatCallStatusActive ? "Join active call" : "Start video call"}>
                    <Button
                        size='icon'
                        variant={chatCallStatusActive ? 'secondary' : 'ghost'}
                        className={cn(
                            "relative transition-all duration-300",
                            chatCallStatusActive && "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-200 dark:hover:bg-emerald-800/40"
                        )}
                    >
                        <Video size={18} />
                        {chatCallStatusActive && (
                            <span className="absolute -top-0.5 -right-0.5 flex h-2.5 w-2.5">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                                <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${statusColors.online.solid}`}></span>
                            </span>
                        )}
                    </Button>
                    </Link>
                    <Link href={chatRecordingHref} aria-label="View recordings"><Button size='icon' variant='ghost'> <Clapperboard /></Button></Link>
                </div>
            </header>
            <div className="flex-1 overflow-y-auto">
                <ChatMessageList chatId={chatId} />
            </div>

            <div className="sticky bottom-0 left-0 right-0 z-[var(--z-fixed)] pb-4 px-4 bg-background/95 backdrop-blur-sm">
                <div className="max-w-6xl mx-auto w-full">
                    <CommandSurface
                        surfaceKey={chatId}
                        dmGroupId={getGroupingId(chatId, selfProfile.data?.data.user_uuid || '')}
                        onComposerText={(text) =>
                            dispatch(createOrUpdateChatBody({ chatUUID: chatId, body: `<p>${text}</p>` }))
                        }
                        onComposerHtml={(html) =>
                            dispatch(createOrUpdateChatBody({ chatUUID: chatId, body: html }))
                        }
                    />
                    <MinimalTiptapTextInput
                        throttleDelay={300}
                        attachmentOnclick = {()=>{dispatch(openUI({ key: 'chatFileUpload' }))}}
                        onActionFiles={async (files) => {
                            if (!files?.length) return;
                            const valid = uploadFile.validateFiles(files);
                            if (valid.length === 0) return;
                            const grpId = getGroupingId(chatId, selfProfile.data?.data.user_uuid || '')
                            await uploadFile.makeRequestToUploadToChat(valid as unknown as FileList, chatId, grpId);
                        }}
                        className={cn("max-w-full h-auto")}
                        editorContentClassName="overflow-auto mb-2"
                        output="html"
                        content={chatState.chatBody}
                        placeholder={"Type a message..."}
                        editable={true}
                        ButtonIcon={SendHorizontal}
                        buttonOnclick={handleSend}
                        editorClassName="focus:outline-none px-2 py-2"
                        onChange={(content ) => {
                            publishTyping(content as string)
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
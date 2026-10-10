import { useOpenBeside } from "@/hooks/useSplitView";
import { dmComposerPlaceholder } from "@/lib/utils/composerPlaceholders";
import { displayNameOf } from "@/lib/personName";
import { useMedia } from "@/context/MediaQueryContext";
import {useFetch, useFetchOnlyOnce} from "@/hooks/useFetch";
import { useScheduleSend } from "@/context/ScheduleSendContext";
import { ScheduledMessagesBar } from "@/components/messages/scheduledMessagesBar";
import { HeldNotificationsBar } from "@/components/messages/heldNotificationsBar";
import {NotificationType} from "@/types/channel";
import {GetEndpointUrl, PostEndpointUrl} from "@/services/endPoints";
import MinimalTiptapTextInput from "@/components/textInput/textInput";
import {cn} from "@/lib/utils/helpers/cn";
import { statusColors } from "@/lib/colors";
import { SendHorizontal, Video, Clapperboard, Sparkles, CheckSquare } from "@/lib/icons";
import {useDispatch, useSelector} from "react-redux";
import {RootState} from "@/store/store";
import {NotificationBell} from "@/components/Notification/notificationBell";
import {usePost} from "@/hooks/usePost";
import {memo, useEffect, useState} from "react";
import type { Content } from "@tiptap/react";
import { useStableCallback } from "@/hooks/useStableCallback";
import { ComposerReplyPill } from "@/components/message/composerReplyPill";
import {getNextNotification} from "@/lib/utils/getNextNotification";

import {openUI} from "@/store/slice/uiSlice";


import {ChatMessageList} from "@/components/chat/chatMessageList";
import {USER_STATUS_ONLINE, UserEmojiStatus, UserProfileInterface} from "@/types/user";
import {ChatNotificationInterface} from "@/types/chat";
import {ChatUserAvatar} from "@/components/chat/chatUserAvatar";
import {ChatFileUpload} from "@/components/fileUpload/chatFileUpload";
import {ComposerAIButton} from "@/components/ai/ComposerAIButton";
import {createOrUpdateChatBody, clearChatReplyTarget} from "@/store/slice/chatSlice";
import {updateUserConnectedDeviceCount, updateUserEmojiStatus, updateUserStatus} from "@/store/slice/userSlice";
import {ChatUserEmojiStatus} from "@/components/chat/chatUserEmojiStatus";
import {Button} from "@/components/ui/button";
import {app_chat_call} from "@/types/paths";
import Link from "next/link";
import { ChatSkeleton } from "@/components/ui/AppSkeleton";
import {usePublishTyping} from "@/hooks/usePublishTyping";
import {useUserInfoState} from "@/hooks/useUserInfoState";
import CatchMeUpBanner from "@/components/ai/CatchMeUpBanner";
import {useUploadFile} from "@/hooks/useUploadFile";
import {getGroupingId} from "@/lib/utils/getGroupingId";
import CommandSurface from "@/components/command/CommandSurface";
import PendingActionsTray from "@/components/ai/PendingActionsTray";
import { FeatureGate } from "@/components/common/withFeature"
import { FEATURE_AI, FEATURE_CALLS } from "@/hooks/useClientConfig"
import { userDisplayName } from "@/lib/utils/userDisplayName"


export const ChatIdDesktop = ({chatId, handleSend, unreadCount}: {chatId: string, handleSend: (latestContent?: string)=>void, unreadCount?: number}) => {
    const dispatch = useDispatch()
    const postNotification  = usePost()
    const otherUserInfo  = useFetchOnlyOnce<UserProfileInterface>(`${GetEndpointUrl.SelfProfile}/${chatId}`)
    const selfProfile = useFetchOnlyOnce<UserProfileInterface>(GetEndpointUrl.SelfProfile)
    const [chatNotification, setChatNotificationType] = useState<string>(NotificationType.NotificationAll)

    const chatCallHref = `${app_chat_call}/${chatId}`;
    // A call opens beside the conversation, so it stays in view.
    const { isMobile } = useMedia();
    const openBeside = useOpenBeside(!isMobile);
    const chatRecordingHref = `/app/chat/${chatId}/recording`;
    const isBotPeer = otherUserInfo.data?.data?.is_bot === true;

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
                        <ChatUserAvatar userName={userDisplayName(otherUserInfo.data?.data) || undefined}
                                        userProfileObjKey={otherUserInfo.data?.data.user_profile_object_key ?? undefined}/>
                        {isOnline && <span aria-hidden className={`h-2.5 w-2.5 ring-2 ring-background rounded-full ${statusColors.online.solid} absolute bottom-0 right-0`}/>}

                    </div>
                    <div className='flex flex-col min-w-0'>
                        <span className='text-sm font-semibold text-foreground truncate leading-tight'>{userDisplayName(otherUserInfo.data?.data)}</span>
                        {isOnline && <span className='text-2xs text-muted-foreground leading-tight'>Active now</span>}
                    </div>
                </div>
                <div className='flex items-center gap-0.5 shrink-0'>
                    <ChatUserEmojiStatus userUUID={chatId}/>
                    <NotificationBell notificationType={chatNotification} isLoading={postNotification.isSubmitting} onNotCLick={UpdateNotification}/>
                    {/* Calls need a LiveKit server, which the shipped stack does not include.
                        Hidden rather than shown-and-failing when the operator has not run one. */}
                    <FeatureGate feature={FEATURE_CALLS}>
                    <Button size='icon' variant={chatCallStatusActive ? 'secondary' : 'ghost'} className={cn(
                            "relative transition duration-300",
                            chatCallStatusActive && "bg-success/10 text-success-ink hover:bg-success/20"
                        )} asChild><Link href={chatCallHref} onClick={(e) => openBeside({ kind: "call-chat", id: chatId }, e)} aria-label={chatCallStatusActive ? "Join active call" : "Start video call"}>
                        <Video size={18} />
                        {chatCallStatusActive && (
                            <span className="absolute -top-0.5 -right-0.5 flex h-2.5 w-2.5">
                                <span className="motion-safe:animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75"></span>
                                <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${statusColors.online.solid}`}></span>
                            </span>
                        )}
                    </Link></Button>
                    </FeatureGate>
                    <Button size='icon' variant='ghost' asChild><Link href={chatRecordingHref} aria-label="View recordings"> <Clapperboard /></Link></Button>
                    <FeatureGate feature={FEATURE_AI}>
                    <Button
                        size='icon'
                        variant='ghost'
                        aria-label="Create tasks from this conversation"
                        title="Create tasks from this conversation"
                        onClick={() => {
                            const selfUUID = selfProfile.data?.data?.user_uuid
                            if (!selfUUID) return
                            dispatch(openUI({ key: 'extractTasks', data: { sourceType: 'dm', sourceId: getGroupingId(selfUUID, chatId) } }))
                        }}
                    >
                        <CheckSquare className="text-muted-foreground" />
                    </Button>
                    </FeatureGate>
                </div>
            </header>
            <div className="flex-1 overflow-y-auto">
                <CatchMeUpBanner
                    channelUUID={chatId}
                    unreadCount={unreadCount || 0}
                    channelName={userDisplayName(otherUserInfo.data?.data)}
                    isChannel={false}
                    type="dm"
                />
                <ChatMessageList chatId={chatId} />
            </div>

            <div className="sticky bottom-0 left-0 right-0 z-[var(--z-fixed)] pb-4 px-4 bg-background">
                <div className="max-w-6xl mx-auto w-full">
                    <ChatComposer
                        chatId={chatId}
                        handleSend={handleSend}
                        peerName={userDisplayName(otherUserInfo.data?.data)}
                        placeholder={dmComposerPlaceholder(displayNameOf(otherUserInfo.data?.data))}
                        isBotPeer={isBotPeer}
                        selfUUID={selfProfile.data?.data.user_uuid || ''}
                    />
                </div>
            </div>

        </div>
    )
}

const EMPTY_INPUT_STATE: Partial<RootState["chat"]["chatInputState"][string]> = {};

/**
 * The DM's message box and what sits on it. Its own component because it is
 * the only part of the conversation that changes as someone types: the draft
 * is read here, so the header and the messages above it no longer re-render
 * with each change to it.
 */
const ChatComposer = memo(function ChatComposer({ chatId, handleSend, peerName, placeholder, isBotPeer, selfUUID }: {
    chatId: string
    handleSend: (latestContent?: string) => void
    peerName: string
    placeholder: string
    isBotPeer: boolean
    selfUUID: string
}) {
    const dispatch = useDispatch()
    const scheduleSend = useScheduleSend()
    const uploadFile = useUploadFile()
    const { publishTyping } = usePublishTyping({ targetType: 'chat', targetId: chatId });
    const chatState = useSelector((state: RootState) => state.chat.chatInputState[chatId] || EMPTY_INPUT_STATE);
    const grpId = getGroupingId(chatId, selfUUID)

    // Suggested starter prompts for an empty DM with an AI peer (the shared
    // coworker or a DM-able agent), so a new user isn't faced with a blank box.
    // Only fetched when the peer is a bot and the conversation is empty.
    const empty = useSelector((state: RootState) => (state.chat.chatMessages[chatId] || []).length === 0);
    const composerEmpty = !chatState.chatBody || chatState.chatBody.replace(/<[^>]*>/g, "").trim().length === 0;
    const showSuggestions = isBotPeer && empty && composerEmpty;
    const aiSuggestions = useFetch<{ data: string[] }>(
        showSuggestions ? `${GetEndpointUrl.GetDMAISuggestions}?peer=${chatId}` : "",
    );
    const suggestions = (showSuggestions && aiSuggestions.data?.data) || [];

    // The same function for the life of the composer, so the editor's action
    // row (memoised in textInput) keeps its buttons as the parent re-renders.
    const send = useStableCallback((latestContent?: string) => handleSend(latestContent))
    const onChange = useStableCallback((content: Content) => {
        publishTyping(content as string)
        dispatch(createOrUpdateChatBody({chatUUID:chatId, body: content as string}))
    })
    const onActionFiles = useStableCallback(async (files: File[]) => {
        if (!files?.length) return;
        const valid = uploadFile.validateFiles(files);
        if (valid.length === 0) return;
        await uploadFile.makeRequestToUploadToChat(valid as unknown as FileList, chatId, grpId);
    })
    const openUpload = useStableCallback(() => { dispatch(openUI({ key: 'chatFileUpload' })) })

    return (
        <>
                    {suggestions.length > 0 && (
                        <div className="mb-2 flex flex-wrap items-center gap-1.5">
                            <span className="mr-0.5 inline-flex items-center gap-1 text-2xs font-medium text-muted-foreground">
                                <Sparkles className="h-3 w-3 text-agent" aria-hidden="true" /> Try asking
                            </span>
                            {suggestions.map((s, i) => (
                                <button
                                    key={i}
                                    type="button"
                                    onClick={() => send(`<p>${s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</p>`)}
                                    className="rounded-md border border-border/70 bg-background px-3 py-1 text-xs text-foreground transition-colors hover:bg-highlight"
                                >
                                    {s}
                                </button>
                            ))}
                        </div>
                    )}
                    <PendingActionsTray surfaceId={grpId} />
                    <CommandSurface
                        surfaceKey={chatId}
                        dmGroupId={grpId}
                        onComposerText={(text) =>
                            dispatch(createOrUpdateChatBody({ chatUUID: chatId, body: `<p>${text}</p>` }))
                        }
                        onComposerHtml={(html) =>
                            dispatch(createOrUpdateChatBody({ chatUUID: chatId, body: html }))
                        }
                    />
                    {chatState.replyToUuid && (
                        <ComposerReplyPill
                            authorName={chatState.replyToAuthorName}
                            text={chatState.replyToText}
                            onCancel={() => dispatch(clearChatReplyTarget({ chatUUID: chatId }))}
                        />
                    )}
                    <HeldNotificationsBar userUUID={chatId} name={peerName} isBot={isBotPeer} />
                    {scheduleSend && <ScheduledMessagesBar target={scheduleSend.target} />}
                    <MinimalTiptapTextInput
                        throttleDelay={300}
                        attachmentOnclick={openUpload}
                        onActionFiles={onActionFiles}
                        className={cn("max-w-full h-auto")}
                        editorContentClassName="overflow-auto mb-2"
                        output="html"
                        content={chatState.chatBody}
                        contentRevision={chatState.restoredUnsent}
                        placeholder={placeholder}
                        editable={true}
                        ButtonIcon={SendHorizontal}
                        hasAttachments={(chatState.filesUploaded?.length ?? 0) > 0}
                        buttonOnclick={send}
                        onSchedule={scheduleSend?.schedule}
                        editorClassName="focus:outline-none px-2 py-2"
                        onChange={onChange}
                        aiSlot={
                            <ComposerAIButton
                                getText={() => chatState.chatBody || ""}
                                onResult={(html) => dispatch(createOrUpdateChatBody({ chatUUID: chatId, body: html }))}
                            />
                        }
                    >
                        <ChatFileUpload chatUUID={chatId} />
                    </MinimalTiptapTextInput>
        </>
    )
})

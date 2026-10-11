import { useOpenBeside } from "@/hooks/useSplitView";
import { dmComposerPlaceholder } from "@/lib/utils/composerPlaceholders";
import { displayNameOf } from "@/lib/personName";
import { useMedia } from "@/context/MediaQueryContext";
import {useFetchOnlyOnce} from "@/hooks/useFetch";
import { useScheduleSend } from "@/context/ScheduleSendContext";
import { ScheduledMessagesBar } from "@/components/messages/scheduledMessagesBar";
import { HeldNotificationsBar } from "@/components/messages/heldNotificationsBar";
import {NotificationType} from "@/types/channel";
import {GetEndpointUrl, PostEndpointUrl} from "@/services/endPoints";
import { HEADER_ICON, HuddleBanner, HuddleButton, NotificationSubmenu } from "@/components/channel/conversationHeaderParts";
import { ChatFace } from "@/components/message/chatFace";
import { WithTooltip } from "@/components/common/withTooltip";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { MoreHorizontal, Search, ShieldCheck } from "@/lib/icons";
import MinimalTiptapTextInput from "@/components/textInput/textInput";
import { useUndoSchedule } from "@/components/textInput/useUndoSchedule";
import { SendHorizontal, Clapperboard } from "@/lib/icons";
import {useDispatch, useSelector} from "react-redux";
import {RootState} from "@/store/store";
import {usePost} from "@/hooks/usePost";
import {memo, useEffect, useRef, useState} from "react";
import { celebrateFirstMessage } from "@/lib/chat/celebrateFirst";
import type { Content } from "@tiptap/react";
import { useStableCallback } from "@/hooks/useStableCallback";
import { ComposerReplyPill } from "@/components/message/composerReplyPill";

import {openUI} from "@/store/slice/uiSlice";


import {ChatMessageList} from "@/components/chat/chatMessageList";
import {USER_STATUS_ONLINE, UserEmojiStatus, UserProfileInterface} from "@/types/user";
import {ChatNotificationInterface} from "@/types/chat";
import {ChatFileUpload} from "@/components/fileUpload/chatFileUpload";
import {createOrUpdateChatBody, clearChatReplyTarget} from "@/store/slice/chatSlice";
import {updateUserConnectedDeviceCount, updateUserEmojiStatus, updateUserStatus} from "@/store/slice/userSlice";
import {ChatUserEmojiStatus} from "@/components/chat/chatUserEmojiStatus";
import {Button} from "@/components/ui/button";
import {app_chat_call} from "@/types/paths";
import Link from "next/link";
import { ChatSkeleton } from "@/components/ui/AppSkeleton";
import {usePublishTyping} from "@/hooks/usePublishTyping";
import {useUserInfoState} from "@/hooks/useUserInfoState";
import {useUploadFile} from "@/hooks/useUploadFile";
import {getGroupingId} from "@/lib/utils/getGroupingId";
import CommandSurface from "@/components/command/CommandSurface";
import { FeatureGate } from "@/components/common/withFeature"
import { FEATURE_CALLS } from "@/hooks/useClientConfig"
import { userDisplayName } from "@/lib/utils/userDisplayName"


export const ChatIdDesktop = ({chatId, handleSend, unreadCount}: {chatId: string, handleSend: (latestContent?: string) => boolean | void, unreadCount?: number}) => {
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


    // One click chooses a level (C04); nothing cycles any more.
    const updateNotification = async (next: string) => {
        const before = chatNotification
        setChatNotificationType(next)
        const res = await postNotification.makeRequest<ChatNotificationInterface>({payload:{to_user_id: chatId, notification_type: next}, apiEndpoint: PostEndpointUrl.UpdateChatNotification}).catch(() => undefined)
        if (res === undefined) setChatNotificationType(before)
    }

    const isReduxLoaded = userStatusState && userStatusState.deviceConnected !== -1;
    const currentStatus = isReduxLoaded && userStatusState.status ? userStatusState.status : (otherUserInfo.data?.data.user_status || 'offline');
    const currentDeviceCount = isReduxLoaded ? userStatusState.deviceConnected : (otherUserInfo.data?.data.user_device_connected || 0);

    const isOnline = currentStatus === USER_STATUS_ONLINE && currentDeviceCount > 0;


    return (
        <div className='flex flex-col h-full relative'>
            {/* A DM's header (design v3 chat, C02): 52px on the sheet, the
                28px face with presence, the name at 15/590 and the status after
                a hairline. An agent shows its provenance where a person's
                status would be: "Acts for you · can do only what you can".
                Huddle (not for an agent), search and More; every icon has a
                tooltip. */}
            <header className='sticky top-0 z-[var(--z-sticky)] flex h-[52px] shrink-0 items-center gap-2.5 border-b border-line bg-sheet pl-5 pr-3'>
                <div className='relative shrink-0'>
                    <ChatFace name={userDisplayName(otherUserInfo.data?.data) || ""} profileKey={otherUserInfo.data?.data.user_profile_object_key} userUUID={chatId} isBot={isBotPeer} size={28} />
                    {!isBotPeer && (isOnline
                        ? <span aria-hidden className='presence-dot' />
                        : <span aria-hidden className='absolute -bottom-px -right-px size-2 rounded-full border-[1.5px] border-ink-4 bg-sheet ring-2 ring-sheet' />)}
                </div>
                <span data-header-title='' className='truncate text-heading text-ink'>{userDisplayName(otherUserInfo.data?.data)}</span>
                {isBotPeer ? (
                    <span data-header-meta='' className='inline-flex h-[22px] shrink-0 items-center gap-1.5 rounded-sm bg-agent-muted px-2 text-meta text-agent-ink'>
                        <ShieldCheck className='size-3' aria-hidden='true' /> Acts for you · can do only what you can
                    </span>
                ) : (
                    <span data-header-meta='' className='flex min-w-0 items-center gap-1.5 truncate border-l border-line-2 pl-2.5 text-ui-sm text-ink-3'>
                        {isOnline ? 'Active' : currentStatus === 'away' ? 'Away' : 'Offline'}
                        <ChatUserEmojiStatus userUUID={chatId}/>
                    </span>
                )}
                <div className='min-w-0 flex-1' />
                <div className='flex shrink-0 items-center gap-1'>
                    {/* Calls need a LiveKit server, which the shipped stack does not include.
                        Hidden rather than shown-and-failing when the operator has not run one. */}
                    {!isBotPeer && (
                        <FeatureGate feature={FEATURE_CALLS}>
                            <HuddleButton href={chatCallHref} live={chatCallStatusActive} onOpen={(e) => openBeside({ kind: "call-chat", id: chatId }, e)} />
                        </FeatureGate>
                    )}
                    <WithTooltip label="Search">
                        <Button asChild size='icon' variant='ghost' className={HEADER_ICON}>
                            <Link href='/app/search' aria-label='Search'><Search aria-hidden='true' /></Link>
                        </Button>
                    </WithTooltip>
                    <DropdownMenu modal={false}>
                        <WithTooltip label="More conversation actions">
                            <DropdownMenuTrigger asChild>
                                <Button size='icon' variant='ghost' aria-label="More conversation actions" className={HEADER_ICON}><MoreHorizontal aria-hidden='true' /></Button>
                            </DropdownMenuTrigger>
                        </WithTooltip>
                        <DropdownMenuContent align="end" className="pop-surface w-64 p-1">
                            <NotificationSubmenu value={chatNotification} onChange={updateNotification} busy={postNotification.isSubmitting} />
                            <DropdownMenuItem asChild>
                                <Link href={chatRecordingHref}><Clapperboard className="text-ink-3" aria-hidden="true" /> Recordings</Link>
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>
            </header>
            {chatCallStatusActive && !isBotPeer && (
                <FeatureGate feature={FEATURE_CALLS}>
                    <HuddleBanner href={chatCallHref} onOpen={(e) => openBeside({ kind: "call-chat", id: chatId }, e)} />
                </FeatureGate>
            )}
            <div className="flex-1 overflow-y-auto">
                <ChatMessageList chatId={chatId} unreadOnOpen={unreadCount} />
            </div>

            <div className="sticky bottom-0 left-0 right-0 z-[var(--z-fixed)] bg-sheet px-5 pb-[18px]">
                <div className="w-full max-w-[800px]">
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
    handleSend: (latestContent?: string) => boolean | void
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

    // The same function for the life of the composer, so the editor's action
    // row (memoised in textInput) keeps its buttons as the parent re-renders.
    // A first message here bursts from the new row's avatar (C60).
    const rootRef = useRef<HTMLDivElement>(null)
    const undoSchedule = useUndoSchedule(scheduleSend?.target)
    const send = useStableCallback((latestContent?: string) => {
        if (handleSend(latestContent)) celebrateFirstMessage()
    })
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
        <div ref={rootRef}>
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
                        variant="chat"
                        output="html"
                        content={chatState.chatBody}
                        contentRevision={chatState.restoredUnsent}
                        placeholder={placeholder}
                        editable={true}
                        ButtonIcon={SendHorizontal}
                        hasAttachments={(chatState.filesUploaded?.length ?? 0) > 0}
                        buttonOnclick={send}
                        onSchedule={scheduleSend?.schedule}
                        editorClassName="focus:outline-none"
                        onChange={onChange}
                        onUndoSchedule={undoSchedule}
                    >
                        <ChatFileUpload chatUUID={chatId} />
                    </MinimalTiptapTextInput>
        </div>
    )
})

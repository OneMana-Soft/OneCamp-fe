import { displayNameOf } from "@/lib/personName"
import { GROUP_COMPOSER_PLACEHOLDER } from "@/lib/utils/composerPlaceholders";
import { useOpenBeside } from "@/hooks/useSplitView";
import { useMedia } from "@/context/MediaQueryContext";
import { useFetchOnlyOnce} from "@/hooks/useFetch";
import { useScheduleSend } from "@/context/ScheduleSendContext";
import { ScheduledMessagesBar } from "@/components/messages/scheduledMessagesBar";
import {NotificationType} from "@/types/channel";
import {GetEndpointUrl, PostEndpointUrl} from "@/services/endPoints";
import MinimalTiptapTextInput from "@/components/textInput/textInput";
import CommandSurface from "@/components/command/CommandSurface";
import {cn} from "@/lib/utils/helpers/cn";
import { statusColors } from "@/lib/colors";
import { SendHorizontal, Users, Video, Clapperboard } from "@/lib/icons";
import {useDispatch, useSelector} from "react-redux";
import {RootState} from "@/store/store";
import {NotificationBell} from "@/components/Notification/notificationBell";
import {usePost} from "@/hooks/usePost";
import {memo, useEffect, useState} from "react";
import type { Content } from "@tiptap/react";
import { useStableCallback } from "@/hooks/useStableCallback";
import { ComposerReplyPill } from "@/components/message/composerReplyPill";
import {getNextNotification} from "@/lib/utils/getNextNotification";



import {
    RawUserDMInterface,

} from "@/types/user";
import { GrpChatNotificationInterface} from "@/types/chat";
import {createOrUpdateGroupChatBody, clearGroupChatReplyTarget, LocallyCreatedGrpInfoInterface, ChatInputState} from "@/store/slice/groupChatSlice";
import {GroupChatFileUpload} from "@/components/fileUpload/groupChatFileUpload";
import {GroupChatMessageList} from "@/components/groupChat/groupChatMessageList";
import {GroupedAvatar} from "@/components/groupedAvatar/groupedAvatar";
import {ErrorState} from "@/components/error/errorState";
import {LoadingStateCircle} from "@/components/loading/loadingStateCircle";
import {Button} from "@/components/ui/button";
import {openUI} from "@/store/slice/uiSlice";
import {addUserToUserChatList} from "@/store/slice/userSlice";
import {AddUserInChatList, updateChatCallStatus} from "@/store/slice/chatSlice";
import {useRouter} from "next/navigation";
import {app_grp_call} from "@/types/paths";
import {usePublishTyping} from "@/hooks/usePublishTyping";
import {useUploadFile} from "@/hooks/useUploadFile";
import { FeatureGate } from "@/components/common/withFeature"
import { FEATURE_CALLS } from "@/hooks/useClientConfig"

const EMPTY_GRP_INFO: LocallyCreatedGrpInfoInterface = {} as LocallyCreatedGrpInfoInterface
const EMPTY_INPUT_STATE: ChatInputState = { chatBody: '', filesUploaded: [], filesPreview: [] }

export const ChatGrpIdDesktop = ({grpId, handleSend, unreadCount}: {grpId: string, handleSend: (latestContent?: string)=>void, unreadCount?: number}) => {
    const dispatch = useDispatch()
    const grpChatCreatedLocally = useSelector((state: RootState) => state.groupChat.locallyCreatedGrpInfo[grpId] || EMPTY_GRP_INFO);

    const postNotification  = usePost()
    const dmParticipantsInfo  = useFetchOnlyOnce<RawUserDMInterface>(`${GetEndpointUrl.GetDmGroupParticipants}/${grpId}`)
    const [chatNotification, setChatNotificationType] = useState<string>(NotificationType.NotificationAll)

    const chatCallActive = useSelector((state: RootState) => state.chat.chatCallStatus[grpId]?.active || false);


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

    // A call opens beside the group, so the conversation stays in view.
    // Above the early returns: a hook runs on every render or none.
    const { isMobile } = useMedia();
    const openBeside = useOpenBeside(!isMobile);

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
        if (!openBeside({ kind: "call-group", id: grpId })) router.push(app_grp_call + "/" + grpId);
    }

    const UpdateNotification = async () => {
        const nextNotification = getNextNotification(chatNotification)
        await postNotification.makeRequest<GrpChatNotificationInterface>({payload:{grp_id: grpId, notification_type: nextNotification}, apiEndpoint: PostEndpointUrl.UpdateGroupChatNotification})
        setChatNotificationType(nextNotification)
    }

    const participants = grpChatCreatedLocally.participants || dmParticipantsInfo.data?.data?.dm_participants || []


    return (
        <div className='flex flex-col h-full relative'>
            {/* Same shell as the 1:1 header in components/chat/chatIdDesktop.tsx.
                This was a plain div at text-lg with p-2, no fixed height, no
                sticky, no background and justify-start, so beside a DM it sat at
                a different height, scrolled away with the messages, showed the
                thread through it, and crammed its buttons against the title
                instead of ranging them right. */}
            <header className='flex items-center justify-between gap-2 h-12 md:h-14 px-3 md:px-4 border-b border-border/60 bg-background sticky top-0 z-[var(--z-sticky)]'>
                <div className='flex items-center gap-2.5 min-w-0'>
                    <div className='shrink-0'>
                        <GroupedAvatar users={participants} max={2} overlap={20} className={'!pr-0'}/>
                    </div>
                    <div className='flex flex-col min-w-0'>
                        {/* Joined rather than a span per participant with manual
                            separators: truncation applies to the whole line, so a
                            long list ends in an ellipsis instead of a stray comma. */}
                        <span data-header-title='' className='text-base font-semibold text-foreground truncate leading-tight'>
                            {participants.map((u) => displayNameOf(u)).join(', ')}
                        </span>
                        {/* Mirrors "Active now" on the 1:1 header, so both have a
                            second line and the two sit at the same height. */}
                        <span className='text-2xs text-muted-foreground leading-tight'>
                            {participants.length} {participants.length === 1 ? 'member' : 'members'}
                        </span>
                    </div>
                </div>
                <div className='flex items-center gap-0.5 shrink-0'>
                    {
                        dmParticipantsInfo.data?.data &&
                        <NotificationBell notificationType={chatNotification} isLoading={postNotification.isSubmitting} onNotCLick={UpdateNotification}/>
                    }
                    <Button aria-label="Manage members" size='icon' variant='ghost' onClick={()=>{dispatch(openUI({ key: 'editDmMember', data: {grpId: grpId} }))}}> <Users /></Button>
                    {/* Calls need a LiveKit server, which the shipped stack does not include.
                        Hidden rather than shown-and-failing when the operator has not run one. */}
                    <FeatureGate feature={FEATURE_CALLS}>
                    <Button
                        size='icon'
                        aria-label={chatCallActive ? "Join the call in progress" : "Start a call"}
                        variant={chatCallActive ? 'secondary' : 'ghost'}
                        className={cn(
                            "relative transition duration-300",
                            chatCallActive && "bg-success/10 text-success-ink hover:bg-success/20"
                        )}
                        onClick={clickVideoCall}
                    >
                        <Video size={18} />
                        {chatCallActive && (
                            <span className="absolute -top-0.5 -right-0.5 flex h-2.5 w-2.5">
                                <span className="motion-safe:animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75"></span>
                                <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${statusColors.online.solid}`}></span>
                            </span>
                        )}
                    </Button>
                    </FeatureGate>
                    <Button aria-label="View recordings" size='icon' variant='ghost' onClick={() => router.push(`/app/chat/group/${grpId}/recording`)}> <Clapperboard /></Button>
                </div>
            </header>
            <div className="flex-1 overflow-y-auto">
                <GroupChatMessageList grpId={grpId} unreadOnOpen={unreadCount} />
            </div>

            <div className="sticky bottom-0 left-0 right-0 z-[var(--z-fixed)] pb-4 px-4 bg-background">
                <div className="max-w-6xl mx-auto w-full">
                    <GroupComposer grpId={grpId} handleSend={handleSend} />
                </div>
            </div>

        </div>
    )
}

/**
 * The group's message box and what sits on it. Its own component because it is
 * the only part of the conversation that changes as someone types: the draft
 * is read here, so the header and the messages above it no longer re-render
 * with each change to it.
 */
const GroupComposer = memo(function GroupComposer({ grpId, handleSend }: {
    grpId: string
    handleSend: (latestContent?: string) => void
}) {
    const dispatch = useDispatch()
    const scheduleSend = useScheduleSend()
    const uploadFile = useUploadFile()
    const { publishTyping } = usePublishTyping({ targetType: 'groupChat', targetId: grpId });
    const chatState = useSelector((state: RootState) => state.groupChat.chatInputState[grpId] || EMPTY_INPUT_STATE);
    // The same function for the life of the composer, so the editor's action
    // row (memoised in textInput) keeps its buttons as the parent re-renders.
    const send = useStableCallback((latestContent?: string) => handleSend(latestContent))
    const onChange = useStableCallback((content: Content) => {
        publishTyping(content as string)
        dispatch(createOrUpdateGroupChatBody({grpID:grpId, body: content as string}))
    })
    const onActionFiles = useStableCallback(async (files: File[]) => {
        if (!files?.length) return;
        const valid = uploadFile.validateFiles(files);
        if (valid.length === 0) return;
        await uploadFile.makeRequestToUploadToGroupChat(valid as unknown as FileList, grpId);
    })
    const openUpload = useStableCallback(() => { dispatch(openUI({ key: 'groupChatFileUpload' })) })

    return (
        <>
            <CommandSurface
                surfaceKey={grpId}
                dmGroupId={grpId}
                onComposerText={(text) =>
                    dispatch(createOrUpdateGroupChatBody({ grpID: grpId, body: `<p>${text}</p>` }))
                }
                onComposerHtml={(html) =>
                    dispatch(createOrUpdateGroupChatBody({ grpID: grpId, body: html }))
                }
            />
            {chatState.replyToUuid && (
                <ComposerReplyPill
                    authorName={chatState.replyToAuthorName}
                    text={chatState.replyToText}
                    onCancel={() => dispatch(clearGroupChatReplyTarget({ grpId }))}
                />
            )}
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
                placeholder={GROUP_COMPOSER_PLACEHOLDER}
                editable={true}
                ButtonIcon={SendHorizontal}
                hasAttachments={(chatState.filesUploaded?.length ?? 0) > 0}
                buttonOnclick={send}
                onSchedule={scheduleSend?.schedule}
                editorClassName="focus:outline-none px-2 py-2"
                onChange={onChange}
            >
                <GroupChatFileUpload groupChatID={grpId} />
            </MinimalTiptapTextInput>
        </>
    )
})

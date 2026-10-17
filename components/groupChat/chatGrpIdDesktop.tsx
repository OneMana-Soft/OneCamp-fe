import { displayNameOf } from "@/lib/personName"
import { GROUP_COMPOSER_PLACEHOLDER } from "@/lib/utils/composerPlaceholders";
import { searchWithinHref } from "@/lib/search/within";
import { useOpenBeside } from "@/hooks/useSplitView";
import { useMedia } from "@/context/MediaQueryContext";
import { useFetchOnlyOnce} from "@/hooks/useFetch";
import { useScheduleSend } from "@/context/ScheduleSendContext";
import { ScheduledMessagesBar } from "@/components/messages/scheduledMessagesBar";
import {NotificationType} from "@/types/channel";
import {GetEndpointUrl} from "@/services/endPoints";
import { HEADER_ICON, HuddleBanner, HuddleButton, NotificationSubmenu } from "@/components/channel/conversationHeaderParts";
import { ChatFace } from "@/components/message/chatFace";
import { WithTooltip } from "@/components/common/withTooltip";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { MoreHorizontal, Search } from "@/lib/icons";
import Link from "next/link";
import MinimalTiptapTextInput from "@/components/textInput/textInput";
import { useUndoSchedule } from "@/components/textInput/useUndoSchedule";
import { celebrateFirstMessage } from "@/lib/chat/celebrateFirst";
import CommandSurface from "@/components/command/CommandSurface";
import {cn} from "@/lib/utils/helpers/cn";
import { SendHorizontal, Users, Clapperboard } from "@/lib/icons";
import {useDispatch, useSelector} from "react-redux";
import {RootState} from "@/store/store";
import { useGroupNotification } from "@/hooks/useConversationNotification";
import {memo, useCallback, useEffect, useState} from "react";
import type { Content } from "@tiptap/react";
import { useStableCallback } from "@/hooks/useStableCallback";
import { ComposerReplyPill } from "@/components/message/composerReplyPill";



import {
    RawUserDMInterface,

} from "@/types/user";
import {createOrUpdateGroupChatBody, clearGroupChatReplyTarget, LocallyCreatedGrpInfoInterface, ChatInputState} from "@/store/slice/groupChatSlice";
import {GroupChatFileUpload} from "@/components/fileUpload/groupChatFileUpload";
import {GroupChatMessageList} from "@/components/groupChat/groupChatMessageList";
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

export const ChatGrpIdDesktop = ({grpId, handleSend, unreadCount}: {grpId: string, handleSend: (latestContent?: string)=>boolean | void, unreadCount?: number}) => {
    const dispatch = useDispatch()
    const grpChatCreatedLocally = useSelector((state: RootState) => state.groupChat.locallyCreatedGrpInfo[grpId] || EMPTY_GRP_INFO);

    const dmParticipantsInfo  = useFetchOnlyOnce<RawUserDMInterface>(`${GetEndpointUrl.GetDmGroupParticipants}/${grpId}`)
    // A group's level: one write for its header and a phone's sheet (hooks/useConversationNotification).
    const notification = useGroupNotification(grpId, dmParticipantsInfo.data?.data?.dm_notification_type)

    const chatCallActive = useSelector((state: RootState) => state.chat.chatCallStatus[grpId]?.active || false);


    const router = useRouter();

    useEffect(() => {

        if(dmParticipantsInfo.data?.data) {
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

    // A group that isn't there is said once, for a computer and a phone, by
    // GroupChatView (useConversationMissing), before this is drawn.

    // const toggleFavourite = async () => {
    //         if(isFavorite) {
    //            await postFav.makeRequest({apiEndpoint: PostEndpointUrl.RemoveFavChannel, appendToUrl:`/${channelId}`, onSuccess : ()=>{
    //                    setFavorite(false)}})
    //         } else {
    //             await postFav.makeRequest({apiEndpoint: PostEndpointUrl.AddFavChannel, appendToUrl:`/${channelId}`, onSuccess : ()=>{setFavorite(true)}})
    //         }
    // }


    const participants = grpChatCreatedLocally.participants || dmParticipantsInfo.data?.data?.dm_participants || []


    return (
        <div className='flex flex-col h-full relative'>
            {/* A group's header (design v3 chat, C02): 52px on the sheet, a
                28px two-face stack (the second 4px lower), the names at 15/590
                truncating to "Maya, Jonas +2", then Huddle, members, search and
                More. Every icon has a tooltip. */}
            <header className='sticky top-0 z-[var(--z-sticky)] flex h-[52px] shrink-0 items-center gap-2.5 border-b border-line bg-sheet pl-5 pr-3'>
                <span aria-hidden='true' className='relative flex h-8 w-[38px] shrink-0'>
                    {participants.slice(0, 2).map((u, i) => (
                        <span key={u.user_uuid} className={cn('absolute rounded-full ring-2 ring-sheet', i === 0 ? 'left-0 top-0' : 'left-[16px] top-1')}>
                            <ChatFace name={displayNameOf(u)} profileKey={u.user_profile_object_key} userUUID={u.user_uuid} isBot={!!u.is_bot} size={22} />
                        </span>
                    ))}
                </span>
                <span data-header-title='' className='truncate text-heading text-ink' title={participants.map((u) => displayNameOf(u)).join(', ')}>
                    {groupTitle(participants.map((u) => displayNameOf(u)))}
                </span>
                <div className='min-w-0 flex-1' />
                <div className='flex shrink-0 items-center gap-1'>
                    {/* Calls need a LiveKit server, which the shipped stack does not include.
                        Hidden rather than shown-and-failing when the operator has not run one. */}
                    <FeatureGate feature={FEATURE_CALLS}>
                        <HuddleButton href={app_grp_call + "/" + grpId} live={chatCallActive} onOpen={(e) => { if (openBeside({ kind: "call-group", id: grpId }, e)) return }} />
                    </FeatureGate>
                    <WithTooltip label="Members">
                        <Button aria-label="Manage members" size='icon' variant='ghost' className={HEADER_ICON} onClick={()=>{dispatch(openUI({ key: 'editDmMember', data: {grpId: grpId} }))}}><Users aria-hidden='true' /></Button>
                    </WithTooltip>
                    {/* Search in this group (QA F-15). */}
                    <WithTooltip label="Search in this group">
                        <Button asChild size='icon' variant='ghost' className={HEADER_ICON}>
                            <Link href={searchWithinHref({ kind: "group", id: grpId })} aria-label="Search in this group"><Search aria-hidden='true' /></Link>
                        </Button>
                    </WithTooltip>
                    <DropdownMenu modal={false}>
                        <WithTooltip label="More conversation actions">
                            <DropdownMenuTrigger asChild>
                                <Button size='icon' variant='ghost' aria-label="More conversation actions" className={HEADER_ICON}><MoreHorizontal aria-hidden='true' /></Button>
                            </DropdownMenuTrigger>
                        </WithTooltip>
                        <DropdownMenuContent align="end" className="pop-surface w-64 p-1">
                            {dmParticipantsInfo.data?.data && (
                                <NotificationSubmenu value={notification.level} onChange={notification.choose} busy={notification.busy} />
                            )}
                            <DropdownMenuItem onClick={() => router.push(`/app/chat/group/${grpId}/recording`)}>
                                <Clapperboard className="text-ink-3" aria-hidden="true" /> Recordings
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>
            </header>
            {chatCallActive && (
                <FeatureGate feature={FEATURE_CALLS}>
                    <HuddleBanner href={app_grp_call + "/" + grpId} onOpen={(e) => { openBeside({ kind: "call-group", id: grpId }, e) }} />
                </FeatureGate>
            )}
            <div className="flex-1 overflow-y-auto">
                <GroupChatMessageList grpId={grpId} unreadOnOpen={unreadCount} />
            </div>

            <div className="sticky bottom-0 left-0 right-0 z-[var(--z-fixed)] bg-sheet px-5 pb-[18px]">
                <div className="w-full max-w-[800px]">
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
/** "Maya, Jonas and Priya", or "Maya, Jonas +2" when there are more (C02). */
function groupTitle(names: string[]): string {
    const first = names.map((n) => n.split(" ")[0])
    if (first.length <= 3) return first.length < 2 ? first.join("") : `${first.slice(0, -1).join(", ")} and ${first[first.length - 1]}`
    return `${first.slice(0, 2).join(", ")} +${first.length - 2}`
}

const GroupComposer = memo(function GroupComposer({ grpId, handleSend }: {
    grpId: string
    handleSend: (latestContent?: string) => boolean | void
}) {
    const dispatch = useDispatch()
    const scheduleSend = useScheduleSend()
    const uploadFile = useUploadFile()
    const { publishTyping } = usePublishTyping({ targetType: 'groupChat', targetId: grpId });
    const chatState = useSelector((state: RootState) => state.groupChat.chatInputState[grpId] || EMPTY_INPUT_STATE);
    // The same function for the life of the composer, so the editor's action
    // row (memoised in textInput) keeps its buttons as the parent re-renders.
    const undoSchedule = useUndoSchedule(scheduleSend?.target)
    // A group's first message celebrates too (C60), from the new row's avatar.
    const send = useStableCallback((latestContent?: string) => {
        if (handleSend(latestContent)) celebrateFirstMessage()
    })
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
                variant="chat"
                output="html"
                content={chatState.chatBody}
                contentRevision={chatState.restoredUnsent}
                placeholder={GROUP_COMPOSER_PLACEHOLDER}
                editable={true}
                ButtonIcon={SendHorizontal}
                hasAttachments={(chatState.filesUploaded?.length ?? 0) > 0}
                buttonOnclick={send}
                onSchedule={scheduleSend?.schedule}
                editorClassName="focus:outline-none"
                onChange={onChange}
                onUndoSchedule={undoSchedule}
            >
                <GroupChatFileUpload groupChatID={grpId} />
            </MinimalTiptapTextInput>
        </>
    )
})

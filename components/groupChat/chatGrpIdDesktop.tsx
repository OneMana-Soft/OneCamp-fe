import { useFetchOnlyOnce} from "@/hooks/useFetch";
import {NotificationType} from "@/types/channel";
import {GetEndpointUrl, PostEndpointUrl} from "@/services/endPoints";
import MinimalTiptapTextInput from "@/components/textInput/textInput";
import CommandSurface from "@/components/command/CommandSurface";
import {cn} from "@/lib/utils/helpers/cn";
import { statusColors } from "@/lib/colors";
import { SendHorizontal, Users, Video, Clapperboard, X } from "@/lib/icons";
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
import {getGroupingId} from "@/lib/utils/getGroupingId";
import {useRouter} from "next/navigation";
import {app_grp_call, app_grp_chat_path, app_home_path} from "@/types/paths";
import {usePublishTyping} from "@/hooks/usePublishTyping";
import {useUploadFile} from "@/hooks/useUploadFile";
import { FeatureGate } from "@/components/common/withFeature"
import { FEATURE_CALLS } from "@/hooks/useClientConfig"

const EMPTY_GRP_INFO: LocallyCreatedGrpInfoInterface = {} as LocallyCreatedGrpInfoInterface
const EMPTY_TYPING_LIST: any[] = []
const EMPTY_INPUT_STATE: ChatInputState = { chatBody: '', filesUploaded: [], filesPreview: [] }

export const ChatGrpIdDesktop = ({grpId, handleSend, unreadCount}: {grpId: string, handleSend: (latestContent?: string)=>void, unreadCount?: number}) => {

    const dispatch = useDispatch()
    const grpChatCreatedLocally = useSelector((state: RootState) => state.groupChat.locallyCreatedGrpInfo[grpId] || EMPTY_GRP_INFO);

    const postNotification  = usePost()
    const dmParticipantsInfo  = useFetchOnlyOnce<RawUserDMInterface>(`${GetEndpointUrl.GetDmGroupParticipants}/${grpId}`)
    const [chatNotification, setChatNotificationType] = useState<string>(NotificationType.NotificationAll)

    const chatState = useSelector((state: RootState) => state.groupChat.chatInputState[grpId] || EMPTY_INPUT_STATE);

    const chatCallActive = useSelector((state: RootState) => state.chat.chatCallStatus[grpId]?.active || false);

    const { publishTyping } = usePublishTyping({ targetType: 'groupChat', targetId: grpId });
    const uploadFile = useUploadFile()

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
                        <span className='text-sm font-semibold text-foreground truncate leading-tight'>
                            {participants.map((u) => u.user_name).join(', ')}
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
                        variant={chatCallActive ? 'secondary' : 'ghost'}
                        className={cn(
                            "relative transition-all duration-300",
                            chatCallActive && "bg-success/10 text-success hover:bg-emerald-500/20"
                        )}
                        onClick={clickVideoCall}
                    >
                        <Video size={18} />
                        {chatCallActive && (
                            <span className="absolute -top-0.5 -right-0.5 flex h-2.5 w-2.5">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                                <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${statusColors.online.solid}`}></span>
                            </span>
                        )}
                    </Button>
                    </FeatureGate>
                    <Button aria-label="View recordings" size='icon' variant='ghost' onClick={() => router.push(`/app/chat/group/${grpId}/recording`)}> <Clapperboard /></Button>
                </div>
            </header>
            <div className="flex-1 overflow-y-auto">
                <GroupChatMessageList grpId={grpId} />
            </div>

            <div className="sticky bottom-0 left-0 right-0 z-[var(--z-fixed)] pb-4 px-4 bg-background/95 backdrop-blur-sm">
                <div className="max-w-6xl mx-auto w-full">
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
                        <div className="mx-2 mb-1 flex items-center gap-2 rounded-md border-l-2 border-primary/50 bg-muted/40 px-2 py-1 text-xs">
                            <span className="text-muted-foreground">Replying to</span>
                            <span className="font-medium text-foreground">{chatState.replyToAuthorName || "message"}</span>
                            <span className="min-w-0 flex-1 truncate text-muted-foreground">
                                {chatState.replyToText || ""}
                            </span>
                            <button
                                type="button"
                                onClick={() => dispatch(clearGroupChatReplyTarget({ grpId }))}
                                className="flex h-5 w-5 shrink-0 items-center justify-center rounded hover:bg-muted"
                                aria-label="Cancel reply"
                            >
                                <X className="h-3.5 w-3.5 text-muted-foreground" />
                            </button>
                        </div>
                    )}
                    <MinimalTiptapTextInput
                        throttleDelay={300}
                        attachmentOnclick = {()=>{dispatch(openUI({ key: 'groupChatFileUpload' }))}}
                        onActionFiles={async (files) => {
                            if (!files?.length) return;
                            const valid = uploadFile.validateFiles(files);
                            if (valid.length === 0) return;
                            await uploadFile.makeRequestToUploadToGroupChat(valid as unknown as FileList, grpId);
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
import { useOpenBeside } from "@/hooks/useSplitView";
import { useMedia } from "@/context/MediaQueryContext";
import {useFetch} from "@/hooks/useFetch";
import { useScheduleSend } from "@/context/ScheduleSendContext";
import { ScheduledMessagesBar } from "@/components/messages/scheduledMessagesBar";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import ChannelAgents, { useChannelAgents } from "@/components/ai/ChannelAgents";
import { channelComposerPlaceholder } from "@/lib/utils/composerPlaceholder";
import {
    ChannelInfoInterfaceResp,
    ChannelJoinInterface,
    ChannelNotificationInterface,
    NotificationType} from "@/types/channel";
import {GetEndpointUrl, PostEndpointUrl} from "@/services/endPoints";
import MinimalTiptapTextInput from "@/components/textInput/textInput";
import CommandSurface from "@/components/command/CommandSurface";
import {cn} from "@/lib/utils/helpers/cn";
import { IdentityMark } from "@/components/ui/graphics/IdentityMark";
import { statusColors } from "@/lib/colors";
import { Hash, Pencil, SendHorizontal, Star, Users, Video, Clapperboard, Lightbulb, Megaphone, CheckSquare, MoreHorizontal, MessageSquare, FileArchive } from "@/lib/icons";
import {Button} from "@/components/ui/button";
import {useDispatch, useSelector} from "react-redux";
import {RootState} from "@/store/store";
import {NotificationBell} from "@/components/Notification/notificationBell";
import {usePost} from "@/hooks/usePost";
import {memo, useEffect, useRef, useState} from "react";
import { celebrate } from "@/lib/celebrate";
import type { Content } from "@tiptap/react";
import { useStableCallback } from "@/hooks/useStableCallback";
import { ComposerReplyPill } from "@/components/message/composerReplyPill";
import {getNextNotification} from "@/lib/utils/getNextNotification";
import {openUI} from "@/store/slice/uiSlice";
import { toggleUserChannelFavorite } from "@/store/slice/userSlice";
import {ChannelFileUpload} from "@/components/fileUpload/channelFileUpload";
import {ComposerAIButton} from "@/components/ai/ComposerAIButton";
import {
    
    updateChannelInputText, MessageInputState, clearChannelReplyTarget
} from "@/store/slice/channelSlice";

import {GenericResponse} from "@/types/genericRes";
import {ChannelMessageList} from "@/components/channel/channelMessageList";
import { JoinChannelPrompt } from "@/components/channel/JoinChannelPrompt";
import { ComposerNotice } from "@/components/channel/composerNotice";
import {isZeroEpoch} from "@/lib/utils/validation/isZeroEpoch";
import {app_channel_call} from "@/types/paths";
import Link from "next/link";
import {ChatSkeleton} from "@/components/ui/AppSkeleton";
import {usePublishTyping} from "@/hooks/usePublishTyping";
import CatchMeUpBanner from "@/components/ai/CatchMeUpBanner";
import {ChannelMemoryIndicator} from "@/components/ai/ChannelMemoryIndicator";
import {useUploadFile} from "@/hooks/useUploadFile";
import { FeatureGate } from "@/components/common/withFeature"
import { WithTooltip } from "@/components/common/withTooltip"
import { FEATURE_AI, FEATURE_CALLS } from "@/hooks/useClientConfig"

const EMPTY_INPUT_STATE: MessageInputState = { inputTextHTML: '', filesUploaded: [], filePreview: [] }

export const ChannelIdDesktop = ({channelId, handleSend, unreadCount, focusComposer}: {channelId: string, handleSend: (latestContent?: string) => boolean | void, unreadCount?: number, focusComposer?: boolean}) => {
    const dispatch = useDispatch()
    const postFav  = usePost()
    const postNotification  = usePost()
    const postJoinChannel = usePost()
    const channelInfo  = useFetch<ChannelInfoInterfaceResp>(channelId ? `${GetEndpointUrl.ChannelBasicInfo}/${channelId}`:'')
    const [isFavorite, setFavorite] = useState<boolean>(false)
    const [channelNotification, setChannelNotificationType] = useState<string>(NotificationType.NotificationAll)

    // Only the name: the sidebar's channel list changes whenever any channel's
    // unread count does, and this header has no use for that.
    const sidebarName = useSelector((state: RootState) => state.users.userSidebar.userChannels?.find((item)=>item.ch_uuid == channelId)?.ch_name);
    // Fallback to API response when channel isn't in sidebar state yet
    // (e.g. direct navigation from notification/bookmark)
    const channelDisplayName = sidebarName || channelInfo.data?.channel_info?.ch_name || "channel";
    const memberCount = channelInfo.data?.channel_info?.ch_member_count ?? 0;
    const channelAgents = useChannelAgents(channelId, !!channelInfo.data?.channel_info?.ch_is_member);

    const channelCallActive = useSelector((state: RootState) => state.channel.channelCallStatus[channelId]?.active || false)

    useEffect(() => {

        if (channelInfo.data?.channel_info) {
            setFavorite(!!channelInfo.data.channel_info.ch_is_user_fav)
        }

        if(channelInfo.data?.channel_info.notification_type) {
            setChannelNotificationType(channelInfo.data?.channel_info.notification_type)
        }


    }, [channelInfo.data?.channel_info])

    // A call opens beside the channel, so the conversation stays in view.
    // Above the early returns: a hook runs on every render or none.
    const { isMobile } = useMedia();
    const openBeside = useOpenBeside(!isMobile);

    if(!channelId) return

    if(!channelInfo.data?.channel_info && channelInfo.isLoading) return <ChatSkeleton />

    const toggleFavourite = async () => {
        const nextState = !isFavorite;
        // Optimistic update
        setFavorite(nextState);
        dispatch(toggleUserChannelFavorite({ channelUUID: channelId, isFavorite: nextState }));

        try {
            if (isFavorite) {
                await postFav.makeRequest({
                    apiEndpoint: PostEndpointUrl.RemoveFavChannel,
                    appendToUrl: `/${channelId}`,
                });
            } else {
                await postFav.makeRequest({
                    apiEndpoint: PostEndpointUrl.AddFavChannel,
                    appendToUrl: `/${channelId}`,
                });
            }
        } catch {
            // Revert on failure
            setFavorite(!nextState);
            dispatch(toggleUserChannelFavorite({ channelUUID: channelId, isFavorite: !nextState }));
        }
    }

    const joinChannel = async () => {
        await postJoinChannel.makeRequest<ChannelJoinInterface>({apiEndpoint: PostEndpointUrl.JoinChannel, payload: {channel_uuid: channelId}, onSuccess : ()=>{
            channelInfo.mutate()
            }})
    }


    const UpdateNotification = async () => {
        const nextNotification = getNextNotification(channelNotification)
        await postNotification.makeRequest<ChannelNotificationInterface, GenericResponse >({payload:{channel_id: channelId, notification_type: nextNotification}, apiEndpoint: PostEndpointUrl.UpdateChannelNotification})
        setChannelNotificationType(nextNotification)
    }


    const channelCallHref = `${app_channel_call}/${channelId}`;
    const channelRecordingHref = `/app/channel/${channelId}/recording`;



    const renderChatInput = () =>{

        if(!channelInfo.data?.channel_info.ch_is_member) {
            return (
                <JoinChannelPrompt
                    channelName={channelDisplayName === "channel" ? "" : channelDisplayName}
                    onJoin={joinChannel}
                    joining={postJoinChannel.isSubmitting}
                    className="py-4"
                />
            )
        }

        if (!isZeroEpoch(channelInfo.data?.channel_info.ch_deleted_at || '')) {
            return (
                <ComposerNotice icon={<FileArchive />}>
                    This channel is archived. You can read it, but not post in it.
                </ComposerNotice>
            )
        }

        // Announcement channel: only moderators can post. Everyone else sees a
        // read-only notice instead of a composer that would 403 on send.
        if (
            channelInfo.data?.channel_info.ch_post_policy === "admins_only" &&
            !channelInfo.data?.channel_info.ch_is_admin
        ) {
            return (
                <ComposerNotice icon={<Megaphone />}>
                    Only moderators can post in this announcement channel.
                </ComposerNotice>
            )
        }

        return (
            <ChannelComposer
                channelId={channelId}
                handleSend={handleSend}
                placeholder={channelComposerPlaceholder(channelDisplayName, channelAgents.map((a) => a.name))}
                focusComposer={focusComposer}
            />
        )
    }


    return (
        <div className='flex flex-col h-full w-full min-w-0'>
            {/* The same shell as the DM and group headers: same height, same
                padding, opaque and sticky. It was a plain div at text-lg that
                scrolled away with the conversation and let the thread show
                through it, which is the collision people saw when a thread or
                the AI panel was open beside it. chatHeaderConsistency.test.ts
                holds all three to it now. */}
            <header className='flex items-center justify-between gap-2 h-12 md:h-14 px-3 md:px-4 border-b border-border/60 bg-background sticky top-0 z-[var(--z-sticky)]'>
                <div className='flex items-center gap-2.5 min-w-0'>
                    {/* The channel's own colour (lib/campHue, by its uuid): the same
                        mark it has in the channel list, so it is recognised before
                        its name is read. */}
                    <IdentityMark id={channelId} variant="tile" size={32} icon={<Hash />} />
                    <div className='flex flex-col min-w-0'>
                        <span data-header-title='' className='text-base font-semibold text-foreground truncate leading-tight'>{channelDisplayName}</span>
                        {/* The second line keeps this header the same height as a
                            DM's, and a member count is the thing people actually
                            want to know about a channel they just opened. */}
                        <span className='flex min-w-0 items-center text-2xs text-muted-foreground leading-tight'>
                            <span className='shrink-0'>
                                {memberCount > 0
                                    ? `${memberCount} ${memberCount === 1 ? "member" : "members"}`
                                    : channelInfo.data?.channel_info.ch_private ? "Private channel" : "Channel"}
                            </span>
                            <ChannelAgents channelId={channelId} isMember={!!channelInfo.data?.channel_info.ch_is_member} />
                        </span>
                    </div>
                    <ChannelMemoryIndicator channelUUID={channelId} isMember={!!channelInfo.data?.channel_info.ch_is_member} />
                </div>
                <div className='flex items-center gap-0.5 shrink-0'>
                    <WithTooltip label={isFavorite ? "Remove from favorites" : "Add to favorites"}>
                        <Button size='icon' variant='ghost' onClick={toggleFavourite} aria-label={isFavorite ? "Remove from favorites" : "Add to favorites"}>
                            <Star className={isFavorite ? 'text-warning-ink fill-warning' : 'text-muted-foreground'}/>
                        </Button>
                    </WithTooltip>

                    <NotificationBell notificationType={channelNotification} isLoading={postNotification.isSubmitting} onNotCLick={UpdateNotification}/>
                    <WithTooltip label="Manage channel members">
                        <Button aria-label="Manage channel members" size='icon' variant='ghost' onClick={()=>{dispatch(openUI({ key: 'editChannelMember', data: { channelUUID: channelId } }))}}> <Users /></Button>
                    </WithTooltip>
                    {/* Calls need a LiveKit server, which the shipped stack does not include.
                        Hidden rather than shown-and-failing when the operator has not run one. */}
                    <FeatureGate feature={FEATURE_CALLS}>
                    <WithTooltip label={channelCallActive ? "Join the call in progress" : "Start a call"}>
                    <Button size='icon' variant={channelCallActive ? 'secondary' : 'ghost'} className={cn(
                            "relative transition duration-300",
                            channelCallActive && "bg-success/10 text-success-ink hover:bg-success/20"
                        )} asChild><Link href={channelCallHref} onClick={(e) => openBeside({ kind: "call-channel", id: channelId }, e)} aria-label={channelCallActive ? "Join the call in progress" : "Start a call"}>
                        <Video size={18} />
                        {channelCallActive && (
                            <span className="absolute -top-0.5 -right-0.5 flex h-2.5 w-2.5">
                                <span className="motion-safe:animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75"></span>
                                <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${statusColors.online.solid}`}></span>
                            </span>
                        )}
                    </Link></Button>
                    </WithTooltip>
                    </FeatureGate>
                    {/* Everything a reader does not need every minute, in one menu:
                        the header had eight buttons of equal weight. What stays out
                        is what people use or need to see (favourite, the bell's
                        state, members, the call). */}
                    <DropdownMenu modal={false}>
                        <WithTooltip label="More channel actions">
                            <DropdownMenuTrigger asChild>
                                <Button size='icon' variant='ghost' aria-label="More channel actions"><MoreHorizontal /></Button>
                            </DropdownMenuTrigger>
                        </WithTooltip>
                        <DropdownMenuContent align="end" className="w-72">
                            <FeatureGate feature={FEATURE_AI}>
                                <DropdownMenuItem onClick={() => dispatch(openUI({ key: 'extractTasks', data: { sourceType: 'channel', sourceId: channelId } }))}>
                                    <CheckSquare className="text-muted-foreground" /> Create tasks from this conversation
                                </DropdownMenuItem>
                                <DropdownMenuItem asChild>
                                    <Link href={`/app/ai/memory?channel=${encodeURIComponent(channelId)}&name=${encodeURIComponent(channelDisplayName)}`}>
                                        <Lightbulb className="text-muted-foreground" /> Decisions and open questions
                                    </Link>
                                </DropdownMenuItem>
                            </FeatureGate>
                            <DropdownMenuItem onClick={() => dispatch(openUI({ key: 'channelCheckIns', data: { channelUUID: channelId } }))}>
                                <MessageSquare className="text-muted-foreground" /> Check-ins
                            </DropdownMenuItem>
                            <DropdownMenuItem asChild>
                                <Link href={channelRecordingHref}>
                                    <Clapperboard className="text-muted-foreground" /> Call recordings
                                </Link>
                            </DropdownMenuItem>
                            {channelInfo.data?.channel_info.ch_is_admin && (
                                <>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem onClick={() => dispatch(openUI({ key: 'editChannel', data: { channelUUID: channelId } }))}>
                                        <Pencil className="text-muted-foreground" /> Edit channel
                                    </DropdownMenuItem>
                                </>
                            )}
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>
            </header>
            <div className="flex-1 overflow-y-auto overflow-x-hidden min-w-0">
                <CatchMeUpBanner
                    channelUUID={channelId}
                    unreadCount={unreadCount || 0}
                    channelName={channelDisplayName}
                />
                <ChannelMessageList channelId={channelId} isAdmin={channelInfo.data?.channel_info.ch_is_admin} unreadOnOpen={unreadCount}/>
            </div>
            <div className="sticky bottom-0 left-0 right-0 z-[var(--z-fixed)] pb-4 px-4 bg-background">
                <div className="max-w-6xl mx-auto w-full">
                    {renderChatInput()}
                </div>
            </div>

        </div>
    )
}
/**
 * The channel's message box and what sits on it (a reply being written, the
 * messages scheduled here). Its own component because it is the only part of
 * the channel that changes as someone types: the draft is read here, so the
 * header and the conversation above it no longer re-render as it changes.
 */
const ChannelComposer = memo(function ChannelComposer({ channelId, handleSend, placeholder, focusComposer }: {
    channelId: string
    handleSend: (latestContent?: string) => boolean | void
    placeholder: string
    focusComposer?: boolean
}) {
    const dispatch = useDispatch()
    const scheduleSend = useScheduleSend()
    const uploadFile = useUploadFile()
    const channelState = useSelector((state: RootState) => state.channel.channelInputState[channelId] || EMPTY_INPUT_STATE);
    const { publishTyping } = usePublishTyping({ targetType: 'channel', targetId: channelId });
    // The same function for the life of the composer, so the editor's action
    // row (memoised in textInput) keeps its buttons as the parent re-renders.
    // A first message here bursts sparks from Send (lib/celebrate).
    const rootRef = useRef<HTMLDivElement>(null)
    const send = useStableCallback((latestContent?: string) => {
        if (handleSend(latestContent)) celebrate(rootRef.current?.querySelector('button[aria-label="Send"]'))
    })
    const onChange = useStableCallback((content: Content) => {
        publishTyping(content as string)
        dispatch(updateChannelInputText({channelId, inputTextHTML: content as string}))
    })
    const onActionFiles = useStableCallback(async (files: File[]) => {
        if (!files?.length) return;
        const valid = uploadFile.validateFiles(files);
        if (valid.length === 0) return;
        await uploadFile.makeRequestToUploadToChannel(valid as unknown as FileList, channelId);
    })
    const openUpload = useStableCallback(() => { dispatch(openUI({ key: 'channelFileUpload' })) })

    return (<div ref={rootRef}>
        <CommandSurface
            surfaceKey={channelId}
            channelId={channelId}
            onComposerText={(text) =>
                dispatch(updateChannelInputText({ channelId, inputTextHTML: `<p>${text}</p>` }))
            }
            onComposerHtml={(html) =>
                dispatch(updateChannelInputText({ channelId, inputTextHTML: html }))
            }
        />
        {channelState.replyToUuid && (
            <ComposerReplyPill
                authorName={channelState.replyToAuthorName}
                text={channelState.replyToText}
                onCancel={() => dispatch(clearChannelReplyTarget({ channelId }))}
            />
        )}
        {scheduleSend && <ScheduledMessagesBar target={scheduleSend.target} />}
        <MinimalTiptapTextInput
            throttleDelay={300}
            autoFocus={focusComposer}
            attachmentOnclick={openUpload}
            onActionFiles={onActionFiles}
            className={cn("max-w-full h-auto")}
            editorContentClassName="overflow-auto mb-2"
            output="html"
            content={channelState.inputTextHTML}
            contentRevision={channelState.restoredUnsent}
            placeholder={placeholder}
            editable={true}
            ButtonIcon={SendHorizontal}
            hasAttachments={(channelState.filesUploaded?.length ?? 0) > 0}
            buttonOnclick={send}
            onSchedule={scheduleSend?.schedule}
            editorClassName="focus:outline-none px-2 py-2"
            onChange={onChange}
            aiSlot={
                <ComposerAIButton
                    getText={() => channelState.inputTextHTML || ""}
                    onResult={(html) => dispatch(updateChannelInputText({ channelId, inputTextHTML: html }))}
                />
            }
        >
            <ChannelFileUpload channelId={channelId}/>
        </MinimalTiptapTextInput>
    </div>)
})

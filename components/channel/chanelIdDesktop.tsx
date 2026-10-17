import { useOpenBeside } from "@/hooks/useSplitView";
import { useMedia } from "@/context/MediaQueryContext";
import { searchWithinHref } from "@/lib/search/within";
import {useFetch} from "@/hooks/useFetch";
import { ChannelWelcome, useWelcomeSend } from "@/components/onboarding/ChannelWelcome";
import { useScheduleSend } from "@/context/ScheduleSendContext";
import { ScheduledMessagesBar } from "@/components/messages/scheduledMessagesBar";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useChannelAgents } from "@/components/ai/ChannelAgents";
import { openChannelDetails } from "@/components/channel/details/openChannelDetails";
import { channelComposerPlaceholder } from "@/lib/utils/composerPlaceholder";
import { ChannelInfoInterfaceResp } from "@/types/channel";
import { useChannelNotification } from "@/hooks/useConversationNotification";
import { useJoinChannel } from "@/hooks/useJoinChannel";
import {GetEndpointUrl, PostEndpointUrl} from "@/services/endPoints";
import MinimalTiptapTextInput from "@/components/textInput/textInput";
import { useUndoSchedule } from "@/components/textInput/useUndoSchedule";
import CommandSurface from "@/components/command/CommandSurface";
import { Info, Search, SendHorizontal, Star, Clapperboard, Megaphone, MoreHorizontal, MessageSquare, FileArchive } from "@/lib/icons";
import { ChannelTile } from "@/components/ui/graphics/ChannelTile";
import { HEADER_ICON, HuddleBanner, HuddleButton, MemberStack, NotificationSubmenu } from "@/components/channel/conversationHeaderParts";
import { Spark } from "@/components/ui/graphics/motifs";
import { displayNameOf } from "@/lib/personName";
import {Button} from "@/components/ui/button";
import {useDispatch, useSelector} from "react-redux";
import {RootState} from "@/store/store";
import {usePost} from "@/hooks/usePost";
import {memo, useCallback, useEffect, useMemo, useRef, useState} from "react";
import { celebrateFirstMessage } from "@/lib/chat/celebrateFirst";
import type { Content } from "@tiptap/react";
import { useStableCallback } from "@/hooks/useStableCallback";
import { ComposerReplyPill } from "@/components/message/composerReplyPill";
import {openUI} from "@/store/slice/uiSlice";
import { toggleUserChannelFavorite } from "@/store/slice/userSlice";
import {ChannelFileUpload} from "@/components/fileUpload/channelFileUpload";
import {ComposerAIButton} from "@/components/ai/ComposerAIButton";
import {
    
    updateChannelInputText, MessageInputState, clearChannelReplyTarget
} from "@/store/slice/channelSlice";

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
import { ChannelGuestTag } from "@/components/channel/channelGuestTag"

const EMPTY_INPUT_STATE: MessageInputState = { inputTextHTML: '', filesUploaded: [], filePreview: [] }

export const ChannelIdDesktop = ({channelId, handleSend: send, unreadCount, focusComposer}: {channelId: string, handleSend: (latestContent?: string) => boolean | void, unreadCount?: number, focusComposer?: boolean}) => {
    // A new member's first landing (admin E5): the welcome card heads the
    // feed until their first message goes.
    const [handleSend, welcomeSent] = useWelcomeSend(send)
    const dispatch = useDispatch()
    const postFav  = usePost()
    const channelInfo  = useFetch<ChannelInfoInterfaceResp>(channelId ? `${GetEndpointUrl.ChannelBasicInfo}/${channelId}`:'')
    const [isFavorite, setFavorite] = useState<boolean>(false)

    // Only the name: the sidebar's channel list changes whenever any channel's
    // unread count does, and this header has no use for that.
    const sidebarName = useSelector((state: RootState) => state.users.userSidebar.userChannels?.find((item)=>item.ch_uuid == channelId)?.ch_name);
    // Fallback to API response when channel isn't in sidebar state yet
    // (e.g. direct navigation from notification/bookmark)
    const channelDisplayName = sidebarName || channelInfo.data?.channel_info?.ch_name || "channel";
    // One click chooses a level (C04); nothing cycles any more.
    const notification = useChannelNotification(channelId, channelInfo.data?.channel_info?.notification_type, channelDisplayName);
    // A refused join is said, never left unhandled (hooks/useJoinChannel).
    const joining = useJoinChannel(channelId, () => { void channelInfo.mutate() }, channelDisplayName);
    const memberCount = channelInfo.data?.channel_info?.ch_member_count ?? 0;
    const channelAgents = useChannelAgents(channelId, !!channelInfo.data?.channel_info?.ch_is_member);

    const channelCallActive = useSelector((state: RootState) => state.channel.channelCallStatus[channelId]?.active || false)

    useEffect(() => {

        if (channelInfo.data?.channel_info) {
            setFavorite(!!channelInfo.data.channel_info.ch_is_user_fav)
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



    // One Details sheet (C49): the name, the stack and More › Details open it.
    const openDetails = () => dispatch(openChannelDetails(channelId))
    const openMembers = openDetails
    const archived = !isZeroEpoch(channelInfo.data?.channel_info.ch_deleted_at || '')
    const topic = (channelInfo.data?.channel_info.ch_about || '').trim()
    const stackPeople = [
        ...(channelInfo.data?.channel_info.ch_members || []).filter((m) => !m.is_bot).slice(0, 3).map((m) => ({ uuid: m.user_uuid, name: displayNameOf(m), profileKey: m.user_profile_object_key })),
        ...channelAgents.slice(0, 1).map((a) => ({ uuid: a.bot_user_id, name: a.name, isBot: true })),
    ]


    const channelCallHref = `${app_channel_call}/${channelId}`;
    const channelRecordingHref = `/app/channel/${channelId}/recording`;



    const renderChatInput = () =>{

        if(!channelInfo.data?.channel_info.ch_is_member) {
            return (
                <JoinChannelPrompt
                    channelName={channelDisplayName === "channel" ? "" : channelDisplayName}
                    onJoin={joining.join}
                    joining={joining.joining}
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
                agents={channelAgents}
            />
        )
    }


    return (
        <div className='flex flex-col h-full w-full min-w-0'>
            {/* The header is part of the sheet (design v3 chat, C01): 52px on
                the sheet with a hairline below. A channel has no hue: a
                monochrome # (a lock when private), the name at 15/590 and the
                topic after a hairline. On the right, who is here (agents as
                their squares), the one labelled action (Huddle), search and
                More. The name and topic are one button: the channel's details.
                chatHeaderConsistency.test.ts holds all three headers to it. */}
            {/* A container, so what the title carries follows the header's own
                width (a thread open beside it at 1024 left it 360px wide): the
                topic shrinks and goes first, the name keeps its first letters. */}
            <header className='@container/chathead sticky top-0 z-[var(--z-sticky)] flex h-[52px] shrink-0 items-center gap-2.5 border-b border-line bg-sheet pl-5 pr-3'>
                <button
                    type='button'
                    aria-label='Channel details'
                    onClick={openDetails}
                    className='-ml-1.5 flex min-w-0 items-center gap-2 rounded-md px-1.5 py-1 text-left transition-colors hover:bg-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring'
                >
                    {/* The channel's tile in its hue (D13), as the sidebar and the list draw it. */}
                    <ChannelTile id={channelId} isPrivate={!!channelInfo.data?.channel_info.ch_private} size={20} />
                    <span key={channelId} data-header-title='' className='min-w-[4ch] truncate text-heading text-ink animate-fade-in'>{channelDisplayName}</span>
                    {isFavorite && <Star className='size-3.5 shrink-0 fill-camp-sun text-camp-sun' aria-label='Favourite' />}
                    {archived && (
                        <span className='chip h-5 shrink-0 gap-1 bg-sunken'><FileArchive className='size-3' aria-hidden='true' /> Archived</span>
                    )}
                    {channelInfo.data?.channel_info.has_guest_access && <ChannelGuestTag />}
                    {topic ? (
                        <span key={topic} data-header-topic='' className='ml-0.5 hidden min-w-0 shrink-[8] truncate border-l border-line-2 pl-2.5 text-ui-sm text-ink-3 animate-fade-in @[38rem]/chathead:block' title={topic}>{topic}</span>
                    ) : channelInfo.data?.channel_info.ch_is_admin ? (
                        <span data-header-topic='' className='ml-0.5 hidden min-w-0 shrink-[8] truncate border-l border-line-2 pl-2.5 text-ui-sm text-ink-3 transition-colors hover:text-ink-2 @[38rem]/chathead:block'>Add a topic</span>
                    ) : null}
                </button>
                <ChannelMemoryIndicator channelUUID={channelId} isMember={!!channelInfo.data?.channel_info.ch_is_member} />
                <div className='min-w-0 flex-1' />
                <div className='flex shrink-0 items-center gap-1'>
                    <MemberStack people={stackPeople} count={memberCount} onClick={openMembers} />
                    {/* Calls need a LiveKit server, which the shipped stack does not include.
                        Hidden rather than shown-and-failing when the operator has not run one. */}
                    <FeatureGate feature={FEATURE_CALLS}>
                        <span className='ml-1'>
                            <HuddleButton href={channelCallHref} live={channelCallActive} onOpen={(e) => openBeside({ kind: "call-channel", id: channelId }, e)} />
                        </span>
                    </FeatureGate>
                    {/* Search in this channel, said and removable on the search page (QA F-15). */}
                    <WithTooltip label="Search in this channel">
                        <Button asChild size='icon' variant='ghost' className={HEADER_ICON}>
                            <Link href={searchWithinHref({ kind: "channel", id: channelId })} aria-label={`Search in #${channelDisplayName}`}><Search aria-hidden='true' /></Link>
                        </Button>
                    </WithTooltip>
                    {/* More (C05): AI, then how you follow it, then the channel
                        itself, on the floating material. Leave is danger ink,
                        never a red fill. */}
                    <DropdownMenu modal={false}>
                        <WithTooltip label="More channel actions">
                            <DropdownMenuTrigger asChild>
                                <Button size='icon' variant='ghost' aria-label="More channel actions" className={HEADER_ICON}><MoreHorizontal aria-hidden='true' /></Button>
                            </DropdownMenuTrigger>
                        </WithTooltip>
                        <DropdownMenuContent align="end" className="pop-surface w-64 p-1">
                            <FeatureGate feature={FEATURE_AI}>
                                <DropdownMenuItem onClick={() => dispatch(openUI({ key: 'extractTasks', data: { sourceType: 'channel', sourceId: channelId } }))}>
                                    <Spark size={14} className="text-agent" /> Create tasks from this chat
                                </DropdownMenuItem>
                                <DropdownMenuItem asChild>
                                    <Link href={`/app/ai/memory?channel=${encodeURIComponent(channelId)}&name=${encodeURIComponent(channelDisplayName)}`}>
                                        <Spark size={14} className="text-agent" /> Decisions and open questions
                                    </Link>
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                            </FeatureGate>
                            <NotificationSubmenu value={notification.level} onChange={notification.choose} busy={notification.busy} />
                            <DropdownMenuItem onClick={toggleFavourite}>
                                <Star className={isFavorite ? "fill-camp-sun text-camp-sun" : "text-ink-3"} aria-hidden="true" /> {isFavorite ? "Remove from favourites" : "Favourite"}
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => dispatch(openUI({ key: 'channelCheckIns', data: { channelUUID: channelId } }))}>
                                <MessageSquare className="text-ink-3" aria-hidden="true" /> Check-ins
                            </DropdownMenuItem>
                            <DropdownMenuItem asChild>
                                <Link href={channelRecordingHref}>
                                    <Clapperboard className="text-ink-3" aria-hidden="true" /> Recordings
                                </Link>
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={openDetails}>
                                <Info className="text-ink-3" aria-hidden="true" /> Details
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>
            </header>
            {channelCallActive && (
                <FeatureGate feature={FEATURE_CALLS}>
                    <HuddleBanner href={channelCallHref} onOpen={(e) => openBeside({ kind: "call-channel", id: channelId }, e)} />
                </FeatureGate>
            )}
            <div className="flex-1 overflow-y-auto overflow-x-hidden min-w-0">
                <CatchMeUpBanner
                    channelUUID={channelId}
                    unreadCount={unreadCount || 0}
                    channelName={channelDisplayName}
                />
                <ChannelWelcome channelId={channelId} channelName={channelDisplayName} info={channelInfo.data?.channel_info} show={focusComposer} sent={welcomeSent} className="mx-5 mt-4 max-w-[760px]" />
                <ChannelMessageList channelId={channelId} isAdmin={channelInfo.data?.channel_info.ch_is_admin} unreadOnOpen={unreadCount}/>
            </div>
            <div className="sticky bottom-0 left-0 right-0 z-[var(--z-fixed)] bg-sheet px-5 pb-[18px]">
                <div className="w-full max-w-[800px]">
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
const ChannelComposer = memo(function ChannelComposer({ channelId, handleSend, placeholder, focusComposer, agents: channelAgents }: {
    channelId: string
    handleSend: (latestContent?: string) => boolean | void
    placeholder: string
    focusComposer?: boolean
    /** The channel's agents, for "+" › Ask (C42). */
    agents?: { bot_user_id: string; name: string }[]
}) {
    const agents = useMemo(() => (channelAgents ?? []).map((a) => ({ id: a.bot_user_id, name: a.name })), [channelAgents])
    const dispatch = useDispatch()
    const scheduleSend = useScheduleSend()
    const uploadFile = useUploadFile()
    const channelState = useSelector((state: RootState) => state.channel.channelInputState[channelId] || EMPTY_INPUT_STATE);
    const { publishTyping } = usePublishTyping({ targetType: 'channel', targetId: channelId });
    // The same function for the life of the composer, so the editor's action
    // row (memoised in textInput) keeps its buttons as the parent re-renders.
    // A first message here bursts from the new row's avatar (C60).
    const rootRef = useRef<HTMLDivElement>(null)
    // Draft with AI opens from "+" and ⌘J (C45); Undo takes back a schedule (C44).
    const [aiOpen, setAiOpen] = useState(false)
    const openAi = useCallback(() => setAiOpen(true), [])
    const undoSchedule = useUndoSchedule(scheduleSend?.target)
    const send = useStableCallback((latestContent?: string) => {
        if (handleSend(latestContent)) celebrateFirstMessage()
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
            variant="chat"
            agents={agents}
            output="html"
            content={channelState.inputTextHTML}
            contentRevision={channelState.restoredUnsent}
            placeholder={placeholder}
            editable={true}
            ButtonIcon={SendHorizontal}
            hasAttachments={(channelState.filesUploaded?.length ?? 0) > 0}
            buttonOnclick={send}
            onSchedule={scheduleSend?.schedule}
            editorClassName="focus:outline-none"
            onChange={onChange}
            onDraftWithAI={openAi}
            onUndoSchedule={undoSchedule}
            aiSlot={
                <ComposerAIButton
                    open={aiOpen}
                    onOpenChange={setAiOpen}
                    getText={() => channelState.inputTextHTML || ""}
                    onResult={(html) => dispatch(updateChannelInputText({ channelId, inputTextHTML: html }))}
                />
            }
        >
            <ChannelFileUpload channelId={channelId}/>
        </MinimalTiptapTextInput>
    </div>)
})

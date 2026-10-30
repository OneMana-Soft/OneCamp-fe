import { useOpenBeside } from "@/hooks/useOpenBeside";
import { PinnedMenuItem } from "@/components/conversation/pins/PinnedMenuItem";
import { ConnectedTrigger } from "@/components/workGraph/ConnectedTrigger"
import { searchWithinHref } from "@/lib/search/within";
import {useFetch} from "@/hooks/useFetch";
import { ChannelWelcome, useWelcomeSend } from "@/components/onboarding/ChannelWelcome";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { openChannelDetails } from "@/components/channel/details/openChannelDetails";
import { channelComposerPlaceholder } from "@/lib/utils/composerPlaceholder";
import { ChannelInfoInterfaceResp } from "@/types/channel";
import { useChannelNotification } from "@/hooks/useConversationNotification";
import { useJoinChannel } from "@/hooks/useJoinChannel";
import {GetEndpointUrl, PostEndpointUrl} from "@/services/endPoints";
import { Info, Search, Star, Clapperboard, Megaphone, MoreHorizontal, MessageSquare, FileArchive } from "@/lib/icons";
import { ChannelTile } from "@/components/ui/graphics/ChannelTile";
import { HEADER_ICON, HuddleBanner, HuddleButton, MemberStack, NotificationSubmenu } from "@/components/channel/conversationHeaderParts";
import { displayNameOf } from "@/lib/personName";
import {Button} from "@/components/ui/button";
import {useDispatch, useSelector} from "react-redux";
import {RootState} from "@/store/store";
import {usePost} from "@/hooks/usePost";
import { useEffect, useMemo, useState } from "react";
import {openUI} from "@/store/slice/uiSlice";
import { toggleUserChannelFavorite } from "@/store/slice/userSlice";
import { channelList } from "@/components/conversation/ChannelRows";
import { ConversationMessages } from "@/components/conversation/ConversationMessages";
import { Composer } from "@/components/conversation/Composer";
import { useChannelSend } from "@/hooks/useChannelSend";
import { JoinChannelPrompt } from "@/components/channel/JoinChannelPrompt";
import { ComposerNotice } from "@/components/channel/composerNotice";
import {isZeroEpoch} from "@/lib/utils/validation/isZeroEpoch";
import {app_channel_call} from "@/types/paths";
import Link from "next/link";
import {ChatSkeleton} from "@/components/ui/AppSkeleton";
import { FeatureGate } from "@/components/common/withFeature"
import { WithTooltip } from "@/components/common/withTooltip"
import { FEATURE_CALLS } from "@/hooks/useClientConfig"
import { ChannelGuestTag } from "@/components/channel/channelGuestTag"

export const ChannelIdDesktop = ({channelId, handleSend: send, focusComposer}: {channelId: string, handleSend: (latestContent?: string) => boolean | void, focusComposer?: boolean}) => {
    // A new member's first landing (admin E5): the welcome card heads the
    // feed until their first message goes.
    const [handleSend, welcomeSent] = useWelcomeSend(send)
    const list = useMemo(() => channelList(channelId), [channelId])
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

    const channelCallActive = useSelector((state: RootState) => state.channel.channelCallStatus[channelId]?.active || false)

    useEffect(() => {

        if (channelInfo.data?.channel_info) {
            setFavorite(!!channelInfo.data.channel_info.ch_is_user_fav)
        }

    }, [channelInfo.data?.channel_info])

    // A call opens beside the channel, so the conversation stays in view.
    // Above the early returns: a hook runs on every render or none.
    // Where views can't sit side by side (a phone, a tablet) it opens the call's page.
    const openBeside = useOpenBeside();
    // A send asks first where a broadcast would (hooks/useChannelSend).
    const sendThrough = useChannelSend(channelId, channelDisplayName);

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
            <Composer
                handleSend={handleSend}
                placeholder={channelComposerPlaceholder(channelDisplayName)}
                autoFocus={focusComposer}
                sendThrough={sendThrough}
            />
        )
    }

    return (
        <div className='flex flex-col h-full w-full min-w-0'>
            {/* The header is part of the sheet (design v3 chat, C01): 52px on
                the sheet with a hairline below. A channel has no hue: a
                monochrome # (a lock when private), the name at 15/590 and the
                topic after a hairline. On the right, who is here, the one labelled action (Huddle), search and
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
                    <ConnectedTrigger kind="channel" id={channelId} title={channelDisplayName === "channel" ? "" : channelDisplayName} tip="Connected" className="size-7 rounded-md" />
                    {/* Search in this channel, said and removable on the search page (QA F-15). */}
                    <WithTooltip label="Search in this channel">
                        <Button asChild size='icon' variant='ghost' className={HEADER_ICON}>
                            <Link href={searchWithinHref({ kind: "channel", id: channelId })} aria-label={`Search in #${channelDisplayName}`}><Search aria-hidden='true' /></Link>
                        </Button>
                    </WithTooltip>
                    {/* More (C05): how you follow it, then the channel
                        itself, on the floating material. Leave is danger ink,
                        never a red fill. */}
                    <DropdownMenu modal={false}>
                        <WithTooltip label="More channel actions">
                            <DropdownMenuTrigger asChild>
                                <Button size='icon' variant='ghost' aria-label="More channel actions" className={HEADER_ICON}><MoreHorizontal aria-hidden='true' /></Button>
                            </DropdownMenuTrigger>
                        </WithTooltip>
                        <DropdownMenuContent align="end" className="pop-surface w-64 p-1">
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
                            <PinnedMenuItem conversation={{ kind: "channel", id: channelId }} onOpen={openDetails} />
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
                <ChannelWelcome channelId={channelId} channelName={channelDisplayName} info={channelInfo.data?.channel_info} show={focusComposer} sent={welcomeSent} className="mx-5 mt-4 max-w-[760px]" />
                <ConversationMessages list={list} isAdmin={channelInfo.data?.channel_info.ch_is_admin}/>
            </div>
            <div className="sticky bottom-0 left-0 right-0 z-[var(--z-fixed)] bg-sheet px-5 pb-[18px]">
                <div className="w-full max-w-[800px]">
                    {renderChatInput()}
                </div>
            </div>

        </div>
    )
}

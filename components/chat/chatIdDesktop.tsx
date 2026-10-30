import { useOpenBeside } from "@/hooks/useOpenBeside";
import { dmComposerPlaceholder } from "@/lib/utils/composerPlaceholders";
import { PinnedMenuItem } from "@/components/conversation/pins/PinnedMenuItem";
import { dmWith } from "@/lib/conversation/route";
import { PRESENCE_WORDS, presenceOf } from "@/lib/presence";
import { searchWithinHref } from "@/lib/search/within";
import { displayNameOf } from "@/lib/personName";
import { useFetchOnlyOnce } from "@/hooks/useFetch";
import { GetEndpointUrl } from "@/services/endPoints";
import { HEADER_ICON, HuddleBanner, HuddleButton, NotificationSubmenu } from "@/components/channel/conversationHeaderParts";
import { ChatFace } from "@/components/message/chatFace";
import { WithTooltip } from "@/components/common/withTooltip";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { MoreHorizontal, Search, ShieldCheck, UserPlus, Users } from "@/lib/icons";
import { Clapperboard } from "@/lib/icons";
import {useDispatch, useSelector} from "react-redux";
import {RootState} from "@/store/store";
import { useChatNotification } from "@/hooks/useConversationNotification";
import { useCallback, useEffect } from "react";
import {openUI} from "@/store/slice/uiSlice";

import { ConversationMessages } from "@/components/conversation/ConversationMessages";
import { Composer } from "@/components/conversation/Composer";
import { DmComposerExtras } from "@/components/chat/DmComposerExtras";
import type { ConversationRef } from "@/lib/conversation/types";
import { useDmList } from "@/components/conversation/DmRows";
import {UserEmojiStatus, UserProfileInterface} from "@/types/user";
import {updateUserConnectedDeviceCount, updateUserEmojiStatus, updateUserStatus} from "@/store/slice/userSlice";
import {ChatUserEmojiStatus} from "@/components/chat/chatUserEmojiStatus";
import {Button} from "@/components/ui/button";
import {app_chat_call} from "@/types/paths";
import Link from "next/link";
import { ChatSkeleton } from "@/components/ui/AppSkeleton";
import {useUserInfoState} from "@/hooks/useUserInfoState";
import {getGroupingId} from "@/lib/utils/getGroupingId";
import { FeatureGate } from "@/components/common/withFeature"
import { FEATURE_CALLS } from "@/hooks/useClientConfig"
import { userDisplayName } from "@/lib/utils/userDisplayName"

export const ChatIdDesktop = ({chatId, handleSend}: {chatId: string, handleSend: (latestContent?: string) => boolean | void}) => {
    const dispatch = useDispatch()
    const list = useDmList(chatId)
    const otherUserInfo  = useFetchOnlyOnce<UserProfileInterface>(`${GetEndpointUrl.SelfProfile}/${chatId}`)
    const selfProfile = useFetchOnlyOnce<UserProfileInterface>(GetEndpointUrl.SelfProfile)
    // A DM's level: one write for its header and a phone's sheet (hooks/useConversationNotification).
    const notification = useChatNotification(chatId, otherUserInfo.data?.data?.notification_type)

    const chatCallHref = `${app_chat_call}/${chatId}`;
    // A call opens beside the conversation, so it stays in view.
    // Where views can't sit side by side (a phone, a tablet) it opens the call's page.
    const openBeside = useOpenBeside();
    const chatRecordingHref = `/app/chat/${chatId}/recording`;
    const isBotPeer = otherUserInfo.data?.data?.is_bot === true;
    const peerName = userDisplayName(otherUserInfo.data?.data);
    const extras = useCallback((send: (html: string) => void, conversation: ConversationRef) => (
        <DmComposerExtras conversation={conversation} send={send} peerName={peerName} isBot={isBotPeer} />
    ), [peerName, isBotPeer]);

    const chatCallStatusActive = useSelector((state: RootState) => state.chat.chatCallStatus[chatId]?.active || false);

    const userStatusState = useUserInfoState(chatId);

    useEffect(() => {

        if(otherUserInfo.data?.data) {
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

    // One rule for where they are, as the phone's header says it (lib/presence, QA F-18).
    const presence = presenceOf(userStatusState, otherUserInfo.data?.data);
    const isOnline = presence === "active";

    return (
        <div className='flex flex-col h-full relative'>
            {/* A DM's header (design v3 chat, C02): 52px on the sheet, the
                28px face with presence, the name at 15/590 and the status after
                a hairline. An agent shows its provenance where a person's
                status would be: "Acts for you · can do only what you can".
                Huddle (not for an agent), search and More; every icon has a
                tooltip. */}
            <header className='@container/chathead sticky top-0 z-[var(--z-sticky)] flex h-[52px] shrink-0 items-center gap-2.5 border-b border-line bg-sheet pl-5 pr-3'>
                <div className='relative shrink-0'>
                    <ChatFace name={userDisplayName(otherUserInfo.data?.data) || ""} profileKey={otherUserInfo.data?.data.user_profile_object_key} userUUID={chatId} isBot={isBotPeer} size={28} />
                    {!isBotPeer && (isOnline
                        ? <span aria-hidden className='presence-dot' />
                        : <span aria-hidden className='absolute -bottom-px -right-px size-2 rounded-full border-[1.5px] border-ink-4 bg-sheet ring-2 ring-sheet' />)}
                </div>
                {/* The name keeps its room; what follows it shrinks first, so
                    a narrow header (a thread open beside it) still says who. */}
                <span data-header-title='' className='min-w-[4ch] max-w-[60%] shrink-0 truncate text-heading text-ink'>{userDisplayName(otherUserInfo.data?.data)}</span>
                {isBotPeer ? (
                    <span data-header-meta='' className='inline-flex h-[22px] min-w-0 items-center gap-1.5 rounded-sm bg-agent-muted px-2 text-meta text-agent-ink'>
                        <ShieldCheck className='size-3 shrink-0' aria-hidden='true' /> <span className='truncate'>Acts for you · can do only what you can</span>
                    </span>
                ) : (
                    <span data-header-meta='' className='flex min-w-0 items-center gap-1.5 truncate border-l border-line-2 pl-2.5 text-ui-sm text-ink-3'>
                        {PRESENCE_WORDS[presence]}
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
                    {/* Search in this conversation (QA F-15). */}
                    <WithTooltip label="Search in this conversation">
                        <Button asChild size='icon' variant='ghost' className={HEADER_ICON}>
                            <Link href={searchWithinHref({ kind: "dm", id: chatId })} aria-label={`Search in your messages with ${userDisplayName(otherUserInfo.data?.data) || "them"}`}><Search aria-hidden='true' /></Link>
                        </Button>
                    </WithTooltip>
                    <DropdownMenu modal={false}>
                        <WithTooltip label="More conversation actions">
                            <DropdownMenuTrigger asChild>
                                <Button size='icon' variant='ghost' aria-label="More conversation actions" className={HEADER_ICON}><MoreHorizontal aria-hidden='true' /></Button>
                            </DropdownMenuTrigger>
                        </WithTooltip>
                        <DropdownMenuContent align="end" className="pop-surface w-64 p-1">
                            <NotificationSubmenu value={notification.level} onChange={notification.choose} busy={notification.busy} />
                            {!isBotPeer && selfProfile.data?.data?.user_uuid && (
                                <DropdownMenuItem onClick={() => dispatch(openUI({ key: 'editDmMember', data: { grpId: getGroupingId(selfProfile.data!.data.user_uuid, chatId), kind: 'dm', adding: true } }))}>
                                    <UserPlus className="text-ink-3" aria-hidden="true" /> Add people
                                </DropdownMenuItem>
                            )}
                            {selfProfile.data?.data?.user_uuid && (
                                <DropdownMenuItem onClick={() => dispatch(openUI({ key: 'editDmMember', data: { grpId: getGroupingId(selfProfile.data!.data.user_uuid, chatId), kind: 'dm' } }))}>
                                    <Users className="text-ink-3" aria-hidden="true" /> Details
                                </DropdownMenuItem>
                            )}
                            <PinnedMenuItem
                                conversation={dmWith(chatId, selfProfile.data?.data?.user_uuid)}
                                onOpen={() => dispatch(openUI({ key: 'editDmMember', data: { grpId: getGroupingId(selfProfile.data!.data.user_uuid, chatId), kind: 'dm' } }))}
                            />
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
                {list && <ConversationMessages list={list} />}
            </div>

            <div className="sticky bottom-0 left-0 right-0 z-[var(--z-fixed)] bg-sheet px-5 pb-[18px]">
                <div className="w-full max-w-[800px]">
                    <Composer handleSend={handleSend} placeholder={dmComposerPlaceholder(displayNameOf(otherUserInfo.data?.data))} above={extras} />
                </div>
            </div>

        </div>
    )
}

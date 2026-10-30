import { Composer } from "@/components/conversation/Composer";
import { useChannelSend } from "@/hooks/useChannelSend";
import { useChannelAgents } from "@/components/ai/ChannelAgents";
import { channelComposerPlaceholder } from "@/lib/utils/composerPlaceholder";
import { useMemo } from "react";
import { channelList } from "@/components/conversation/ChannelRows";
import { ConversationMessages } from "@/components/conversation/ConversationMessages";
import { ComposerNotice } from "@/components/channel/composerNotice";
import { JoinChannelPrompt } from "@/components/channel/JoinChannelPrompt";
import {ChannelInfoInterfaceResp} from "@/types/channel";
import {GetEndpointUrl} from "@/services/endPoints";
import { useJoinChannel } from "@/hooks/useJoinChannel";
import {useFetch} from "@/hooks/useFetch";
import { FileArchive, Megaphone } from "@/lib/icons";
import {useSelector} from "react-redux";
import {RootState} from "@/store/store";
import {isZeroEpoch} from "@/lib/utils/validation/isZeroEpoch";
import { ChatSkeleton } from "@/components/ui/AppSkeleton";
import CatchMeUpBanner from "@/components/ai/CatchMeUpBanner";
import { ChannelWelcome, useWelcomeSend } from "@/components/onboarding/ChannelWelcome";

export const ChannelIdMobile = ({channelId, handleSend: send, focusComposer}: {channelId: string, handleSend: (latestContent?: string) => boolean | void, focusComposer?: boolean }) => {
    // A new member's first landing (admin E5): the welcome card heads the feed.
    const [handleSend, welcomeSent] = useWelcomeSend(send)
    const list = useMemo(() => channelList(channelId), [channelId])

    const userChannels = useSelector((state: RootState) => state.users.userSidebar.userChannels);
    const channelInSidebar = userChannels.find(ch => ch.ch_uuid === channelId);

    const channelInfo  = useFetch<ChannelInfoInterfaceResp>(`${GetEndpointUrl.ChannelBasicInfo}/${channelId}`)

    const channelDisplayName = channelInSidebar?.ch_name || channelInfo.data?.channel_info?.ch_name || "";
    // A refused join is said, never left unhandled (hooks/useJoinChannel).
    const joining = useJoinChannel(channelId, () => { void channelInfo.mutate() }, channelDisplayName);
    const channelAgents = useChannelAgents(channelId, !!channelInfo.data?.channel_info?.ch_is_member);
    const composerAgents = useMemo(() => channelAgents.map((a) => ({ id: a.bot_user_id, name: a.name })), [channelAgents]);
    const sendThrough = useChannelSend(channelId, channelDisplayName);



    if(channelInfo.isLoading) {
        return <ChatSkeleton />
    }

    const renderChatInput = () =>{

        if(!channelInfo.data?.channel_info.ch_is_member) {
            return (
                <JoinChannelPrompt
                    channelName={channelDisplayName}
                    onJoin={joining.join}
                    joining={joining.joining}
                    // 16px above the screen's edge as well as the home bar: the
                    // button touched the bottom of the screen.
                    className="mt-12 pb-[calc(1rem+env(safe-area-inset-bottom))]"
                />
            )
        }

        if(!isZeroEpoch(channelInfo.data?.channel_info.ch_deleted_at || '')) {
            // Had no background, so messages scrolled visibly through the text, and
            // no `flex`, so the centring classes were inert. Its sibling (the
            // moderators-only notice below) already gets both right.
            return (
                // The moderators-only notice's form: one quiet line where the
                // composer would be, in the desktop's words. It was a 64px
                // block ending in an emoji.
                <ComposerNotice icon={<FileArchive />} className='border-t fixed bottom-0 px-4 py-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] bg-background'>
                    This channel is archived. You can read it, but not post in it.
                </ComposerNotice>
            )
        }

        if (
            channelInfo.data?.channel_info.ch_post_policy === "admins_only" &&
            !channelInfo.data?.channel_info.ch_is_admin
        ) {
            return (
                <ComposerNotice icon={<Megaphone />} className='border-t fixed bottom-0 px-4 py-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] bg-background'>
                    Only moderators can post here.
                </ComposerNotice>
            )
        }

        return (
            <Composer
                phone
                handleSend={handleSend}
                placeholder={channelComposerPlaceholder(channelDisplayName || "channel", channelAgents.map((a) => a.name), { compact: true })}
                autoFocus={focusComposer}
                agents={composerAgents}
                sendThrough={sendThrough}
            />
        )
    }
    return (
        <div className='flex flex-col h-full'>
            <CatchMeUpBanner
                channelUUID={channelId}
                channelName={channelDisplayName}
            />
            <ChannelWelcome channelId={channelId} channelName={channelDisplayName} info={channelInfo.data?.channel_info} show={focusComposer} sent={welcomeSent} className="mx-4 mt-3 shrink-0" />
            <div className="flex-1 min-h-0">
                <ConversationMessages list={list}/>
            </div>

            <div>

                {renderChatInput()}
            </div>

        </div>
    )
}
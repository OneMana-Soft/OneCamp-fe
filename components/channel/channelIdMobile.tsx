import {MobileChannelTextInput} from "@/components/textInput/mobileChannelTextInput";
import {ChannelMessageList} from "@/components/channel/channelMessageList";
import { ComposerNotice } from "@/components/channel/composerNotice";
import { JoinChannelPrompt } from "@/components/channel/JoinChannelPrompt";
import {ChannelInfoInterfaceResp, ChannelJoinInterface} from "@/types/channel";
import {GetEndpointUrl, PostEndpointUrl} from "@/services/endPoints";
import {usePost} from "@/hooks/usePost";
import {useFetch} from "@/hooks/useFetch";
import { FileArchive, Megaphone } from "@/lib/icons";
import {useDispatch, useSelector} from "react-redux";
import {RootState} from "@/store/store";
import {isZeroEpoch} from "@/lib/utils/validation/isZeroEpoch";
import { ChatSkeleton } from "@/components/ui/AppSkeleton";
import { clearChannelReplyTarget } from "@/store/slice/channelSlice";
import { ComposerReplyPill } from "@/components/message/composerReplyPill";

export const ChannelIdMobile = ({channelId, handleSend, unreadCount, focusComposer}: {channelId: string, handleSend: (latestContent?: string) => boolean | void, unreadCount?: number, focusComposer?: boolean }) => {

    const dispatch = useDispatch();
    const userChannels = useSelector((state: RootState) => state.users.userSidebar.userChannels);
    const channelInSidebar = userChannels.find(ch => ch.ch_uuid === channelId);
    const replyState = useSelector((state: RootState) => state.channel.channelInputState[channelId]);

    const postJoinChannel = usePost()

    const channelInfo  = useFetch<ChannelInfoInterfaceResp>(`${GetEndpointUrl.ChannelBasicInfo}/${channelId}`)

    const channelDisplayName = channelInSidebar?.ch_name || channelInfo.data?.channel_info?.ch_name || "";



    const joinChannel = async () => {
        await postJoinChannel.makeRequest<ChannelJoinInterface>({apiEndpoint: PostEndpointUrl.JoinChannel, payload: {channel_uuid: channelId}, onSuccess : ()=>{
                channelInfo.mutate()
            }})
    }

    if(channelInfo.isLoading) {
        return <ChatSkeleton />
    }

    const renderChatInput = () =>{

        if(!channelInfo.data?.channel_info.ch_is_member) {
            return (
                <JoinChannelPrompt
                    channelName={channelDisplayName}
                    onJoin={joinChannel}
                    joining={postJoinChannel.isSubmitting}
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
            <>
                {replyState?.replyToUuid && (
                    <div className="px-3">
                        <ComposerReplyPill
                            authorName={replyState.replyToAuthorName}
                            text={replyState.replyToText}
                            onCancel={() => dispatch(clearChannelReplyTarget({ channelId }))}
                        />
                    </div>
                )}
                <MobileChannelTextInput channelId={channelId} handleSend={handleSend} autoFocus={focusComposer}/>
            </>
        )
    }
    return (
        <div className='flex flex-col h-full'>
            <div className="flex-1 min-h-0">
                <ChannelMessageList channelId={channelId} unreadOnOpen={unreadCount}/>
            </div>

            <div>

                {renderChatInput()}
            </div>

        </div>
    )
}
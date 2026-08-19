import {MobileChannelTextInput} from "@/components/textInput/mobileChannelTextInput";
import {ChannelMessageList} from "@/components/channel/channelMessageList";
import {ChannelInfoInterfaceResp, ChannelJoinInterface} from "@/types/channel";
import {GetEndpointUrl, PostEndpointUrl} from "@/services/endPoints";
import {usePost} from "@/hooks/usePost";
import {useFetch, useFetchOnlyOnce} from "@/hooks/useFetch";
import {Button} from "@/components/ui/button";
import { LoaderCircle, Megaphone } from "@/lib/icons";
import {TypingIndicator} from "@/components/typingIndicator/typyingIndicaator";
import {useDispatch, useSelector} from "react-redux";
import {RootState} from "@/store/store";
import {UserProfileInterface} from "@/types/user";
import {isZeroEpoch} from "@/lib/utils/validation/isZeroEpoch";
import { ChatSkeleton } from "@/components/ui/AppSkeleton";
import { clearChannelReplyTarget } from "@/store/slice/channelSlice";
import { ComposerReplyPill } from "@/components/message/composerReplyPill";

export const ChannelIdMobile = ({channelId, handleSend, unreadCount}: {channelId: string, handleSend: (latestContent?: string)=>void, unreadCount?: number }) => {

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
                <div className='mt-12 flex-col justify-center items-center w-full text-center space-y-2'>
                    <div>you are not the member of the channel</div>
                    <Button onClick={joinChannel}>
                        Join channel
                    </Button>
                </div>
            )
        }

        if(!isZeroEpoch(channelInfo.data?.channel_info.ch_deleted_at || '')) {
            // Had no background, so messages scrolled visibly through the text, and
            // no `flex`, so the centring classes were inert. Its sibling (the
            // moderators-only notice below) already gets both right.
            return (
                <div className='border-t fixed bottom-0 flex flex-col justify-center items-center w-full py-8 pb-[calc(2rem+env(safe-area-inset-bottom))] text-center space-y-2 bg-background'>
                    <div>Channel is archived 📦</div>
                    {/*{channelInfo.data?.channel_info.ch_is_admin &&*/}
                    {/*    <Button onClick={joinChannel}>*/}
                    {/*    Unarchive channel*/}
                    {/*</Button>}*/}
                </div>
            )
        }

        if (
            channelInfo.data?.channel_info.ch_post_policy === "admins_only" &&
            !channelInfo.data?.channel_info.ch_is_admin
        ) {
            return (
                <div className='border-t fixed bottom-0 flex items-center justify-center gap-2 w-full py-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] text-center text-sm text-muted-foreground bg-background'>
                    <Megaphone className="h-4 w-4" />
                    <span>Only moderators can post here.</span>
                </div>
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
                <MobileChannelTextInput channelId={channelId} handleSend={handleSend}/>
            </>
        )
    }
    return (
        <div className='flex flex-col h-full'>
            <div className="flex-1 min-h-0">
                <ChannelMessageList channelId={channelId}/>
            </div>

            <div>

                {renderChatInput()}
            </div>

        </div>
    )
}
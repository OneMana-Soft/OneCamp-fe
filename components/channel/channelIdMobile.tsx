import {MobileChannelTextInput} from "@/components/textInput/mobileChannelTextInput";
import {ChannelMessageList} from "@/components/channel/channelMessageList";
import {ChannelInfoInterfaceResp, ChannelJoinInterface} from "@/types/channel";
import {GetEndpointUrl, PostEndpointUrl} from "@/services/endPoints";
import {usePost} from "@/hooks/usePost";
import {useFetch, useFetchOnlyOnce} from "@/hooks/useFetch";
import {Button} from "@/components/ui/button";
import {LoaderCircle} from "lucide-react";
import {TypingIndicator} from "@/components/typingIndicator/typyingIndicaator";
import {useSelector} from "react-redux";
import {RootState} from "@/store/store";
import {UserProfileInterface} from "@/types/user";
import {isZeroEpoch} from "@/lib/utils/validation/isZeroEpoch";
import {LoadingStateCircle} from "@/components/loading/loadingStateCircle";
import CatchMeUpBanner from "@/components/ai/CatchMeUpBanner";

export const ChannelIdMobile = ({channelId, handleSend, unreadCount}: {channelId: string, handleSend: ()=>void, unreadCount?: number }) => {

    const userChannels = useSelector((state: RootState) => state.users.userSidebar.userChannels);
    const channelInSidebar = userChannels.find(ch => ch.ch_uuid === channelId);

    const postJoinChannel = usePost()

    const channelInfo  = useFetch<ChannelInfoInterfaceResp>(`${GetEndpointUrl.ChannelBasicInfo}/${channelId}`)



    const joinChannel = async () => {
        await postJoinChannel.makeRequest<ChannelJoinInterface>({apiEndpoint: PostEndpointUrl.JoinChannel, payload: {channel_uuid: channelId}, onSuccess : ()=>{
                channelInfo.mutate()
            }})
    }

    if(channelInfo.isLoading) {
        return <LoadingStateCircle />
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
            return (
                <div className='border-t fixed py-8 bottom-0 flex-col justify-center items-center w-full text-center space-y-2'>
                    <div>Channel is archived 📦</div>
                    {/*{channelInfo.data?.channel_info.ch_is_admin &&*/}
                    {/*    <Button onClick={joinChannel}>*/}
                    {/*    Unarchive channel*/}
                    {/*</Button>}*/}
                </div>
            )
        }

        return (<MobileChannelTextInput channelId={channelId} handleSend={handleSend}/>)
    }
    return (
        <div className='flex flex-col h-full'>
            <CatchMeUpBanner
                channelUUID={channelId}
                unreadCount={unreadCount || 0}
                channelName={channelInSidebar?.ch_name}
            />
            <div style={{height: window.innerHeight-185}}>
                <ChannelMessageList channelId={channelId}/>
            </div>

            <div>

                {renderChatInput()}
            </div>

        </div>
    )
}
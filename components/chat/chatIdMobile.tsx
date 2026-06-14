import {ChatMessageList} from "@/components/chat/chatMessageList";
import {MobileChatTextInput} from "@/components/textInput/mobileChatTextInput";
import CatchMeUpBanner from "@/components/ai/CatchMeUpBanner";
import { useFetchOnlyOnce } from "@/hooks/useFetch";
import { UserProfileInterface } from "@/types/user";
import { GetEndpointUrl } from "@/services/endPoints";
import { ChatSkeleton } from "@/components/ui/AppSkeleton";

export const ChatIdMobile = ({chatId, handleSend, unreadCount}: {chatId: string, handleSend: (latestContent?: string)=>void, unreadCount?: number }) => {
    const otherUserInfo = useFetchOnlyOnce<UserProfileInterface>(chatId ? `${GetEndpointUrl.SelfProfile}/${chatId}` : '');

    if (otherUserInfo.isLoading) return <ChatSkeleton />

    return (
        <div className='flex flex-col h-full'>
            <CatchMeUpBanner
                channelUUID={chatId}
                unreadCount={unreadCount || 0}
                channelName={otherUserInfo.data?.data.user_name}
                isChannel={false}
                type="dm"
            />
            <div className="flex-1 min-h-0">
                <ChatMessageList chatId={chatId} />
            </div>
            <div>
                <MobileChatTextInput chatId={chatId} handleSend={handleSend}/>
            </div>

        </div>
    )
}
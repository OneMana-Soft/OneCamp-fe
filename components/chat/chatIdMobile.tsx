import {ChatMessageList} from "@/components/chat/chatMessageList";
import {MobileChatTextInput} from "@/components/textInput/mobileChatTextInput";
import CatchMeUpBanner from "@/components/ai/CatchMeUpBanner";
import { useSelector } from "react-redux";
import { RootState } from "@/store/store";
import { useFetchOnlyOnce } from "@/hooks/useFetch";
import { UserProfileInterface } from "@/types/user";
import { GetEndpointUrl } from "@/services/endPoints";
import { useMemo } from "react";

export const ChatIdMobile = ({chatId, handleSend, unreadCount}: {chatId: string, handleSend: ()=>void, unreadCount?: number }) => {
    const selfProfile = useFetchOnlyOnce<UserProfileInterface>(GetEndpointUrl.SelfProfile);
    const otherUserInfo = useFetchOnlyOnce<UserProfileInterface>(chatId ? `${GetEndpointUrl.SelfProfile}/${chatId}` : '');
    
    const selfUuid = selfProfile.data?.data.user_uuid;
    
    return (
        <div className='flex flex-col h-full'>
            <CatchMeUpBanner
                channelUUID={chatId}
                unreadCount={unreadCount || 0}
                channelName={otherUserInfo.data?.data.user_name}
                isChannel={false}
                type="dm"
            />
            <div style={{ height: window.innerHeight - 185 }}>
                <ChatMessageList chatId={chatId} />
            </div>
            <div>
                <MobileChatTextInput chatId={chatId} handleSend={handleSend}/>
            </div>

        </div>
    )
}
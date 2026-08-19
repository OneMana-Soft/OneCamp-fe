import {ChatMessageList} from "@/components/chat/chatMessageList";
import {MobileChatTextInput} from "@/components/textInput/mobileChatTextInput";
import { useFetchOnlyOnce } from "@/hooks/useFetch";
import { useDispatch, useSelector } from "react-redux";
import type { RootState } from "@/store/store";
import { UserProfileInterface } from "@/types/user";
import { GetEndpointUrl } from "@/services/endPoints";
import { ChatSkeleton } from "@/components/ui/AppSkeleton";
import { clearChatReplyTarget } from "@/store/slice/chatSlice";
import { ComposerReplyPill } from "@/components/message/composerReplyPill";

export const ChatIdMobile = ({chatId, handleSend}: {chatId: string, handleSend: (latestContent?: string)=>void }) => {
    const dispatch = useDispatch();
    const otherUserInfo = useFetchOnlyOnce<UserProfileInterface>(chatId ? `${GetEndpointUrl.SelfProfile}/${chatId}` : '');
    const replyState = useSelector((state: RootState) => state.chat.chatInputState[chatId]);

    if (otherUserInfo.isLoading) return <ChatSkeleton />

    return (
        <div className='flex flex-col h-full'>
            <div className="flex-1 min-h-0">
                <ChatMessageList chatId={chatId} />
            </div>
            <div>
                {replyState?.replyToUuid && (
                    <div className="px-3">
                        <ComposerReplyPill
                            authorName={replyState.replyToAuthorName}
                            text={replyState.replyToText}
                            onCancel={() => dispatch(clearChatReplyTarget({ chatUUID: chatId }))}
                        />
                    </div>
                )}
                <MobileChatTextInput chatId={chatId} handleSend={handleSend}/>
            </div>

        </div>
    )
}

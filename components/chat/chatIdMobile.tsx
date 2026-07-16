import {ChatMessageList} from "@/components/chat/chatMessageList";
import {MobileChatTextInput} from "@/components/textInput/mobileChatTextInput";
import CatchMeUpBanner from "@/components/ai/CatchMeUpBanner";
import PendingActionsTray from "@/components/ai/PendingActionsTray";
import { useFetch, useFetchOnlyOnce } from "@/hooks/useFetch";
import { useDispatch, useSelector } from "react-redux";
import type { RootState } from "@/store/store";
import { UserProfileInterface } from "@/types/user";
import { GetEndpointUrl } from "@/services/endPoints";
import { ChatSkeleton } from "@/components/ui/AppSkeleton";
import { getGroupingId } from "@/lib/utils/getGroupingId";
import { Sparkles } from "@/lib/icons";
import { clearChatReplyTarget } from "@/store/slice/chatSlice";
import { ComposerReplyPill } from "@/components/message/composerReplyPill";

export const ChatIdMobile = ({chatId, handleSend, unreadCount}: {chatId: string, handleSend: (latestContent?: string)=>void, unreadCount?: number }) => {
    const dispatch = useDispatch();
    const otherUserInfo = useFetchOnlyOnce<UserProfileInterface>(chatId ? `${GetEndpointUrl.SelfProfile}/${chatId}` : '');
    const selfProfile = useFetchOnlyOnce<UserProfileInterface>(GetEndpointUrl.SelfProfile);
    const replyState = useSelector((state: RootState) => state.chat.chatInputState[chatId]);

    // Suggested starter prompts for an empty DM with an AI peer (parity with
    // desktop). Only fetched when the peer is a bot and the conversation +
    // composer are empty, so they never flash over an existing chat.
    const isBotPeer = otherUserInfo.data?.data?.is_bot === true;
    const msgCount = useSelector((state: RootState) => (state.chat.chatMessages[chatId] || []).length);
    const chatBody = useSelector((state: RootState) => state.chat.chatInputState[chatId]?.chatBody);
    const composerEmpty = !chatBody || chatBody.replace(/<[^>]*>/g, "").trim().length === 0;
    const showSuggestions = isBotPeer && msgCount === 0 && composerEmpty;
    const aiSuggestions = useFetch<{ data: string[] }>(
        showSuggestions ? `${GetEndpointUrl.GetDMAISuggestions}?peer=${chatId}` : "",
    );
    const suggestions = (showSuggestions && aiSuggestions.data?.data) || [];

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
                {suggestions.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1.5 px-3 pb-2">
                        <span className="mr-0.5 inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
                            <Sparkles className="h-3 w-3 text-primary" /> Try asking
                        </span>
                        {suggestions.map((s, i) => (
                            <button
                                key={i}
                                type="button"
                                onClick={() => handleSend(`<p>${s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</p>`)}
                                className="rounded-full border border-border/70 bg-background px-3 py-1 text-xs text-foreground transition-colors active:bg-primary/5"
                            >
                                {s}
                            </button>
                        ))}
                    </div>
                )}
                <div className="px-3">
                    <PendingActionsTray surfaceId={getGroupingId(chatId, selfProfile.data?.data.user_uuid || '')} />
                </div>
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

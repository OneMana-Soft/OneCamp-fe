import { useCallback } from "react";
import { ConversationMessages } from "@/components/conversation/ConversationMessages";
import { useDmList } from "@/components/conversation/DmRows";
import { Composer } from "@/components/conversation/Composer";
import { DmComposerExtras } from "@/components/chat/DmComposerExtras";
import CatchMeUpBanner from "@/components/ai/CatchMeUpBanner";
import { useFetchOnlyOnce } from "@/hooks/useFetch";
import { UserProfileInterface } from "@/types/user";
import { GetEndpointUrl } from "@/services/endPoints";
import { ChatSkeleton } from "@/components/ui/AppSkeleton";
import { dmComposerPlaceholder } from "@/lib/utils/composerPlaceholders";
import { displayNameOf } from "@/lib/personName";
import { userDisplayName } from "@/lib/utils/userDisplayName"
import type { ConversationRef } from "@/lib/conversation/types";

export const ChatIdMobile = ({chatId, handleSend}: {chatId: string, handleSend: (latestContent?: string) => boolean | void }) => {
    const list = useDmList(chatId);
    const otherUserInfo = useFetchOnlyOnce<UserProfileInterface>(chatId ? `${GetEndpointUrl.SelfProfile}/${chatId}` : '');
    const peerName = userDisplayName(otherUserInfo.data?.data);
    const isBot = otherUserInfo.data?.data?.is_bot === true;
    const extras = useCallback((send: (html: string) => void, conversation: ConversationRef) => (
        <DmComposerExtras conversation={conversation} send={send} peerName={peerName} isBot={isBot} />
    ), [peerName, isBot]);

    if (otherUserInfo.isLoading) return <ChatSkeleton />

    return (
        <div className='flex flex-col h-full'>
            <CatchMeUpBanner
                channelUUID={chatId}
                channelName={peerName}
                isChannel={false}
                type="dm"
            />
            <div className="flex-1 min-h-0">
                {list && <ConversationMessages list={list} />}
            </div>
            <div>
                <Composer phone handleSend={handleSend} placeholder={dmComposerPlaceholder(displayNameOf(otherUserInfo.data?.data))} above={extras} />
            </div>

        </div>
    )
}

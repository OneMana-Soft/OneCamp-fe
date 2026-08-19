import {GroupChatMessageList} from "@/components/groupChat/groupChatMessageList";
import {MobileGroupChatTextInput} from "@/components/textInput/mobileGroupChatTextInput";
import { useFetchOnlyOnce } from "@/hooks/useFetch";
import { useDispatch, useSelector } from "react-redux";
import type { RootState } from "@/store/store";
import { RawUserDMInterface } from "@/types/user";
import { GetEndpointUrl } from "@/services/endPoints";
import { ChatSkeleton } from "@/components/ui/AppSkeleton";
import { clearGroupChatReplyTarget } from "@/store/slice/groupChatSlice";
import { ComposerReplyPill } from "@/components/message/composerReplyPill";

export const GrpChatIdMobile = ({grpId, handleSend, unreadCount}: {grpId: string, handleSend: (latestContent?: string)=>void, unreadCount?: number }) => {
    const dispatch = useDispatch();
    const dmParticipantsInfo  = useFetchOnlyOnce<RawUserDMInterface>(`${GetEndpointUrl.GetDmGroupParticipants}/${grpId}`)
    const participants = dmParticipantsInfo.data?.data?.dm_participants || []
    const replyState = useSelector((state: RootState) => state.groupChat.chatInputState[grpId]);

    if (dmParticipantsInfo.isLoading) return <ChatSkeleton />

    return (
        <div className='flex flex-col h-full'>
            <div className="flex-1 min-h-0">
                <GroupChatMessageList grpId={grpId} />
            </div>
            <div>
                {replyState?.replyToUuid && (
                    <div className="px-3">
                        <ComposerReplyPill
                            authorName={replyState.replyToAuthorName}
                            text={replyState.replyToText}
                            onCancel={() => dispatch(clearGroupChatReplyTarget({ grpId }))}
                        />
                    </div>
                )}
                <MobileGroupChatTextInput grpId={grpId} handleSend={handleSend}/>
            </div>

        </div>
    )
}
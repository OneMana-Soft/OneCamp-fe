import {GroupChatMessageList} from "@/components/groupChat/groupChatMessageList";
import {MobileGroupChatTextInput} from "@/components/textInput/mobileGroupChatTextInput";
import CatchMeUpBanner from "@/components/ai/CatchMeUpBanner";
import { useFetchOnlyOnce } from "@/hooks/useFetch";
import { RawUserDMInterface } from "@/types/user";
import { GetEndpointUrl } from "@/services/endPoints";

export const GrpChatIdMobile = ({grpId, handleSend, unreadCount}: {grpId: string, handleSend: ()=>void, unreadCount?: number }) => {
    const dmParticipantsInfo  = useFetchOnlyOnce<RawUserDMInterface>(`${GetEndpointUrl.GetDmGroupParticipants}/${grpId}`)
    const participants = dmParticipantsInfo.data?.data.dm_participants || []

    return (
        <div className='flex flex-col h-full'>
            <CatchMeUpBanner
                channelUUID={grpId}
                unreadCount={unreadCount || 0}
                channelName={participants.slice(0, 3).map(u => u.user_name).join(', ') + (participants.length > 3 ? '...' : '')}
                isChannel={false}
                type="group"
            />
            <div style={{ height: window.innerHeight - 185 }}>
                <GroupChatMessageList grpId={grpId} />
            </div>
            <div>
                <MobileGroupChatTextInput grpId={grpId} handleSend={handleSend}/>
            </div>

        </div>
    )
}
import { useMemo } from "react";
import { ConversationMessages } from "@/components/conversation/ConversationMessages";
import { groupList } from "@/components/conversation/GroupRows";
import { Composer } from "@/components/conversation/Composer";
import { GROUP_COMPOSER_PLACEHOLDER } from "@/lib/utils/composerPlaceholders";
import { useFetchOnlyOnce } from "@/hooks/useFetch";
import { RawUserDMInterface } from "@/types/user";
import { GetEndpointUrl } from "@/services/endPoints";
import { ChatSkeleton } from "@/components/ui/AppSkeleton";

export const GrpChatIdMobile = ({grpId, handleSend}: {grpId: string, handleSend: (latestContent?: string) => boolean | void }) => {
    const list = useMemo(() => groupList(grpId), [grpId])
    const dmParticipantsInfo  = useFetchOnlyOnce<RawUserDMInterface>(`${GetEndpointUrl.GetDmGroupParticipants}/${grpId}`)
    const participants = dmParticipantsInfo.data?.data?.dm_participants || []

    if (dmParticipantsInfo.isLoading) return <ChatSkeleton />

    return (
        <div className='flex flex-col h-full'>
            <div className="flex-1 min-h-0">
                <ConversationMessages list={list} />
            </div>
            <div>
                <Composer phone handleSend={handleSend} placeholder={GROUP_COMPOSER_PLACEHOLDER} />
            </div>

        </div>
    )
}
"use client"

import {useFetchOnlyOnce} from "@/hooks/useFetch";
import {GetEndpointUrl} from "@/services/endPoints";
import React from "react";
import {MoreVertical} from "lucide-react";
import {RawUserDMInterface} from "@/types/user";
import {Button} from "@/components/ui/button";

import {GroupedAvatar} from "@/components/groupedAvatar/groupedAvatar";
import {useDispatch, useSelector} from "react-redux";
import {RootState} from "@/store/store";
import {LocallyCreatedGrpInfoInterface} from "@/store/slice/groupChatSlice";
import {openUI} from "@/store/slice/uiSlice";

const EMPTY_GRP_INFO: LocallyCreatedGrpInfoInterface = {} as LocallyCreatedGrpInfoInterface

export function MobileTopNavigationBarSecondGroupChat({grpId}:{grpId: string}) {

    const dispatch = useDispatch()
    const dmParticipantsInfo  = useFetchOnlyOnce<RawUserDMInterface>(`${GetEndpointUrl.GetDmGroupParticipants}/${grpId}`)
    const grpChatCreatedLocally = useSelector((state: RootState) => state.groupChat.locallyCreatedGrpInfo[grpId] || EMPTY_GRP_INFO);

    const participants = grpChatCreatedLocally.participants || dmParticipantsInfo.data?.data?.dm_participants || []

    return (
        <div className='flex justify-center px-2 relative items-center w-full h-full'>
            <div 
                className='font-bold flex justify-center items-center space-x-3 text-lg text-center truncate overflow-auto overflow-ellipsis cursor-pointer max-w-[80%]' 
                onClick={()=>{dispatch(openUI({ key: 'editDmMember', data: {grpId} }))}}
            >
                <GroupedAvatar users={ participants || []} max={2} overlap={15} size={30} className={'text-sm !pr-0'}/>

                <div className="text-ellipsis truncate max-w-40">
                    {participants.map((item, index) => (
                        <span key={index}>
                                {item.user_name}
                            {index < (participants.length || 0) - 1 && ', '}
                            </span>
                    ))}
                </div>
            </div>
        </div>
    );
}
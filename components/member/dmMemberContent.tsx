"use client"
import { useFetch} from "@/hooks/useFetch";
import {GetEndpointUrl, PostEndpointUrl} from "@/services/endPoints";
import {usePost} from "@/hooks/usePost";
import {RawUserDMInterface, UserProfileDataInterface} from "@/types/user";
import AddDmMemberCombobox from "@/components/combobox/addDmMemberCombobox";
import {cn} from "@/lib/utils/helpers/cn";
import {ChatUserListUserAvatar} from "@/components/chat/chatUserListUserAvatar";
import {Badge} from "@/components/ui/badge";
import {DmMemberUpdateInterface} from "@/types/chat";
import {useRouter} from "next/navigation";
import {app_grp_chat_path} from "@/types/paths";
import {useSelector, useDispatch} from "react-redux";
import {RootState} from "@/store/store";
import {LocallyCreatedGrpInfoInterface} from "@/store/slice/groupChatSlice";
import {LoadingStateCircle} from "@/components/loading/loadingStateCircle";
import {openUI} from "@/store/slice/uiSlice";


interface memberContentProp {
    grpId: string
}

interface AddParticipantResponse {
    new_grp_id: string
}

const EMPTY_GRP_INFO: LocallyCreatedGrpInfoInterface = {} as LocallyCreatedGrpInfoInterface

const DmMemberContent: React.FC<memberContentProp> = ({grpId}) => {
    const post = usePost()
    const router = useRouter()
    const dispatch = useDispatch()

    const grpChatCreatedLocally = useSelector((state: RootState) => state.groupChat.locallyCreatedGrpInfo[grpId] || EMPTY_GRP_INFO);

    const dmParticipantsInfo  = useFetch<RawUserDMInterface>(grpId ? `${GetEndpointUrl.GetDmGroupParticipants}/${grpId}` : '')

    // Use API participants first, fall back to locally-created group participants
    const participants = dmParticipantsInfo.data?.data?.dm_participants || grpChatCreatedLocally.participants || []


    const handleAddMember = (id: string, user?: UserProfileDataInterface) => {
        if(!id || post.isSubmitting) return

        if (user) {
            // Optimistic UI update
            dmParticipantsInfo.mutate(
                (currentData) => {
                    if (!currentData || !currentData.data) return currentData;
                    
                    // Check if user already exists to prevent duplicates
                    const exists = currentData.data.dm_participants.some(p => p.user_uuid === id);
                    if (exists) return currentData;

                    return {
                        ...currentData,
                        data: {
                            ...currentData.data,
                            dm_participants: [...currentData.data.dm_participants, user]
                        }
                    };
                },
                { revalidate: false } // Only optimistically update client cache
            );
        }

        post.makeRequest<DmMemberUpdateInterface, AddParticipantResponse>({
            apiEndpoint: PostEndpointUrl.AddDmMember,
            payload:{grp_id: grpId, user_uuid: id},
            showToast: true
        })
            .then((result)=>{
                // Backend returns new_grp_id since adding a participant changes the group ID
                if (result?.new_grp_id) {
                    router.replace(app_grp_chat_path + '/' + result.new_grp_id)
                    // Update the dialog's Redux state so it re-renders with the new grpId
                    dispatch(openUI({ key: 'editDmMember', data: { grpId: result.new_grp_id } }))
                } else {
                    // Fallback: refresh participant list if no new grp_id returned
                    dmParticipantsInfo.mutate()
                }
            })
            .catch(() => {
                // Error toast is already shown by usePost; nothing else needed
            })
    }



    return (
        <div className='h-full flex flex-col gap-y-4 overflow-hidden'>
            <div className="flex-shrink-0">
                <AddDmMemberCombobox handleAddMember={handleAddMember} grpId={grpId}/>
            </div>

            <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar flex flex-col gap-y-3">
                {dmParticipantsInfo.isLoading && participants.length === 0 && <LoadingStateCircle />}
                {
                    participants.map((user) => {
                        return (
                            <div
                                key={user.user_uuid}
                                className={cn(
                                    "flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors",
                                    "bg-card hover:bg-accent border-border"
                                )}
                            >
                                <ChatUserListUserAvatar userProfileObjKey={user.user_profile_object_key} userName={user.user_name} />


                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 mb-1">
                                        <p className="font-medium text-sm text-foreground truncate">{user.user_name}</p>

                                    </div>
                                    <p className="text-xs text-muted-foreground truncate mb-1">{user.user_email_id}</p>
                                    <div className="flex gap-1">
                                        {user.user_job_title && <Badge variant="secondary" className="text-xs">
                                            {user.user_job_title}
                                        </Badge>}
                                    </div>
                                </div>
                            </div>
                        )
                    })
                }
            </div>
        </div>
    )
}

export default DmMemberContent
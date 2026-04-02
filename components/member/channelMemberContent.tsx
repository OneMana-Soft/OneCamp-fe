"use client"
import MembersList from "@/components/member/membersList";
import {useFetch} from "@/hooks/useFetch";
import {ChannelInfoInterfaceResp, ChannelMemberUpdateInterface} from "@/types/channel";
import {GetEndpointUrl, PostEndpointUrl} from "@/services/endPoints";
import {usePost} from "@/hooks/usePost";
import AddChannelMemberCombobox from "@/components/combobox/addChannelMemberCombobox";
import {UserListInterfaceResp} from "@/types/user";
import {openUI} from "@/store/slice/uiSlice";
import {useDispatch} from "react-redux";


interface memberContentProp {
    channelId: string
}

const ChannelMemberContent: React.FC<memberContentProp> = ({channelId}) => {
    const channelInfo = useFetch<ChannelInfoInterfaceResp>(channelId ? GetEndpointUrl.ChannelMemberInfoWithAdminFlagInfo + '/' + channelId : '')
    const post = usePost()

    const dispatch = useDispatch()

    const usersList = useFetch<UserListInterfaceResp>(channelId ? GetEndpointUrl.UserListNotBelongToChannel + '/' + channelId : '')

    const handleMakeAdmin = async (id: string) => {
        if(!id) return

        // Optimistic Update
        if (channelInfo.data) {
            const updatedMembers = channelInfo.data.channel_info.ch_members?.map(m =>
                m.user_uuid === id ? { ...m, user_is_admin: true } : m
            )
            channelInfo.mutate({
                ...channelInfo.data,
                channel_info: {
                    ...channelInfo.data.channel_info,
                    ch_members: updatedMembers
                }
            }, false)
        }

        await post.makeRequest<ChannelMemberUpdateInterface>({apiEndpoint: PostEndpointUrl.AddChannelModerator, payload:{channel_id: channelId, user_id: id}})
        // No need to mutate here, optimistic update already happened
    }

    const handleRemoveAdmin = (id: string) => {
        if(!id) return

        // Optimistic Update
        if (channelInfo.data) {
            const updatedMembers = channelInfo.data.channel_info.ch_members?.map(m =>
                m.user_uuid === id ? { ...m, user_is_admin: false } : m
            )
            channelInfo.mutate({
                ...channelInfo.data,
                channel_info: {
                    ...channelInfo.data.channel_info,
                    ch_members: updatedMembers
                }
            }, false)
        }

        post.makeRequest<ChannelMemberUpdateInterface>({apiEndpoint: PostEndpointUrl.RemoveChannelModerator, payload:{channel_id: channelId, user_id: id}})
            .then(()=>{
                // No need to mutate here, optimistic update already happened
            })
            .catch(() => {
                channelInfo.mutate() // Rollback on error
            })

    }

    const handleAddMember = (id: string) => {
        if(!id) return

        // Optimistic Update
        const userToAdd = usersList.data?.users.find(u => u.user_uuid === id)
        if (userToAdd && channelInfo.data) {
            // Update channelInfo members list
            const updatedChannelMembers = [...(channelInfo.data.channel_info.ch_members || []), { ...userToAdd, user_is_admin: false }]
            channelInfo.mutate({
                ...channelInfo.data,
                channel_info: {
                    ...channelInfo.data.channel_info,
                    ch_members: updatedChannelMembers
                }
            }, false)

            // Update usersList (remove the added user)
            if (usersList.data) {
                usersList.mutate({
                    ...usersList.data,
                    users: usersList.data.users.filter(u => u.user_uuid !== id)
                }, false)
            }
        }

        post.makeRequest<ChannelMemberUpdateInterface>({apiEndpoint: PostEndpointUrl.AddChannelMember, payload:{channel_id: channelId, user_id: id}})
            .then(()=>{
                // No need to mutate here, optimistic update already happened
            })
            .catch(() => {
                channelInfo.mutate()
                usersList.mutate()
            })
    }

    const handleRemoveMember =  (id: string) => {
        if(!id ) return

        setTimeout(() => {
            dispatch(openUI({
                key: 'confirmAlert',
                data: {
                    title: "Remove channel member",
                    description: "Are you sure you want to proceed remove channel member",
                    confirmText: "Remove member",
                    onConfirm: ()=>{executeRemoveMember(id)}
                }
            }));
        }, 500);

    }

    const executeRemoveMember = (id: string) => {
        // Optimistic Update
        const userToRemove = channelInfo.data?.channel_info.ch_members?.find(u => u.user_uuid === id)
        if (userToRemove && channelInfo.data) {
            // Update channelInfo members list
            channelInfo.mutate({
                ...channelInfo.data,
                channel_info: {
                    ...channelInfo.data.channel_info,
                    ch_members: channelInfo.data.channel_info.ch_members?.filter(u => u.user_uuid !== id)
                }
            }, false)

            // Update usersList (add the user back to the search list)
            if (usersList.data) {
                usersList.mutate({
                    ...usersList.data,
                    users: [userToRemove, ...usersList.data.users]
                }, false)
            }
        }

        post.makeRequest<ChannelMemberUpdateInterface>(
            {
                apiEndpoint: PostEndpointUrl.RemoveChannelMember,
                payload:{
                    channel_id: channelId,
                    user_id: id
                }
            }

        ).then(()=>{
            // No need to mutate here, optimistic update already happened
        })
        .catch(() => {
            channelInfo.mutate()
            usersList.mutate()
        })


    }



    return (
        <div className='flex-1 min-h-0 flex flex-col gap-y-6 w-full'>
            {(channelInfo.data?.channel_info.ch_is_admin || (channelInfo.data?.channel_info.ch_is_member && !channelInfo.data?.channel_info.ch_private)) && (
                <div className="flex-shrink-0">
                    <AddChannelMemberCombobox handleAddMember={handleAddMember} channelId={channelId} />
                </div>
            )}
            <div className="flex-1 min-h-0 flex flex-col">
                <MembersList
                    isAdmin={channelInfo.data?.channel_info.ch_is_admin || false}
                    usersList={channelInfo.data?.channel_info.ch_members || []}
                    isLoading={channelInfo.isLoading}
                    handleMakeAdmin={handleMakeAdmin}
                    handleRemoveAdmin={handleRemoveAdmin}
                    handleRemoveMember={handleRemoveMember}
                    blockExitForUUID={channelInfo.data?.channel_info.ch_created_by.user_uuid}
                />
            </div>
        </div>
    )
}

export default ChannelMemberContent
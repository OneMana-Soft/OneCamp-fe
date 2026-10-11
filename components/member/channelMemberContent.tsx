"use client"
import {useFetch} from "@/hooks/useFetch";
import {ChannelInfoInterfaceResp, ChannelMemberUpdateInterface} from "@/types/channel";
import {GetEndpointUrl, PostEndpointUrl} from "@/services/endPoints";
import {usePost} from "@/hooks/usePost";
import {UserListInterfaceResp} from "@/types/user";
import {openUI} from "@/store/slice/uiSlice";
import {useDispatch} from "react-redux";


/**
 * A channel's members and what can be done to them (make or remove an admin,
 * add, remove), optimistic, with the lists they read. Read by the channel's
 * Details sheet (components/channel/details).
 */
export function useChannelMembers(channelId: string) {
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
                    title: "Remove this member from the channel?",
                    description: "They lose access to the channel and its messages. You can add them back later.",
                    confirmText: "Remove member",
                    destructive: true,
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

    return { channelInfo, usersList, handleMakeAdmin, handleRemoveAdmin, handleAddMember, handleRemoveMember }
}

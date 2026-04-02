"use client"
import MembersList from "@/components/member/membersList";
import {useFetch, useFetchOnlyOnce} from "@/hooks/useFetch";
import {ChannelInfoInterfaceResp, ChannelMemberUpdateInterface} from "@/types/channel";
import {GetEndpointUrl, PostEndpointUrl} from "@/services/endPoints";
import {usePost} from "@/hooks/usePost";
import AddChannelMemberCombobox from "@/components/combobox/addChannelMemberCombobox";
import {UserListInterfaceResp, type UserProfileInterface} from "@/types/user";
import {openUI} from "@/store/slice/uiSlice";
import {useDispatch} from "react-redux";
import {ProjectInfoRawInterface, ProjectMemberAddOrRemoveInterface} from "@/types/project";
import AddProjectMemberCombobox from "@/components/combobox/addProjectMemberCombobox";
import {TeamInfoRawInterface, TeamMemberAddOrRemoveInterface} from "@/types/team";
import AddTeamMemberCombobox from "@/components/combobox/addTeamMemberCombobox";


interface memberContentProp {
    teamId: string
}

export const TeamMemberContent: React.FC<memberContentProp> = ({teamId}) => {
    const teamInfo = useFetch<TeamInfoRawInterface>(teamId ? GetEndpointUrl.GetTeamMemberInfo + '/' + teamId : '')
    const post = usePost()

    const dispatch = useDispatch()

    const usersList = useFetch<UserListInterfaceResp>(teamId ? GetEndpointUrl.UsersListWhoDontBelongToTheTeam + '/' + teamId : '')
    const selfProfile = useFetchOnlyOnce<UserProfileInterface>(GetEndpointUrl.SelfProfile)

    const handleMakeAdmin = (id: string) => {
        if(!id) return

        // Optimistic Update
        if (teamInfo.data) {
            const updatedMembers = teamInfo.data.data.team_members?.map(m =>
                m.user_uuid === id ? { ...m, user_is_admin: true } : m
            )
            teamInfo.mutate({
                ...teamInfo.data,
                data: {
                    ...teamInfo.data.data,
                    team_members: updatedMembers
                }
            }, false)
        }

        post.makeRequest<TeamMemberAddOrRemoveInterface>({apiEndpoint: PostEndpointUrl.AddTeamAdminRole, payload:{
            team_uuid: teamId,
            member_uuid: id
        }}).then(()=>{
            // No need to mutate here, optimistic update already happened
        }).catch(() => {
            teamInfo.mutate() // Rollback on error
        })
    }

    const handleRemoveAdmin = (id: string) => {
        if(!id) return

        // Optimistic Update
        if (teamInfo.data) {
            const updatedMembers = teamInfo.data.data.team_members?.map(m =>
                m.user_uuid === id ? { ...m, user_is_admin: false } : m
            )
            teamInfo.mutate({
                ...teamInfo.data,
                data: {
                    ...teamInfo.data.data,
                    team_members: updatedMembers
                }
            }, false)
        }

        post.makeRequest<TeamMemberAddOrRemoveInterface>({
            apiEndpoint: PostEndpointUrl.RemoveTeamModerator,
            payload:{
                team_uuid: teamId,
                member_uuid: id}})
            .then(()=>{
                // No need to mutate here, optimistic update already happened
            })
            .catch(() => {
                teamInfo.mutate() // Rollback on error
            })

    }

    const handleAddMember = (id: string) => {
        if(!id) return

        // Optimistic Update
        const userToAdd = usersList.data?.users.find(u => u.user_uuid === id)
        if (userToAdd && teamInfo.data) {
            // Update teamInfo members list
            const updatedTeamMembers = [...(teamInfo.data.data.team_members || []), { ...userToAdd, user_is_admin: false }]
            teamInfo.mutate({
                ...teamInfo.data,
                data: {
                    ...teamInfo.data.data,
                    team_members: updatedTeamMembers
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

        post.makeRequest<TeamMemberAddOrRemoveInterface>({apiEndpoint: PostEndpointUrl.AddTeamMember, payload:{team_uuid: teamId, member_uuid: id}})
            .then(()=>{
                // No need to mutate here, optimistic update already happened
            })
            .catch(() => {
                teamInfo.mutate()
                usersList.mutate()
            })
    }

    const handleRemoveMember =  (id: string) => {
        if(!id ) return

        setTimeout(() => {
            dispatch(openUI({
                key: 'confirmAlert',
                data: {
                    title: "Remove team member",
                    description: "Are you sure you want to proceed remove team member",
                    confirmText: "Remove member",
                    onConfirm: ()=>{executeRemoveMember(id)}
                }
            }));
        }, 500);

    }

    const executeRemoveMember = (id: string) => {
        // Optimistic Update
        const userToRemove = teamInfo.data?.data.team_members?.find(u => u.user_uuid === id)
        if (userToRemove && teamInfo.data) {
            // Update teamInfo members list
            teamInfo.mutate({
                ...teamInfo.data,
                data: {
                    ...teamInfo.data.data,
                    team_members: teamInfo.data.data.team_members?.filter(u => u.user_uuid !== id)
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

        post.makeRequest<TeamMemberAddOrRemoveInterface>(
            {
                apiEndpoint: PostEndpointUrl.RemoveTeamMember,
                payload:{
                    team_uuid: teamId,
                    member_uuid: id
                }
            }

        ).then(()=>{
            // No need to mutate here, optimistic update already happened
        })
        .catch(() => {
            teamInfo.mutate()
            usersList.mutate()
        })


    }


    return (
        <div className='flex-1 min-h-0 flex flex-col gap-y-4 w-full'>
            {(teamInfo.data?.data.team_is_admin || (teamInfo.data?.data.team_is_member )) && (
                <div className="flex-shrink-0">
                    <AddTeamMemberCombobox handleAddMember={handleAddMember} teamId={teamId}/>
                </div>
            )}
            <div className="flex-1 min-h-0 flex flex-col">
                <MembersList 
                    isAdmin={teamInfo.data?.data.team_is_admin || false} 
                    usersList={teamInfo.data?.data.team_members || []}
                    isLoading={teamInfo.isLoading}
                    handleMakeAdmin={handleMakeAdmin} 
                    handleRemoveAdmin={handleRemoveAdmin}
                    handleRemoveMember={handleRemoveMember} 
                    blockExitForUUID={selfProfile.data?.data.user_uuid}
                />
            </div>
        </div>
    )
}


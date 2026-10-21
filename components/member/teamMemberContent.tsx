"use client"
import MembersList from "@/components/member/membersList";
import {useFetch, useFetchOnlyOnce} from "@/hooks/useFetch";
import { GetEndpointUrl, PostEndpointUrl } from "@/services/endPoints";
import { PeopleGet } from "@/services/endpoints/people";
import {usePost} from "@/hooks/usePost";
import {UserListInterfaceResp, type UserProfileInterface} from "@/types/user";
import {openUI} from "@/store/slice/uiSlice";
import {useDispatch} from "react-redux";
import {TeamInfoRawInterface, TeamMemberAddOrRemoveInterface} from "@/types/team";
import AddTeamMemberCombobox from "@/components/combobox/addTeamMemberCombobox";
import {useState} from "react";
import {Button} from "@/components/ui/button";
import {useToast} from "@/hooks/use-toast";
import axiosInstance, {OWN_ERRORS} from "@/lib/axiosInstance";
import {apiErrorMessage} from "@/lib/utils/apiError";


interface memberContentProp {
    teamId: string
}

export const TeamMemberContent: React.FC<memberContentProp> = ({teamId}) => {
    const teamInfo = useFetch<TeamInfoRawInterface>(teamId ? PeopleGet.GetTeamMemberInfo + '/' + teamId : '')
    const post = usePost()

    const dispatch = useDispatch()

    const selfProfile = useFetchOnlyOnce<UserProfileInterface>(GetEndpointUrl.SelfProfile)
    // A team's admins and workspace admins may add people (the server's rule),
    // so only they ask who could be added: for anyone else the server refuses,
    // and the refusal used to show as an error just for opening the team.
    const canAdd = Boolean(teamInfo.data?.data.team_is_admin || selfProfile.data?.data.user_is_admin)
    const usersList = useFetch<UserListInterfaceResp>(teamId && canAdd ? PeopleGet.UsersListWhoDontBelongToTheTeam + '/' + teamId : '')

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
                    title: "Remove this member from the team?",
                    description: "They leave the team. You can add them back later.",
                    confirmText: "Remove member",
                    destructive: true,
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


    // A workspace admin reaches a team's stewardship (its people, and its
    // projects' people and archiving) by becoming one of its admins: one
    // step, recorded in the audit log (Work Access, D5).
    const {toast} = useToast()
    const [stewarding, setStewarding] = useState(false)
    const workspaceAdminOnly = Boolean(selfProfile.data?.data.user_is_admin && teamInfo.data && !teamInfo.data.data.team_is_admin)
    const makeMeAdmin = () => {
        dispatch(openUI({
            key: 'confirmAlert',
            data: {
                title: "Make yourself an admin of this team?",
                description: "You'll manage its people, and the people of its projects. It's recorded in the audit log.",
                confirmText: "Make me an admin",
                onConfirm: async () => {
                    setStewarding(true)
                    try {
                        await axiosInstance.post(`/admin/teams/${teamId}/admins/me`, undefined, OWN_ERRORS)
                        void teamInfo.mutate()
                    } catch (err) {
                        toast({title: apiErrorMessage(err, "Couldn't make you one of its admins."), variant: "destructive"})
                    } finally {
                        setStewarding(false)
                    }
                },
            },
        }))
    }

    return (
        <div className='flex-1 min-h-0 flex flex-col gap-y-4 w-full'>
            {workspaceAdminOnly && (
                <div data-team-steward="" className="flex flex-shrink-0 items-center justify-between gap-3 rounded-lg bg-sunken px-3 py-2.5">
                    <p className="min-w-0 text-ui-sm text-ink-2">You run the workspace, but not this team.</p>
                    <Button size="sm" variant="secondary" className="shrink-0" onClick={makeMeAdmin} disabled={stewarding}>
                        Make me an admin
                    </Button>
                </div>
            )}
            {canAdd && (
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


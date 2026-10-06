"use client"
import MembersList from "@/components/member/membersList";
import {useFetch} from "@/hooks/useFetch";
import {GetEndpointUrl, PostEndpointUrl} from "@/services/endPoints";
import {usePost} from "@/hooks/usePost";
import {UserListInterfaceResp} from "@/types/user";
import {openUI} from "@/store/slice/uiSlice";
import {useDispatch} from "react-redux";
import {ProjectInfoRawInterface, ProjectMemberAddOrRemoveInterface} from "@/types/project";
import AddProjectMemberCombobox from "@/components/combobox/addProjectMemberCombobox";


interface memberContentProp {
    projectId: string
}

export const ProjectMemberContent: React.FC<memberContentProp> = ({projectId}) => {
    const projectInfo = useFetch<ProjectInfoRawInterface>(projectId ? GetEndpointUrl.GetProjectMembers + '/' + projectId : '')
    const post = usePost()

    const dispatch = useDispatch()

    // Project and team admins may add people (the server's rule); only they
    // ask who could be added, so nobody else meets a refusal for looking.
    const canAdd = Boolean(projectInfo.data?.data.project_is_admin || projectInfo.data?.data.project_team?.team_is_admin)
    const usersList = useFetch<UserListInterfaceResp>(projectId && canAdd ? GetEndpointUrl.UserListNotBelongToProjectButBelongsToTeam + '/' + projectId : '')

    const handleMakeAdmin = (id: string) => {
        if(!id) return

        // Optimistic Update
        if (projectInfo.data) {
            const updatedMembers = projectInfo.data.data.project_members?.map(m =>
                m.user_uuid === id ? { ...m, user_is_admin: true } : m
            )
            projectInfo.mutate({
                ...projectInfo.data,
                data: {
                    ...projectInfo.data.data,
                    project_members: updatedMembers
                }
            }, false)
        }

        post.makeRequest<ProjectMemberAddOrRemoveInterface>({apiEndpoint: PostEndpointUrl.AddProjectModerator, payload:{
            project_uuid: projectId,
                user_uuid: id
        }}).then(()=>{
            // No need to mutate here, optimistic update already happened
        }).catch(() => {
            projectInfo.mutate() // Rollback on error
        })
    }

    const handleRemoveAdmin = (id: string) => {
        if(!id) return

        // Optimistic Update
        if (projectInfo.data) {
            const updatedMembers = projectInfo.data.data.project_members?.map(m =>
                m.user_uuid === id ? { ...m, user_is_admin: false } : m
            )
            projectInfo.mutate({
                ...projectInfo.data,
                data: {
                    ...projectInfo.data.data,
                    project_members: updatedMembers
                }
            }, false)
        }

        post.makeRequest<ProjectMemberAddOrRemoveInterface>({
            apiEndpoint: PostEndpointUrl.RemoveProjectModerator,
            payload:{
                project_uuid: projectId,
                user_uuid: id}})
            .then(()=>{
                // No need to mutate here, optimistic update already happened
            })
            .catch(() => {
                projectInfo.mutate() // Rollback on error
            })

    }

    const handleAddMember = (id: string) => {
        if(!id) return

        // Optimistic Update
        const userToAdd = usersList.data?.users.find(u => u.user_uuid === id)
        if (userToAdd && projectInfo.data) {
            // Update projectInfo members list
            const updatedProjectMembers = [...(projectInfo.data.data.project_members || []), { ...userToAdd, user_is_admin: false }]
            projectInfo.mutate({
                ...projectInfo.data,
                data: {
                    ...projectInfo.data.data,
                    project_members: updatedProjectMembers
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

        post.makeRequest<ProjectMemberAddOrRemoveInterface>({apiEndpoint: PostEndpointUrl.AddProjectMember, payload:{project_uuid: projectId, user_uuid: id}})
            .then(()=>{
                // No need to mutate here, optimistic update already happened
            })
            .catch(() => {
                projectInfo.mutate()
                usersList.mutate()
            })
    }

    const handleRemoveMember =  (id: string) => {
        if(!id ) return

        setTimeout(() => {
            dispatch(openUI({
                key: 'confirmAlert',
                data: {
                    title: "Remove project member",
                    description: "Are you sure you want to proceed remove project member",
                    confirmText: "Remove member",
                    onConfirm: ()=>{executeRemoveMember(id)}
                }
            }));
        }, 500);

    }

    const executeRemoveMember = (id: string) => {
        // Optimistic Update
        const userToRemove = projectInfo.data?.data.project_members?.find(u => u.user_uuid === id)
        if (userToRemove && projectInfo.data) {
            // Update projectInfo members list
            projectInfo.mutate({
                ...projectInfo.data,
                data: {
                    ...projectInfo.data.data,
                    project_members: projectInfo.data.data.project_members?.filter(u => u.user_uuid !== id)
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

        post.makeRequest<ProjectMemberAddOrRemoveInterface>(
            {
                apiEndpoint: PostEndpointUrl.RemoveProjectMember,
                payload:{
                    project_uuid: projectId,
                    user_uuid: id
                }
            }

        ).then(()=>{
            // No need to mutate here, optimistic update already happened
        })
        .catch(() => {
            projectInfo.mutate()
            usersList.mutate()
        })


    }



    return (
        <div className='h-full flex flex-col gap-y-6'>
            {canAdd && <AddProjectMemberCombobox handleAddMember={handleAddMember} projectId={projectId}/>}
            <MembersList isAdmin={projectInfo.data?.data.project_is_admin || projectInfo.data?.data.project_team.team_is_admin || false} usersList={projectInfo.data?.data.project_members || []}
                        handleMakeAdmin={handleMakeAdmin} handleRemoveAdmin={handleRemoveAdmin}
                        handleRemoveMember={handleRemoveMember} blockExitForUUID={projectInfo.data?.data.project_created_by.user_uuid}/>

        </div>
    )
}


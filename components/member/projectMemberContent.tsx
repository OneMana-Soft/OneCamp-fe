"use client"
import MembersList from "@/components/member/membersList";
import {useFetch} from "@/hooks/useFetch";
import { GetEndpointUrl, PostEndpointUrl } from "@/services/endPoints";
import { ProjectsGet } from "@/services/endpoints/projects";
import {usePost} from "@/hooks/usePost";
import {UserListInterfaceResp} from "@/types/user";
import {openUI} from "@/store/slice/uiSlice";
import {useDispatch} from "react-redux";
import {ProjectInfoRawInterface, ProjectMemberAddOrRemoveInterface} from "@/types/project";
import AddProjectMemberCombobox from "@/components/combobox/addProjectMemberCombobox";
import {useState} from "react";
import {ProjectRolePicker} from "@/components/member/ProjectRolePicker";
import {useToast} from "@/hooks/use-toast";
import {apiErrorMessage} from "@/lib/utils/apiError";
import {accessOf} from "@/lib/work/access";
import type {Role} from "@/lib/work/types";
import {setMemberRole} from "@/services/workAccessService";


interface memberContentProp {
    projectId: string
}

export const ProjectMemberContent: React.FC<memberContentProp> = ({projectId}) => {
    const projectInfo = useFetch<ProjectInfoRawInterface>(projectId ? GetEndpointUrl.GetProjectMembers + '/' + projectId : '')
    const post = usePost()

    const dispatch = useDispatch()

    // Project and team admins manage its people (the server's rule, in
    // project_access); only they ask who could be added, so nobody else meets
    // a refusal for looking.
    const access = accessOf(projectInfo.data?.data)
    const canAdd = access.manage_people
    const {toast} = useToast()
    const [changing, setChanging] = useState("")

    // A role shows at once and goes back, with the server's words, if refused.
    const changeRole = async (id: string, role: Role) => {
        if (!projectInfo.data) return
        const before = projectInfo.data
        setChanging(id)
        void projectInfo.mutate({
            ...before,
            data: {
                ...before.data,
                project_members: before.data.project_members?.map((m) =>
                    m.user_uuid === id ? {...m, user_project_role: role, user_is_admin: role === "admin"} : m),
            },
        }, false)
        try {
            await setMemberRole(projectId, id, role)
        } catch (err) {
            void projectInfo.mutate(before, false)
            toast({title: apiErrorMessage(err, "Couldn't change their role."), variant: "destructive"})
        } finally {
            setChanging("")
        }
    }
    const usersList = useFetch<UserListInterfaceResp>(projectId && canAdd ? ProjectsGet.UserListNotBelongToProjectButBelongsToTeam + '/' + projectId : '')

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
                    title: "Remove this member from the project?",
                    description: "They lose access to the project and its tasks. You can add them back later.",
                    confirmText: "Remove member",
                    destructive: true,
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
            <MembersList isAdmin={access.manage_people} usersList={projectInfo.data?.data.project_members || []}
                        handleMakeAdmin={handleMakeAdmin} handleRemoveAdmin={handleRemoveAdmin}
                        handleRemoveMember={handleRemoveMember} blockExitForUUID={projectInfo.data?.data.project_created_by?.user_uuid}
                        renderRole={(user, isCreator) => (
                            <ProjectRolePicker member={user} canChange={access.manage_people} isCreator={isCreator}
                                busy={changing === user.user_uuid} onChoose={(role) => void changeRole(user.user_uuid, role)}/>
                        )}/>

        </div>
    )
}


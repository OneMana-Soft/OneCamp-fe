"use client"

import * as React from "react"
import { RotateCcw, Trash, Users } from "@/lib/icons"
import {
    Drawer,
    DrawerContent,
    DrawerDescription,
    DrawerHeader,
    DrawerTitle,
} from "@/components/ui/drawer"
import { useFetch } from "@/hooks/useFetch"
import { GetEndpointUrl, PostEndpointUrl } from "@/services/endPoints"
import { ProjectAddOrRemoveInterface } from "@/types/project"
import { usePost } from "@/hooks/usePost"
import { openUI } from "@/store/slice/uiSlice"
import { useDispatch } from "react-redux"
import { TeamInfoRawInterface } from "@/types/team"
import { DrawerItem } from "@/components/drawers/drawerItem"

interface ProjectLongPressDrawerProps {
    drawerOpenState: boolean
    setOpenState: (state: boolean) => void
    isAdmin: boolean
    isMember: boolean
    isDeleted: boolean
    projectId: string
    teamId: string
}

export function ProjectLongPressDrawer({
    drawerOpenState,
    setOpenState,
    isMember,
    isAdmin,
    isDeleted,
    projectId,
    teamId,
}: ProjectLongPressDrawerProps) {
    const teamProjectList = useFetch<TeamInfoRawInterface>(
        teamId ? GetEndpointUrl.GetTeamProjectList + "/" + teamId : "",
    )

    const dispatch = useDispatch()
    const post = usePost()

    const execDelete = () => {
        post.makeRequest<ProjectAddOrRemoveInterface>({
            apiEndpoint: PostEndpointUrl.DeleteProject,
            payload: { project_uuid: projectId },
        }).then(() => {
            teamProjectList.mutate()
        })
    }

    const handleDelete = () => {
        setTimeout(() => {
            dispatch(
                openUI({
                    key: "confirmAlert",
                    data: {
                        title: "Archive project",
                        description:
                            "Are you sure you want to archive this project? Members will lose access until it is restored.",
                        confirmText: "Archive project",
                        onConfirm: () => {
                            execDelete()
                        },
                    },
                }),
            )
        }, 500)
    }

    const execUndelete = () => {
        post.makeRequest<ProjectAddOrRemoveInterface>({
            apiEndpoint: PostEndpointUrl.UndeleteProject,
            payload: { project_uuid: projectId },
        }).then(() => {
            teamProjectList.mutate()
        })
    }

    const handleUnDelete = async () => {
        if (!projectId) return
        setTimeout(() => {
            dispatch(
                openUI({
                    key: "confirmAlert",
                    data: {
                        title: "Unarchive project",
                        description: "Are you sure you want to unarchive this project?",
                        confirmText: "Unarchive project",
                        onConfirm: () => {
                            execUndelete()
                        },
                    },
                }),
            )
        }, 500)
    }

    const handleProjectMembers = () => {
        closeDrawer()
        dispatch(openUI({ key: "editProjectMember", data: { projectUUID: projectId } }))
    }

    const closeDrawer = () => setOpenState(false)

    const handleArchiveAction = () => {
        if (isDeleted) handleUnDelete()
        else handleDelete()
    }

    if (!projectId) return null

    return (
        <Drawer onOpenChange={closeDrawer} open={drawerOpenState}>
            <DrawerContent>
                <DrawerHeader className="sr-only">
                    <DrawerTitle>Project actions</DrawerTitle>
                    <DrawerDescription>Quick actions for this project.</DrawerDescription>
                </DrawerHeader>
                <div className="p-3 pb-6 space-y-0.5">
                    {(isAdmin || isMember) && (
                        <DrawerItem
                            icon={Users}
                            label="Project members"
                            onClick={handleProjectMembers}
                        />
                    )}
                    {isAdmin && (
                        <DrawerItem
                            icon={isDeleted ? RotateCcw : Trash}
                            label={isDeleted ? "Unarchive project" : "Archive project"}
                            onClick={handleArchiveAction}
                            destructive={!isDeleted}
                        />
                    )}
                </div>
            </DrawerContent>
        </Drawer>
    )
}

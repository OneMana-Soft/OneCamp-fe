"use client"

import { RotateCcw, Trash, Users } from "@/lib/icons"
import {
    Drawer,
    SheetCancel,
    SheetGroup,
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
        <Drawer detent="menu" onOpenChange={closeDrawer} open={drawerOpenState}>
            <DrawerContent>
                <DrawerHeader className="sr-only">
                    <DrawerTitle>Project actions</DrawerTitle>
                    <DrawerDescription>Quick actions for this project.</DrawerDescription>
                </DrawerHeader>
                <div className="pb-2">
                    <SheetGroup label="Project">
                    {(isAdmin || isMember) && (
                        <DrawerItem
                            icon={Users}
                            label="Project members"
                            onClick={handleProjectMembers}
                        />
                    )}
                    {isAdmin && isDeleted && (
                        <DrawerItem
                            icon={RotateCcw}
                            label="Unarchive project"
                            onClick={handleArchiveAction}
                        />
                    )}
                </SheetGroup>
                    {/* What destroys is alone, and last (design v3, mobile C7). */}
                    {isAdmin && !isDeleted && (
                        <SheetGroup label="Archive">
                            <DrawerItem
                                icon={Trash}
                                label="Archive project"
                                onClick={handleArchiveAction}
                                destructive
                            />
                        </SheetGroup>
                    )}
                    <SheetCancel />
                </div>
            </DrawerContent>
        </Drawer>
    )
}

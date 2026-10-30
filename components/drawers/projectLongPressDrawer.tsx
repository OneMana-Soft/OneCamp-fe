"use client"

import { RotateCcw, Trash, Users } from "@/lib/icons"
import {
    Drawer,
    DrawerContent,
    DrawerDescription,
    DrawerHeader,
    DrawerTitle,
} from "@/components/ui/drawer"
import { SheetCancel, SheetGroup } from "@/components/ui/sheet-menu"
import { useFetch } from "@/hooks/useFetch"
import { GetEndpointUrl } from "@/services/endPoints"
import { openUI } from "@/store/slice/uiSlice"
import { useDispatch } from "react-redux"
import { useArchiveProject } from "@/hooks/useArchiveProject"
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

    // One question, then the server (hooks/useArchiveProject).
    const { archive, restore } = useArchiveProject()
    const name = teamProjectList.data?.data.team_projects?.find((p) => p.project_uuid === projectId)?.project_name
    const done = () => void teamProjectList.mutate()

    const handleProjectMembers = () => {
        closeDrawer()
        dispatch(openUI({ key: "editProjectMember", data: { projectUUID: projectId } }))
    }

    const closeDrawer = () => setOpenState(false)

    const handleArchiveAction = () => {
        closeDrawer()
        if (!projectId) return
        // The question opens once the sheet has gone, so the two never hold
        // the page's focus at once (as it always waited here).
        setTimeout(() => (isDeleted ? restore(projectId, { name, done }) : archive(projectId, { name, done })), 500)
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
                            label="Restore project"
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

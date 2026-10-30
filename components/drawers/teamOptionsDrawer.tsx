"use client"

import { Pencil, Users } from "@/lib/icons"
import {
    Drawer,
    DrawerContent,
    DrawerDescription,
    DrawerHeader,
    DrawerTitle,
} from "@/components/ui/drawer"
import { SheetCancel, SheetGroup } from "@/components/ui/sheet-menu"
import { useFetch, useFetchOnlyOnce } from "@/hooks/useFetch"
import type { UserProfileInterface } from "@/types/user"
import { GetEndpointUrl } from "@/services/endPoints"
import { openUI } from "@/store/slice/uiSlice"
import { useDispatch } from "react-redux"
import { TeamInfoRawInterface } from "@/types/team"
import { DrawerItem } from "@/components/drawers/drawerItem"
import { WorkspaceName } from "@/hooks/useWorkspaceName"

interface TeamOptionsDrawerProps {
    drawerOpenState: boolean
    setOpenState: (state: boolean) => void
    teamName: string
    teamId: string
}

export function TeamOptionsDrawer({
    drawerOpenState,
    setOpenState,
    teamId,
    teamName,
}: TeamOptionsDrawerProps) {
    const dispatch = useDispatch()
    const selfProfile = useFetchOnlyOnce<UserProfileInterface>(GetEndpointUrl.SelfProfile)
    const teamInfo = useFetch<TeamInfoRawInterface>(
        teamId ? GetEndpointUrl.GetTeamInfo + "/" + teamId : "",
    )

    const closeDrawer = () => setOpenState(false)

    const clickEditTeamMember = () => {
        closeDrawer()
        dispatch(
            openUI({
                key: "teamMembers",
                data: { teamUUID: teamId, teamName },
            }),
        )
    }

    const editTeamName = () => {
        closeDrawer()
        dispatch(openUI({ key: "editTeamName", data: { teamUUID: teamId || "" } }))
    }

    const canEdit =
        selfProfile.data?.data.user_is_admin || teamInfo.data?.data.team_is_admin

    return (
        <Drawer detent="menu" onOpenChange={closeDrawer} open={drawerOpenState}>
            <DrawerContent>
                <DrawerHeader className="sr-only">
                    <DrawerTitle>
                        <WorkspaceName />
                    </DrawerTitle>
                    <DrawerDescription>Team options</DrawerDescription>
                </DrawerHeader>
                <div className="pb-2">
                    <SheetGroup label="Team">
                    <DrawerItem
                        icon={Users}
                        label="Team members"
                        onClick={clickEditTeamMember}
                    />
                    {canEdit && (
                        <DrawerItem
                            icon={Pencil}
                            label="Edit team name"
                            onClick={editTeamName}
                        />
                    )}
                </SheetGroup>
                    <SheetCancel />
                </div>
            </DrawerContent>
        </Drawer>
    )
}

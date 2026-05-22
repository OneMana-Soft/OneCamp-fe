"use client"

import * as React from "react"
import { Shield, Users } from "@/lib/icons"
import { ClipboardList } from "lucide-react"
import {
    Drawer,
    DrawerContent,
    DrawerDescription,
    DrawerHeader,
    DrawerTitle,
} from "@/components/ui/drawer"
import { app_admin, app_project_path, app_team_path } from "@/types/paths"
import { useRouter } from "next/navigation"
import { useFetchOnlyOnce } from "@/hooks/useFetch"
import type { UserProfileInterface } from "@/types/user"
import { GetEndpointUrl } from "@/services/endPoints"
import { DrawerItem } from "@/components/drawers/drawerItem"

interface OrgDrawerProps {
    drawerOpenState: boolean
    setOpenState: (state: boolean) => void
}

export function OrgDrawer({ drawerOpenState, setOpenState }: OrgDrawerProps) {
    const router = useRouter()
    const selfProfile = useFetchOnlyOnce<UserProfileInterface>(GetEndpointUrl.SelfProfile)

    const closeDrawer = () => setOpenState(false)

    const handleNavigate = (path: string) => {
        closeDrawer()
        router.push(path)
    }

    return (
        <Drawer onOpenChange={closeDrawer} open={drawerOpenState}>
            <DrawerContent>
                <DrawerHeader className="sr-only">
                    <DrawerTitle className="capitalize">
                        {process.env.NEXT_PUBLIC_ORG_NAME}
                    </DrawerTitle>
                    <DrawerDescription>Organization-level navigation.</DrawerDescription>
                </DrawerHeader>
                <div className="p-3 pb-6 space-y-0.5">
                    <DrawerItem
                        icon={Users}
                        label="Teams"
                        onClick={() => handleNavigate(app_team_path)}
                    />
                    <DrawerItem
                        icon={ClipboardList}
                        label="Projects"
                        onClick={() => handleNavigate(app_project_path)}
                    />
                    {selfProfile.data?.data.user_is_admin && (
                        <DrawerItem
                            icon={Shield}
                            label="Admin control"
                            onClick={() => handleNavigate(app_admin)}
                        />
                    )}
                </div>
            </DrawerContent>
        </Drawer>
    )
}

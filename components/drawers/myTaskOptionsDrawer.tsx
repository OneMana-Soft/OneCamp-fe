"use client"

import * as React from "react"
import { Plus, Users } from "@/lib/icons"
import { ClipboardList } from "lucide-react"
import {
    Drawer,
    DrawerContent,
    DrawerDescription,
    DrawerHeader,
    DrawerTitle,
} from "@/components/ui/drawer"
import { useRouter } from "next/navigation"
import {
    app_create_task_path,
    app_project_path,
    app_team_path,
} from "@/types/paths"
import { DrawerItem } from "@/components/drawers/drawerItem"

interface MyTaskOptionsDrawerProps {
    drawerOpenState: boolean
    setOpenState: (state: boolean) => void
}

export function MyTaskOptionsDrawer({
    drawerOpenState,
    setOpenState,
}: MyTaskOptionsDrawerProps) {
    const router = useRouter()
    const closeDrawer = () => setOpenState(false)

    const handleNavigate = (path: string) => {
        closeDrawer()
        router.push(path)
    }

    return (
        <Drawer onOpenChange={closeDrawer} open={drawerOpenState}>
            <DrawerContent>
                <DrawerHeader className="sr-only">
                    <DrawerTitle>My Tasks</DrawerTitle>
                    <DrawerDescription>Task and navigation actions.</DrawerDescription>
                </DrawerHeader>
                <div className="p-3 pb-6 space-y-0.5">
                    <DrawerItem
                        icon={Plus}
                        label="Create task"
                        onClick={() => handleNavigate(app_create_task_path)}
                    />
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
                </div>
            </DrawerContent>
        </Drawer>
    )
}

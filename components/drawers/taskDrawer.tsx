"use client"

import { Link, Trash2 } from "@/lib/icons"
import {
    Drawer,
    SheetCancel,
    SheetGroup,
    DrawerContent,
    DrawerDescription,
    DrawerHeader,
    DrawerTitle,
} from "@/components/ui/drawer"
import { useCallback } from "react"
import { app_task_path } from "@/types/paths"
import { useCopyToClipboard } from "@/hooks/useCopyToClipboard"
import { TaskInfoRawInterface } from "@/types/task"
import { GetEndpointUrl } from "@/services/endPoints"
import { useDeleteTasks } from "@/hooks/useDeleteTasks"
import { useFetchOnlyOnce } from "@/hooks/useFetch"
import { isZeroEpoch } from "@/lib/utils/validation/isZeroEpoch"
import { DrawerItem } from "@/components/drawers/drawerItem"

interface TaskDrawerProps {
    drawerOpenState: boolean
    setOpenState: (state: boolean) => void
    taskId: string
}

export function TaskDrawer({ drawerOpenState, setOpenState, taskId }: TaskDrawerProps) {
    const copyToClipboard = useCopyToClipboard()
    const taskInfo = useFetchOnlyOnce<TaskInfoRawInterface>(
        taskId ? `${GetEndpointUrl.GetTaskInfo}/${taskId}` : "",
    )

    const closeDrawer = () => setOpenState(false)

    const copyTaskLink = useCallback(() => {
        const host = window.location.host
        const protocol = window.location.protocol
        const baseUrl = `${protocol}//${host}`
        const newPath = `${app_task_path}/${taskId}`
        copyToClipboard.copy(`${baseUrl}${newPath}`, "Link copied")
        closeDrawer()
    }, [taskId, copyToClipboard])

    // Deleted with Undo, as everywhere (hooks/useDeleteTasks): it leaves its
    // lists at once. It stayed on them, and Undo was nowhere.
    const deleteTasks = useDeleteTasks()
    const handleDeleteTask = useCallback(() => {
        const task = taskInfo.data?.data
        if (task) void deleteTasks([task])
        closeDrawer()
    }, [taskInfo.data?.data, deleteTasks])

    const isActive = isZeroEpoch(taskInfo.data?.data.task_deleted_at || "")

    return (
        <Drawer detent="menu" onOpenChange={closeDrawer} open={drawerOpenState}>
            <DrawerContent>
                <DrawerHeader className="sr-only">
                    <DrawerTitle>Task actions</DrawerTitle>
                    <DrawerDescription>Quick actions for this task.</DrawerDescription>
                </DrawerHeader>
                <div className="pb-2">
                    <SheetGroup label="Task">
                    <DrawerItem icon={Link} label="Copy task link" onClick={copyTaskLink} />
                </SheetGroup>
                    {/* What destroys is alone, and last (design v3, mobile C7). */}
                    {isActive && (
                        <SheetGroup label="Delete">
                            <DrawerItem
                                icon={Trash2}
                                label="Delete task"
                                onClick={handleDeleteTask}
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

"use client"

import * as React from "react"
import { Link, Trash2 } from "@/lib/icons"
import {
    Drawer,
    DrawerContent,
    DrawerDescription,
    DrawerHeader,
    DrawerTitle,
} from "@/components/ui/drawer"
import { useCallback } from "react"
import { app_task_path } from "@/types/paths"
import { useCopyToClipboard } from "@/hooks/useCopyToClipboard"
import { CreateTaskInterface, TaskInfoRawInterface } from "@/types/task"
import { GetEndpointUrl, PostEndpointUrl } from "@/services/endPoints"
import { usePost } from "@/hooks/usePost"
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
    const post = usePost()
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

    const handleDeleteTask = useCallback(() => {
        post.makeRequest<CreateTaskInterface>({
            apiEndpoint: PostEndpointUrl.ArchiveTask,
            payload: { task_uuid: taskId },
        }).then(() => {
            taskInfo.mutate()
        })
        closeDrawer()
    }, [taskId, post, taskInfo])

    const isActive = isZeroEpoch(taskInfo.data?.data.task_deleted_at || "")

    return (
        <Drawer onOpenChange={closeDrawer} open={drawerOpenState}>
            <DrawerContent>
                <DrawerHeader className="sr-only">
                    <DrawerTitle>Task actions</DrawerTitle>
                    <DrawerDescription>Quick actions for this task.</DrawerDescription>
                </DrawerHeader>
                <div className="p-3 pb-6 space-y-0.5">
                    <DrawerItem icon={Link} label="Copy task link" onClick={copyTaskLink} />
                    {isActive && (
                        <DrawerItem
                            icon={Trash2}
                            label="Delete task"
                            onClick={handleDeleteTask}
                            destructive
                        />
                    )}
                </div>
            </DrawerContent>
        </Drawer>
    )
}

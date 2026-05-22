"use client"

import * as React from "react"
import { Pencil, Users } from "@/lib/icons"
import {
    Drawer,
    DrawerContent,
    DrawerDescription,
    DrawerHeader,
    DrawerTitle,
} from "@/components/ui/drawer"
import { useDispatch } from "react-redux"
import { useEffect, useState } from "react"
import { usePost } from "@/hooks/usePost"
import { getNextNotification } from "@/lib/utils/getNextNotification"
import { GetEndpointUrl, PostEndpointUrl } from "@/services/endPoints"
import { NotificationBell } from "@/components/Notification/notificationBell"
import { openUI } from "@/store/slice/uiSlice"
import { useFetch } from "@/hooks/useFetch"
import { NotificationType } from "@/types/channel"
import { ProjectInfoRawInterface, ProjectNotificationInterface } from "@/types/project"
import { DrawerItem } from "@/components/drawers/drawerItem"

interface ProjectOptionsDrawerProps {
    drawerOpenState: boolean
    projectId: string
    setOpenState: (state: boolean) => void
}

export function ProjectOptionsDrawer({
    drawerOpenState,
    setOpenState,
    projectId,
}: ProjectOptionsDrawerProps) {
    const projectInfo = useFetch<ProjectInfoRawInterface>(
        projectId ? `${GetEndpointUrl.GetProjectInfo}/${projectId}` : "",
    )

    const [projectNotification, setProjectNotificationType] = useState<string>(
        NotificationType.NotificationAll,
    )
    const postNotification = usePost()

    useEffect(() => {
        if (projectInfo.data?.data.notification_type) {
            setProjectNotificationType(projectInfo.data?.data.notification_type)
        }
    }, [projectInfo.data?.data])

    const updateNotification = async () => {
        const nextNotification = getNextNotification(projectNotification)
        await postNotification.makeRequest<ProjectNotificationInterface>({
            payload: { project_id: projectId, notification_type: nextNotification },
            apiEndpoint: PostEndpointUrl.UpdateProjectNotification,
        })
        setProjectNotificationType(nextNotification)
    }

    const dispatch = useDispatch()
    const closeDrawer = () => setOpenState(false)

    const notificationDescription =
        projectNotification === NotificationType.NotificationAll
            ? "All messages"
            : projectNotification === NotificationType.NotificationMention
              ? "Mentions only"
              : "Muted"

    return (
        <Drawer onOpenChange={closeDrawer} open={drawerOpenState}>
            <DrawerContent>
                <DrawerHeader className="sr-only">
                    <DrawerTitle className="capitalize">
                        {process.env.NEXT_PUBLIC_ORG_NAME}
                    </DrawerTitle>
                    <DrawerDescription>Project options</DrawerDescription>
                </DrawerHeader>
                <div className="p-3 pb-6 space-y-0.5">
                    <DrawerItem
                        label="Notifications"
                        description={notificationDescription}
                        onClick={updateNotification}
                        trailing={
                            <NotificationBell
                                notificationType={projectNotification}
                                isLoading={postNotification.isSubmitting}
                                onNotCLick={updateNotification}
                            />
                        }
                    />

                    {projectInfo.data?.data.project_is_admin && (
                        <DrawerItem
                            icon={Pencil}
                            label="Edit project name"
                            onClick={() => {
                                closeDrawer()
                                dispatch(
                                    openUI({
                                        key: "editProjectName",
                                        data: { projectUUID: projectId },
                                    }),
                                )
                            }}
                        />
                    )}

                    <DrawerItem
                        icon={Users}
                        label="Project members"
                        onClick={() => {
                            closeDrawer()
                            dispatch(
                                openUI({
                                    key: "editProjectMember",
                                    data: { projectUUID: projectId },
                                }),
                            )
                        }}
                    />
                </div>
            </DrawerContent>
        </Drawer>
    )
}

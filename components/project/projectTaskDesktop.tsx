"use client"

import { useFetch } from "@/hooks/useFetch"
import {GetEndpointUrl, PostEndpointUrl} from "@/services/endPoints"
import {ProjectInfoRawInterface, ProjectNotificationInterface} from "@/types/project"
import { Button } from "@/components/ui/button"
import { List, Paperclip, Pencil, Users } from "@/lib/icons";
import { ClipboardList, Kanban } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ProjectTaskTable } from "@/components/project/projectTaskTable"
import { ProjectAttachments } from "@/components/project/ProjectAttachments"
import { useDispatch } from "react-redux"
import { openUI } from "@/store/slice/uiSlice"
import { ColorIcon } from "@/components/colorIcon/colorIcon"
import { ProjectTaskKanban } from "@/components/project/projectTaskKanban"
import { useRouter, useSearchParams, usePathname } from "next/navigation"
import React, { useState, useEffect, useCallback } from "react"
import {NotificationBell} from "@/components/Notification/notificationBell";
import {ChannelNotificationInterface, NotificationType} from "@/types/channel";
import {getNextNotification} from "@/lib/utils/getNextNotification";
import {usePost} from "@/hooks/usePost";

const VALID_TABS = ["list", "kanban", "attachments"] as const
type TabValue = (typeof VALID_TABS)[number]

export const ProjectTaskDesktop = ({ projectId }: { projectId: string }) => {
    const projectInfo = useFetch<ProjectInfoRawInterface>(GetEndpointUrl.GetProjectInfo + "/" + projectId)
    const [projectNotification, setProjectNotificationType] = useState<string>(NotificationType.NotificationAll)

    const dispatch = useDispatch()
    const postNotification  = usePost()

    const router = useRouter()
    const pathname = usePathname()
    const searchParams = useSearchParams()

    const [selectedTab, setSelectedTab] = useState<TabValue>(() => {
        const tabFromUrl = searchParams.get("tab")
        return VALID_TABS.includes(tabFromUrl as TabValue) ? (tabFromUrl as TabValue) : "list"
    })

    useEffect(() => {

        if(projectInfo.data?.data.notification_type) {
            setProjectNotificationType(projectInfo.data?.data.notification_type)
        }

    }, [projectInfo.data?.data.project_is_member])

    const UpdateNotification = async () => {
        const nextNotification = getNextNotification(projectNotification)
        await postNotification.makeRequest<ProjectNotificationInterface>({payload:{project_id: projectId, notification_type: nextNotification}, apiEndpoint: PostEndpointUrl.UpdateProjectNotification})
        setProjectNotificationType(nextNotification)
    }

    const handleTabChange = useCallback((value: string) => {
        if (VALID_TABS.includes(value as TabValue)) {
            setSelectedTab(value as TabValue)
        }
    }, [])

    // The effect should only run when selectedTab changes, not when URL params change
    useEffect(() => {
        const params = new URLSearchParams(searchParams.toString())
        params.set("tab", selectedTab)
        router.replace(`${pathname}?${params.toString()}`, { scroll: false })
    }, [selectedTab, pathname, router])

    return (
        <div className="flex flex-col h-full bg-background/50 backdrop-blur-md overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-8 py-6 border-b border-border/50 bg-card/30">
                <div className="flex items-center gap-3">
                    <ColorIcon name={projectId} size={"sm"} InnerIcon={ClipboardList} />
                    <div>
                        <h1 className="text-2xl font-bold tracking-tight">
                            {projectInfo.data?.data.project_name}
                        </h1>
                        <p className="text-sm text-muted-foreground mt-1">
                            Manage project tasks and attachments.
                        </p>
                    </div>
                </div>
                {(projectInfo.data?.data.project_is_admin || false) && (
                    <div className="flex items-center gap-2">
                        <NotificationBell notificationType={projectNotification} isLoading={postNotification.isSubmitting} onNotCLick={UpdateNotification}/>
                        <Button
                            size="icon"
                            variant="ghost"
                            className="h-9 w-9"
                            aria-label="Edit project name"
                            onClick={() => {
                                dispatch(openUI({ key: 'editProjectName', data: { projectUUID: projectId || "" } }))
                            }}
                        >
                            <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                            size="icon"
                            variant="ghost"
                            className="h-9 w-9"
                            aria-label="Manage project members"
                            onClick={() => {
                                dispatch(openUI({ key: 'editProjectMember', data: { projectUUID: projectId || "" } }))
                            }}
                        >
                            <Users className="h-4 w-4" />
                        </Button>
                    </div>
                )}
            </div>

            {/* Content */}
            <div className="flex-1 overflow-hidden p-8">
                {projectId && (
                    <Tabs value={selectedTab} onValueChange={handleTabChange} className="h-full flex flex-col gap-6">
                        <TabsList className="w-full sm:w-fit grid grid-cols-3 sm:flex bg-muted/50 p-1 border border-border/50 backdrop-blur-sm h-auto overflow-hidden">
                            <TabsTrigger 
                                value="list"
                                className="gap-2 px-4 py-2 rounded-md transition-all duration-200 data-[state=active]:bg-background data-[state=active]:text-primary data-[state=active]:shadow-sm"
                            >
                                <List className="h-4 w-4" />
                                {"list"}
                            </TabsTrigger>
                            <TabsTrigger 
                                value="kanban"
                                className="gap-2 px-4 py-2 rounded-md transition-all duration-200 data-[state=active]:bg-background data-[state=active]:text-primary data-[state=active]:shadow-sm"
                            >
                                <Kanban className="h-4 w-4" />
                                {"board"}
                            </TabsTrigger>
                            <TabsTrigger 
                                value="attachments"
                                className="gap-2 px-4 py-2 rounded-md transition-all duration-200 data-[state=active]:bg-background data-[state=active]:text-primary data-[state=active]:shadow-sm"
                            >
                                <Paperclip className="h-4 w-4" />
                                {"attachments"}
                            </TabsTrigger>
                        </TabsList>

                        <div className="flex-1 overflow-hidden">
                            <TabsContent value="list" className="h-full mt-0 outline-none">
                                <ProjectTaskTable projectId={projectId} />
                            </TabsContent>
                            <TabsContent value="kanban" className="h-full mt-0 outline-none">
                                <ProjectTaskKanban projectId={projectId} />
                            </TabsContent>
                            <TabsContent value="attachments" className="h-full mt-0 outline-none">
                                <ProjectAttachments projectId={projectId} />
                            </TabsContent>
                        </div>
                    </Tabs>
                )}
            </div>
        </div>
    )
}

"use client"
import { useTranslation } from "react-i18next";

import { useFetch } from "@/hooks/useFetch"
import {GetEndpointUrl, PostEndpointUrl} from "@/services/endPoints"
import {ProjectInfoRawInterface, ProjectNotificationInterface} from "@/types/project"
import { List, Megaphone, Paperclip } from "@/lib/icons";
import { ProjectUpdates } from "@/components/projectUpdates/ProjectUpdates";
import { ProjectHealthChip } from "@/components/projectUpdates/ProjectHealthChip";
import { ProjectGoalChip } from "@/components/goals/ProjectGoalChip";
import { ProjectActionsMenu } from "@/components/project/ProjectToolButtons";
import { Kanban } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger, underlineTab, underlineTabsList } from "@/components/ui/tabs"
import { ProjectTaskTable } from "@/components/project/projectTaskTable"
import { ProjectAttachments } from "@/components/project/ProjectAttachments"
import { LinkedItemsSection } from "@/components/entityLink/LinkedItemsSection"
import { useDispatch } from "react-redux"
import { openUI } from "@/store/slice/uiSlice"
import { PageHeader } from "@/components/ui/pageHeader"
import { ProjectTaskKanban } from "@/components/project/projectTaskKanban"
import { ProjectGlanceLine } from "@/components/project/ProjectGlanceLine"
import { ProjectTimeline } from "@/components/project/timeline/ProjectTimeline"
import { openRightPanel } from "@/store/slice/desktopRightPanelSlice"
import { ChartGantt } from "@/lib/icons"
import { useRouter, useSearchParams, usePathname } from "next/navigation"
import { useState, useEffect, useCallback } from "react"
import {NotificationBell} from "@/components/Notification/notificationBell";
import {NotificationType} from "@/types/channel";
import {getNextNotification} from "@/lib/utils/getNextNotification";
import {usePost} from "@/hooks/usePost";

const VALID_TABS = ["list", "kanban", "timeline", "updates", "attachments"] as const
type TabValue = (typeof VALID_TABS)[number]

export const ProjectTaskDesktop = ({ projectId }: { projectId: string }) => {
    const { t } = useTranslation()
    const projectInfo = useFetch<ProjectInfoRawInterface>(GetEndpointUrl.GetProjectInfo + "/" + projectId)
    const [projectNotification, setProjectNotificationType] = useState<string>(NotificationType.NotificationAll)

    const dispatch = useDispatch()
    const postNotification  = usePost()
    const isAdmin = !!projectInfo.data?.data.project_is_admin
    const isMember = !!projectInfo.data?.data.project_is_member

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
        <div className="flex flex-col h-full overflow-hidden">
            {/* Header */}
            <PageHeader
                className="px-8 pt-8"
                eyebrow={projectInfo.data?.data.project_team?.team_name ? `Project · ${projectInfo.data.data.project_team.team_name}` : "Project"}
                title={projectInfo.data?.data.project_name || "\u00a0"}
                actions={(isMember || isAdmin) && (
                    <div className="flex items-center gap-1">
                        {/* Any member chooses their own notifications; the server
                            asks only for membership. It used to show to admins only,
                            so a member could not quiet a busy project. It stays out
                            of the menu because its icon says the current setting. */}
                        <NotificationBell notificationType={projectNotification} isLoading={postNotification.isSubmitting} onNotCLick={UpdateNotification}/>
                        {/* Everything else is one menu: forms, sharing, saving as
                            a template, renaming and members. Create task stays where
                            the list's tools are. */}
                        <ProjectActionsMenu
                            projectId={projectId}
                            projectName={projectInfo.data?.data.project_name}
                            isAdmin={isAdmin}
                            isMember={isMember}
                            onRename={() => dispatch(openUI({ key: 'editProjectName', data: { projectUUID: projectId || "" } }))}
                            onMembers={() => dispatch(openUI({ key: 'editProjectMember', data: { projectUUID: projectId || "" } }))}
                        />
                    </div>
                )}
            >
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                    <ProjectGlanceLine projectId={projectId} />
                    <ProjectHealthChip projectId={projectId} onOpen={() => handleTabChange("updates")} />
                    <ProjectGoalChip projectId={projectId} />
                </div>
            </PageHeader>

            {/* Content */}
            <div className="flex-1 overflow-hidden px-8 pb-8 pt-6">
                {projectId && (
                    <Tabs value={selectedTab} onValueChange={handleTabChange} className="h-full flex flex-col gap-6">
                        {/* A plain underline row: the bordered, tinted segmented box was one
                            more container in a header that already had three. */}
                        <TabsList className={underlineTabsList}>
                            <TabsTrigger 
                                value="list"
                                className={underlineTab}
                            >
                                <List className="h-4 w-4" />
                                {t("list", { defaultValue: "List" })}
                            </TabsTrigger>
                            <TabsTrigger 
                                value="kanban"
                                className={underlineTab}
                            >
                                <Kanban className="h-4 w-4" />
                                {t("board", { defaultValue: "Board" })}
                            </TabsTrigger>
                            <TabsTrigger
                                value="timeline"
                                className={underlineTab}
                            >
                                <ChartGantt className="h-4 w-4" />
                                Timeline
                            </TabsTrigger>
                            <TabsTrigger
                                value="updates"
                                className={underlineTab}
                            >
                                <Megaphone className="h-4 w-4" />
                                Updates
                            </TabsTrigger>
                            <TabsTrigger 
                                value="attachments"
                                className={underlineTab}
                            >
                                <Paperclip className="h-4 w-4" />
                                {t("attachments", { defaultValue: "Attachments" })}
                            </TabsTrigger>
                        </TabsList>

                        <div className="flex-1 overflow-hidden">
                            <TabsContent value="list" className="h-full mt-0 outline-none">
                                <ProjectTaskTable projectId={projectId} />
                            </TabsContent>
                            <TabsContent value="kanban" className="h-full mt-0 outline-none">
                                <ProjectTaskKanban projectId={projectId} />
                            </TabsContent>
                            <TabsContent value="timeline" className="h-full mt-0 outline-none">
                                <ProjectTimeline
                                    key={projectId}
                                    projectId={projectId}
                                    onOpenTask={(taskUUID) => dispatch(openRightPanel({ taskUUID }))}
                                    onCreateTask={() => dispatch(openUI({ key: "createTask", data: { projectId } }))}
                                />
                            </TabsContent>
                            <TabsContent value="updates" className="h-full mt-0 overflow-y-auto outline-none">
                                <ProjectUpdates projectId={projectId} />
                            </TabsContent>
                            <TabsContent value="attachments" className="h-full mt-0 outline-none">
                                <div className="p-4">
                                    <LinkedItemsSection
                                        sourceType="project"
                                        sourceUUID={projectId}
                                        canEdit={projectInfo.data?.data.project_is_member || false}
                                    />
                                </div>
                                <ProjectAttachments projectId={projectId} />
                            </TabsContent>
                        </div>
                    </Tabs>
                )}
            </div>
        </div>
    )
}

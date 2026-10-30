"use client"

import { useEffect, useState } from "react"
import { SectionTabs, SectionTabsContent } from "@/components/ui/sectionTabs"
import { ProjectListTabContent } from "@/components/project/projectListTabContent"
import { ProjectGlanceLine } from "@/components/project/ProjectGlanceLine"
import { ProjectActionsMenu, type ProjectMenuExtra } from "@/components/project/ProjectToolButtons"
import { useDispatch } from "react-redux"
import { openUI } from "@/store/slice/uiSlice"
import { useProjectNotification } from "@/hooks/useNotificationLevel"
import { Pencil, Users } from "@/lib/icons"
import { useFetch } from "@/hooks/useFetch"
import { accessOf } from "@/lib/work/access"
import { GetEndpointUrl } from "@/services/endPoints"
import type { ProjectInfoRawInterface } from "@/types/project"
import { ProjectHealthChip } from "@/components/projectUpdates/ProjectHealthChip"
import { ProjectGoalChip } from "@/components/goals/ProjectGoalChip"
import { LazyForecastChip } from "@/components/project/LazyForecastChip"
import dynamic from "next/dynamic"
import { TabLoading } from "@/components/task/TabLoading"
import { isZeroEpoch } from "@/lib/utils/validation/isZeroEpoch"

// Each tab past Tasks is its own chunk, loaded when it is opened.
const ProjectTaskKanban = dynamic(() => import("@/components/project/projectTaskKanban").then((m) => m.ProjectTaskKanban), { loading: () => <TabLoading kind="board" /> })
const ProjectTimeline = dynamic(() => import("@/components/project/timeline/ProjectTimeline").then((m) => m.ProjectTimeline), { loading: () => <TabLoading kind="timeline" /> })
const ProjectUpdates = dynamic(() => import("@/components/projectUpdates/ProjectUpdates").then((m) => m.ProjectUpdates), { loading: () => <TabLoading kind="list" /> })
// The project's docs (docs programme B5): the pages made in its space.
const ProjectBacklog = dynamic(() => import("@/components/work/backlog/ProjectBacklog"), { loading: () => <TabLoading kind="list" /> })
const SpaceDocs = dynamic(() => import("@/components/docTree/SpaceDocs"), { loading: () => <TabLoading kind="list" /> })
import { useRouter, useSearchParams } from "next/navigation"
import { useTabInAddress } from "@/components/task/keptTabs"
import { app_task_path } from "@/types/paths"

/**
 * Mobile project detail tab bar: the Tasks list, the Board (one column per
 * screen, swiped sideways, as in Asana's app), the Timeline (to read; a task
 * opens to change its dates), its Updates and the Attachments grid. Tabs use the shared
 * `SectionTabs` primitive (Notion-style underline) so the look matches
 * channel / chat / activity tabs.
 */
type Tab = "task" | "board" | "backlog" | "timeline" | "updates" | "attachment" | "docs"

// ?tab= names the desktop's tabs (list, kanban, attachments) or the phone's
// own; a link to a project's board opens its board on a phone too. The
// phone used to open on Tasks whatever the link said.
const FROM_ADDRESS: Record<string, Tab> = {
    list: "task",
    task: "task",
    kanban: "board",
    board: "board",
    backlog: "backlog",
    timeline: "timeline",
    updates: "updates",
    attachments: "attachment",
    attachment: "attachment",
    docs: "docs",
}
const TO_ADDRESS: Record<Tab, string> = { task: "list", board: "kanban", backlog: "backlog", timeline: "timeline", updates: "updates", attachment: "attachments", docs: "docs" }

export function ProjectListTabs({ projectId }: { projectId: string }) {
    const params = useSearchParams()
    const [selectedTab, setSelectedTab] = useState<Tab>(() => FROM_ADDRESS[params?.get("tab") ?? ""] ?? "task")
    const tabInAddress = useTabInAddress()
    useEffect(() => tabInAddress("tab", TO_ADDRESS[selectedTab]), [selectedTab, tabInAddress])
    const router = useRouter()
    // The same request the desktop header makes, so SWR shares it.
    const projectInfo = useFetch<ProjectInfoRawInterface>(GetEndpointUrl.GetProjectInfo + "/" + projectId)
    const info = projectInfo.data?.data

    // The phone's one "⋯" (the header line's): the project's tools, then
    // notifications, its name and its members, which the top bar's own
    // options sheet held while the bar had a second "⋯".
    const dispatch = useDispatch()
    // Its Notifications: a level chosen, not cycled (hooks/useNotificationLevel).
    const notification = useProjectNotification(projectId, info?.notification_type)
    const access = accessOf(info)
    const extra: ProjectMenuExtra[] = [
        ...(access.manage
            ? [{ key: "rename", label: "Edit project name", Icon: Pencil, onSelect: () => dispatch(openUI({ key: "editProjectName", data: { projectUUID: projectId } })) }]
            : []),
        { key: "members", label: "Project members", Icon: Users, onSelect: () => dispatch(openUI({ key: "editProjectMember", data: { projectUUID: projectId } })) },
    ]

    return (
        // The project's header block sits above the tabs, so every tab keeps
        // it: its line, its tools, its health and its goal. It was inside the
        // Tasks tab only, so a switch to any other tab jumped the content up
        // 86px and the project's tools vanished.
        <div className="flex h-full flex-col">
            <div className="grid shrink-0 grid-cols-[minmax(0,1fr)] gap-1.5 px-4 pt-3">
                <div className="flex items-center gap-1">
                    <ProjectGlanceLine projectId={projectId} className="min-w-0 flex-1 overflow-hidden" />
                    <ProjectActionsMenu compact projectId={projectId} projectName={info?.project_name} isAdmin={!!info?.project_is_admin} isMember={!!info?.project_is_member} access={access} archived={!isZeroEpoch(info?.project_deleted_at || "")} notifications={{ level: notification.level, onChoose: notification.choose }} extra={extra} />
                </div>
                {/* Each piece loads on its own, so each has its place from the
                    first paint: the chips in a row of their own. The goal's name
                    gives way with an ellipsis, as on a computer, rather than the
                    row running off the screen mid-word (PTC-43). A part whose read
                    failed (PartRetry) takes a line of its own, whole, rather than
                    running off the screen: only then does the row grow. */}
                <div data-project-chips="" className="flex h-8 min-w-0 items-center gap-2 has-[>[data-part-failed]]:h-auto has-[>[data-part-failed]]:flex-wrap">
                    <ProjectHealthChip projectId={projectId} onOpen={() => setSelectedTab("updates")} className="shrink-0" />
                    <LazyForecastChip projectId={projectId} className="shrink-0" />
                    <ProjectGoalChip projectId={projectId} className="min-w-0 shrink overflow-hidden" />
                </div>
            </div>
        <SectionTabs
            tabs={[
                { value: "task", label: "Tasks" },
                { value: "board", label: "Board" },
                { value: "backlog", label: "Backlog" },
                { value: "timeline", label: "Timeline" },
                { value: "updates", label: "Updates" },
                { value: "attachment", label: "Attachments" },
                { value: "docs", label: "Docs & Files" },
            ]}
            value={selectedTab}
            onValueChange={(v) => setSelectedTab(v as Tab)}
            className="min-h-0 flex-1"
        >
            <SectionTabsContent value="task" className="flex-1 min-h-0 flex flex-col">
                <ProjectListTabContent selectedTab="task" projectId={projectId} />
            </SectionTabsContent>
            <SectionTabsContent value="board" className="flex-1 min-h-0">
                {/* No side padding: the board runs to the screen's edges and keeps its
                    own 16px margin, so the next column can peek in at the right. */}
                <ProjectTaskKanban projectId={projectId} className="pt-3" />
            </SectionTabsContent>
            <SectionTabsContent value="backlog" className="flex-1 min-h-0 overflow-y-auto">
                <ProjectBacklog projectId={projectId} />
            </SectionTabsContent>
            <SectionTabsContent value="timeline" className="flex-1 min-h-0">
                <ProjectTimeline
                    key={projectId}
                    compact
                    projectId={projectId}
                    className="pb-3"
                    onOpenTask={(taskUUID) => router.push(`${app_task_path}/${taskUUID}`)}
                />
            </SectionTabsContent>
            <SectionTabsContent value="updates" className="flex-1 min-h-0 overflow-y-auto">
                <ProjectUpdates projectId={projectId} />
            </SectionTabsContent>
            <SectionTabsContent value="attachment" className="flex-1 min-h-0">
                <ProjectListTabContent selectedTab="attachment" projectId={projectId} />
            </SectionTabsContent>
            <SectionTabsContent value="docs" className="flex-1 min-h-0 overflow-y-auto">
                <SpaceDocs space={`project:${projectId}` as const} name={info?.project_name} />
            </SectionTabsContent>
        </SectionTabs>
        </div>
    )
}

"use client"

import { useEffect, useState } from "react"
import { SectionTabs, SectionTabsContent } from "@/components/ui/sectionTabs"
import { ProjectListTabContent } from "@/components/project/projectListTabContent"
import { ProjectTaskKanban } from "@/components/project/projectTaskKanban"
import { ProjectGlanceLine } from "@/components/project/ProjectGlanceLine"
import { ProjectToolButtons } from "@/components/project/ProjectToolButtons"
import { useFetch } from "@/hooks/useFetch"
import { GetEndpointUrl } from "@/services/endPoints"
import type { ProjectInfoRawInterface } from "@/types/project"
import { ProjectUpdates } from "@/components/projectUpdates/ProjectUpdates"
import { ProjectHealthChip } from "@/components/projectUpdates/ProjectHealthChip"
import { ProjectGoalChip } from "@/components/goals/ProjectGoalChip"
import { ProjectTimeline } from "@/components/project/timeline/ProjectTimeline"
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
type Tab = "task" | "board" | "timeline" | "updates" | "attachment"

// ?tab= names the desktop's tabs (list, kanban, attachments) or the phone's
// own; a link to a project's board opens its board on a phone too. The
// phone used to open on Tasks whatever the link said.
const FROM_ADDRESS: Record<string, Tab> = {
    list: "task",
    task: "task",
    kanban: "board",
    board: "board",
    timeline: "timeline",
    updates: "updates",
    attachments: "attachment",
    attachment: "attachment",
}
const TO_ADDRESS: Record<Tab, string> = { task: "list", board: "kanban", timeline: "timeline", updates: "updates", attachment: "attachments" }

export function ProjectListTabs({ projectId }: { projectId: string }) {
    const params = useSearchParams()
    const [selectedTab, setSelectedTab] = useState<Tab>(() => FROM_ADDRESS[params?.get("tab") ?? ""] ?? "task")
    const tabInAddress = useTabInAddress()
    useEffect(() => tabInAddress("tab", TO_ADDRESS[selectedTab]), [selectedTab, tabInAddress])
    const router = useRouter()
    // The same request the desktop header makes, so SWR shares it.
    const projectInfo = useFetch<ProjectInfoRawInterface>(GetEndpointUrl.GetProjectInfo + "/" + projectId)
    const info = projectInfo.data?.data

    return (
        // The project's header block sits above the tabs, so every tab keeps
        // it: its line, its tools, its health and its goal. It was inside the
        // Tasks tab only, so a switch to any other tab jumped the content up
        // 86px and the project's tools vanished.
        <div className="flex h-full flex-col">
            <div className="grid shrink-0 grid-cols-[minmax(0,1fr)] gap-1.5 px-4 pt-3">
                <div className="flex items-center gap-1">
                    <ProjectGlanceLine projectId={projectId} className="min-w-0 flex-1 truncate" />
                    <ProjectToolButtons projectId={projectId} projectName={info?.project_name} isAdmin={!!info?.project_is_admin} isMember={!!info?.project_is_member} />
                </div>
                {/* Each piece loads on its own, so each has its place from the
                    first paint: the chips in a row of their own that scrolls
                    sideways rather than wrapping. */}
                <div className="flex h-8 items-center gap-2 overflow-x-auto no-scrollbar [&>*]:shrink-0">
                    <ProjectHealthChip projectId={projectId} onOpen={() => setSelectedTab("updates")} />
                    <ProjectGoalChip projectId={projectId} />
                </div>
            </div>
        <SectionTabs
            tabs={[
                { value: "task", label: "Tasks" },
                { value: "board", label: "Board" },
                { value: "timeline", label: "Timeline" },
                { value: "updates", label: "Updates" },
                { value: "attachment", label: "Attachments" },
            ]}
            value={selectedTab}
            onValueChange={(v) => setSelectedTab(v as Tab)}
            className="min-h-0 flex-1"
        >
            <SectionTabsContent value="task" className="flex-1 min-h-0 outline-none flex flex-col">
                <ProjectListTabContent selectedTab="task" projectId={projectId} />
            </SectionTabsContent>
            <SectionTabsContent value="board" className="flex-1 min-h-0 outline-none">
                <ProjectTaskKanban projectId={projectId} className="px-4 pt-3" />
            </SectionTabsContent>
            <SectionTabsContent value="timeline" className="flex-1 min-h-0 outline-none">
                <ProjectTimeline
                    key={projectId}
                    compact
                    projectId={projectId}
                    className="px-4 pt-3 pb-3"
                    onOpenTask={(taskUUID) => router.push(`${app_task_path}/${taskUUID}`)}
                />
            </SectionTabsContent>
            <SectionTabsContent value="updates" className="flex-1 min-h-0 overflow-y-auto px-4 pt-3 outline-none">
                <ProjectUpdates projectId={projectId} />
            </SectionTabsContent>
            <SectionTabsContent value="attachment" className="flex-1 min-h-0 outline-none">
                <ProjectListTabContent selectedTab="attachment" projectId={projectId} />
            </SectionTabsContent>
        </SectionTabs>
        </div>
    )
}

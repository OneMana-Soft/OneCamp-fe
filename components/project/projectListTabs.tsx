"use client"

import { useState } from "react"
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
import { useRouter } from "next/navigation"
import { app_task_path } from "@/types/paths"

/**
 * Mobile project detail tab bar: the Tasks list, the Board (one column per
 * screen, swiped sideways, as in Asana's app), the Timeline (to read; a task
 * opens to change its dates), its Updates and the Attachments grid. Tabs use the shared
 * `SectionTabs` primitive (Notion-style underline) so the look matches
 * channel / chat / activity tabs.
 */
type Tab = "task" | "board" | "timeline" | "updates" | "attachment"

export function ProjectListTabs({ projectId }: { projectId: string }) {
    const [selectedTab, setSelectedTab] = useState<Tab>("task")
    const router = useRouter()
    // The same request the desktop header makes, so SWR shares it.
    const projectInfo = useFetch<ProjectInfoRawInterface>(GetEndpointUrl.GetProjectInfo + "/" + projectId)
    const info = projectInfo.data?.data

    return (
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
            className="h-full"
        >
            <SectionTabsContent value="task" className="flex-1 min-h-0 outline-none flex flex-col">
                {/* Each piece loads on its own, so each has its place from the
                    first paint: the line beside the tools, one line high, and
                    the chips in a row of their own that scrolls sideways rather
                    than wrapping. Wrapping as they arrived pushed the list down
                    about 100px on a phone. */}
                <div className="grid grid-cols-[minmax(0,1fr)] gap-1.5 px-4 pt-3">
                    <div className="flex items-center gap-1">
                        <ProjectGlanceLine projectId={projectId} className="min-w-0 flex-1 truncate" />
                        <ProjectToolButtons projectId={projectId} projectName={info?.project_name} isAdmin={!!info?.project_is_admin} isMember={!!info?.project_is_member} />
                    </div>
                    <div className="flex h-8 items-center gap-2 overflow-x-auto no-scrollbar [&>*]:shrink-0">
                        <ProjectHealthChip projectId={projectId} onOpen={() => setSelectedTab("updates")} />
                        <ProjectGoalChip projectId={projectId} />
                    </div>
                </div>
                <ProjectListTabContent selectedTab="task" projectId={projectId} />
            </SectionTabsContent>
            <SectionTabsContent value="board" className="flex-1 min-h-0 outline-none">
                <ProjectTaskKanban projectId={projectId} />
            </SectionTabsContent>
            <SectionTabsContent value="timeline" className="flex-1 min-h-0 outline-none">
                <ProjectTimeline
                    key={projectId}
                    compact
                    projectId={projectId}
                    className="px-3 pt-3 pb-3"
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
    )
}

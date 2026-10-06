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

/**
 * Mobile project detail tab bar: the Tasks list, the Board (one column per
 * screen, swiped sideways, as in Asana's app) and the Attachments grid. Tabs use the shared
 * `SectionTabs` primitive (Notion-style underline) so the look matches
 * channel / chat / activity tabs.
 */
export function ProjectListTabs({ projectId }: { projectId: string }) {
    const [selectedTab, setSelectedTab] = useState<"task" | "board" | "attachment">("task")
    // The same request the desktop header makes, so SWR shares it.
    const projectInfo = useFetch<ProjectInfoRawInterface>(GetEndpointUrl.GetProjectInfo + "/" + projectId)
    const info = projectInfo.data?.data

    return (
        <SectionTabs
            tabs={[
                { value: "task", label: "Tasks" },
                { value: "board", label: "Board" },
                { value: "attachment", label: "Attachments" },
            ]}
            value={selectedTab}
            onValueChange={(v) => setSelectedTab(v as "task" | "board" | "attachment")}
            className="h-full"
        >
            <SectionTabsContent value="task" className="flex-1 min-h-0 outline-none flex flex-col">
                <div className="flex items-center gap-1 px-4 pt-3">
                    <ProjectGlanceLine projectId={projectId} className="min-w-0 flex-1" />
                    <ProjectToolButtons projectId={projectId} projectName={info?.project_name} isAdmin={!!info?.project_is_admin} isMember={!!info?.project_is_member} />
                </div>
                <ProjectListTabContent selectedTab="task" projectId={projectId} />
            </SectionTabsContent>
            <SectionTabsContent value="board" className="flex-1 min-h-0 outline-none">
                <ProjectTaskKanban projectId={projectId} />
            </SectionTabsContent>
            <SectionTabsContent value="attachment" className="flex-1 min-h-0 outline-none">
                <ProjectListTabContent selectedTab="attachment" projectId={projectId} />
            </SectionTabsContent>
        </SectionTabs>
    )
}

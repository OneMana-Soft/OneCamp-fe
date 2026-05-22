"use client"

import { useState } from "react"
import { SectionTabs, SectionTabsContent } from "@/components/ui/sectionTabs"
import { ProjectListTabContent } from "@/components/project/projectListTabContent"

/**
 * Mobile project detail tab bar. Switches between the Tasks list and
 * the Attachments grid for a given project. Tabs use the shared
 * `SectionTabs` primitive (Notion-style underline) so the look matches
 * channel / chat / activity tabs.
 */
export function ProjectListTabs({ projectId }: { projectId: string }) {
    const [selectedTab, setSelectedTab] = useState<"task" | "attachment">("task")

    return (
        <SectionTabs
            tabs={[
                { value: "task", label: "Tasks" },
                { value: "attachment", label: "Attachments" },
            ]}
            value={selectedTab}
            onValueChange={(v) => setSelectedTab(v as "task" | "attachment")}
            className="h-full"
        >
            <SectionTabsContent value="task" className="flex-1 min-h-0 outline-none">
                <ProjectListTabContent selectedTab="task" projectId={projectId} />
            </SectionTabsContent>
            <SectionTabsContent value="attachment" className="flex-1 min-h-0 outline-none">
                <ProjectListTabContent selectedTab="attachment" projectId={projectId} />
            </SectionTabsContent>
        </SectionTabs>
    )
}

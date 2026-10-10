"use client"

import { Tabs, TabsList, TabsTrigger, underlineTab, underlineTabsList } from "@/components/ui/tabs"
import { PageHeader } from "@/components/ui/pageHeader"
import { List } from "@/lib/icons";
import { Kanban } from "@/lib/icons";
import { MyTaskTable } from "@/components/myTask/myTaskTable"
import { MyTaskKanban } from "@/components/myTask/myTaskKanban"
import { useSearchParams } from "next/navigation"
import { useState, useEffect, useCallback, startTransition } from "react"
import { KeptTab, useSeenTabs, useTabInAddress } from "@/components/task/keptTabs"
import {useTranslation} from "react-i18next";

const VALID_TABS = ["list", "kanban"] as const
type TabValue = (typeof VALID_TABS)[number]

export const MyTaskDesktop = () => {
    const searchParams = useSearchParams()
    const {t} = useTranslation()

    // Initialize tab state from URL with validation
    const [selectedTab, setSelectedTab] = useState<TabValue>(() => {
        const tabFromUrl = searchParams.get("tab")
        return VALID_TABS.includes(tabFromUrl as TabValue) ? (tabFromUrl as TabValue) : "list"
    })

    const seen = useSeenTabs(selectedTab)
    const tabInAddress = useTabInAddress()

    // The underline moves at once; the list or board follows as a transition.
    const handleTabChange = useCallback((value: string) => {
        if (VALID_TABS.includes(value as TabValue)) {
            startTransition(() => setSelectedTab(value as TabValue))
        }
    }, [])

    useEffect(() => tabInAddress("tab", selectedTab), [selectedTab, tabInAddress])

    return (
        <div className="flex flex-col h-full overflow-hidden">
            {/* Header */}
            <PageHeader eyebrow="Assigned to you" title={t("myTasks")} className="px-8 pt-8" />

            {/* Content */}
            <div className="flex-1 overflow-hidden px-8 pb-8 pt-6">
                <Tabs value={selectedTab} onValueChange={handleTabChange} className="h-full flex flex-col gap-6">
                    <TabsList className={underlineTabsList}>
                        <TabsTrigger 
                            value="list"
                            className={underlineTab}
                        >
                            <List className="h-4 w-4" />
                            {t("list")}
                        </TabsTrigger>
                        <TabsTrigger 
                            value="kanban"
                            className={underlineTab}
                        >
                            <Kanban className="h-4 w-4" />
                            {t("board")}
                        </TabsTrigger>
                    </TabsList>

                    {/* One scroll container for both tabs' bodies: a page of 20
                        to 50 tasks was cut off here. */}
                    <div className="min-h-0 flex-1 overflow-y-auto">
                        <KeptTab value="list" selected={selectedTab === "list"} seen={seen.has("list")} className="h-full mt-0 outline-none">
                            <MyTaskTable />
                        </KeptTab>
                        <KeptTab value="kanban" selected={selectedTab === "kanban"} seen={seen.has("kanban")} className="h-full mt-0 outline-none">
                            <MyTaskKanban className="px-0 pt-0" />
                        </KeptTab>
                    </div>
                </Tabs>
            </div>
        </div>
    )
}

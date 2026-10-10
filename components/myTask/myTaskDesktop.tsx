"use client"

import { Tabs, TabsContent, TabsList, TabsTrigger, underlineTab, underlineTabsList } from "@/components/ui/tabs"
import { PageHeader } from "@/components/ui/pageHeader"
import { List } from "@/lib/icons";
import { Kanban } from "@/lib/icons";
import { MyTaskTable } from "@/components/myTask/myTaskTable"
import { MyTaskKanban } from "@/components/myTask/myTaskKanban"
import { useRouter, useSearchParams, usePathname } from "next/navigation"
import { useState, useEffect, useCallback } from "react"
import {useTranslation} from "react-i18next";

const VALID_TABS = ["list", "kanban"] as const
type TabValue = (typeof VALID_TABS)[number]

export const MyTaskDesktop = () => {
    const router = useRouter()
    const pathname = usePathname()
    const searchParams = useSearchParams()
    const {t} = useTranslation()

    // Initialize tab state from URL with validation
    const [selectedTab, setSelectedTab] = useState<TabValue>(() => {
        const tabFromUrl = searchParams.get("tab")
        return VALID_TABS.includes(tabFromUrl as TabValue) ? (tabFromUrl as TabValue) : "list"
    })

    const handleTabChange = useCallback((value: string) => {
        if (VALID_TABS.includes(value as TabValue)) {
            setSelectedTab(value as TabValue)
        }
    }, [])

    useEffect(() => {
        if (pathname === "/app/myTask" && searchParams.get("tab") !== selectedTab) {
            const params = new URLSearchParams(searchParams.toString())
            params.set("tab", selectedTab)
            router.replace(`${pathname}?${params.toString()}`, { scroll: false })
        }
    }, [selectedTab, pathname, router, searchParams])

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

                    <div className="flex-1 overflow-hidden">
                        <TabsContent value="list" className="h-full mt-0 outline-none">
                            <MyTaskTable />
                        </TabsContent>
                        <TabsContent value="kanban" className="h-full mt-0 outline-none">
                            <MyTaskKanban />
                        </TabsContent>
                    </div>
                </Tabs>
            </div>
        </div>
    )
}

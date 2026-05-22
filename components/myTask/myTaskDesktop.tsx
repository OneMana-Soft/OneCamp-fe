"use client"

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
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
            <div className="flex items-center justify-between px-8 py-6 border-b border-border/50">
                <div>
                    <h1 className="text-2xl font-medium tracking-tight">
                        {t("myTasks")}
                    </h1>
                    <p className="text-sm text-muted-foreground mt-1">
                        {t("hereAListOfYourTask")}
                    </p>
                </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-hidden p-8">
                <Tabs value={selectedTab} onValueChange={handleTabChange} className="h-full flex flex-col gap-6">
                    <TabsList className="w-full sm:w-fit grid grid-cols-2 sm:flex bg-muted/50 p-1 border border-border/50 h-auto overflow-hidden">
                        <TabsTrigger 
                            value="list"
                            className="gap-2 px-4 py-2 rounded-md transition-all duration-200 data-[state=active]:bg-background data-[state=active]:text-primary"
                        >
                            <List className="h-4 w-4" />
                            {t("list")}
                        </TabsTrigger>
                        <TabsTrigger 
                            value="kanban"
                            className="gap-2 px-4 py-2 rounded-md transition-all duration-200 data-[state=active]:bg-background data-[state=active]:text-primary"
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

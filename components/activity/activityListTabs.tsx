"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Bell } from "@/lib/icons"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { useDispatch } from "react-redux"
import { ActivityListTabContent } from "@/components/activity/activityListTabContent"
import { setTotalUnreadActivityCount } from "@/store/slice/userSlice"
import { SectionTabs } from "@/components/ui/sectionTabs"
import { useFetch } from "@/hooks/useFetch"
import { GetEndpointUrl } from "@/services/endPoints"
import { UnifiedActivityItem, UnifiedActivityPaginationRes } from "@/types/activity"

const VALID_TABS = ["priority", "all", "mentions", "comments", "reactions"] as const
type TabValue = (typeof VALID_TABS)[number]

export function ActivityListTabs() {
    const pathname = usePathname()
    const searchParams = useSearchParams()
    const router = useRouter()
    const dispatch = useDispatch()

    const [selectedTab, setSelectedTab] = useState<TabValue>(() => {
        const tabFromUrl = searchParams.get("tab")
        return VALID_TABS.includes(tabFromUrl as TabValue)
            ? (tabFromUrl as TabValue)
            : "all"
    })

    // Reuse the SAME SWR key the All/Priority list fetches for its FIRST
    // page, so the count badge shares the cache — no extra request — and
    // tracks the server's read-state demotion in real time.
    const { data: firstPage } = useFetch<UnifiedActivityPaginationRes>(
        `${GetEndpointUrl.GetUnifiedActivity}?limit=20`,
    )
    const priorityCount = useMemo(() => {
        const items: UnifiedActivityItem[] = firstPage?.data?.activities ?? []
        return items.filter((a) => a.priority === "high").length
    }, [firstPage])

    const tabs = useMemo(
        () => [
            // Cap the visible count at 9+ so the pill stays compact.
            { value: "priority", label: "Priority", count: priorityCount > 9 ? "9+" : priorityCount || undefined },
            { value: "all", label: "All" },
            { value: "mentions", label: "Mentions" },
            { value: "comments", label: "Comments" },
            { value: "reactions", label: "Reactions" },
        ],
        [priorityCount],
    )

    const handleChangeTab = useCallback((value: string) => {
        if (VALID_TABS.includes(value as TabValue)) {
            setSelectedTab(value as TabValue)
        }
    }, [])

    useEffect(() => {
        if (pathname === "/app/activity" && searchParams.get("tab") !== selectedTab) {
            const params = new URLSearchParams(searchParams.toString())
            params.set("tab", selectedTab)
            router.replace(`${pathname}?${params.toString()}`, { scroll: false })
        }
    }, [selectedTab, pathname, router, searchParams])

    useEffect(() => {
        dispatch(setTotalUnreadActivityCount({ count: 0 }))
    }, [dispatch])

    return (
        <SectionTabs
            tabs={tabs}
            value={selectedTab}
            onValueChange={handleChangeTab}
            icon={Bell}
            title="Activity"
        >
            <ActivityListTabContent selectedTab={selectedTab} onSelectTab={handleChangeTab} />
        </SectionTabs>
    )
}

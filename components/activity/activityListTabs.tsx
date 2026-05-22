"use client"

import { useCallback, useEffect, useState } from "react"
import { Bell } from "@/lib/icons"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { useDispatch } from "react-redux"
import { ActivityListTabContent } from "@/components/activity/activityListTabContent"
import { setTotalUnreadActivityCount } from "@/store/slice/userSlice"
import { SectionTabs } from "@/components/ui/sectionTabs"

const VALID_TABS = ["all", "mentions", "comments", "reactions"] as const
type TabValue = (typeof VALID_TABS)[number]

const TABS = [
    { value: "all", label: "All" },
    { value: "mentions", label: "Mentions" },
    { value: "comments", label: "Comments" },
    { value: "reactions", label: "Reactions" },
] as const

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
            tabs={[...TABS]}
            value={selectedTab}
            onValueChange={handleChangeTab}
            icon={Bell}
            title="Activity"
        >
            <ActivityListTabContent selectedTab={selectedTab} />
        </SectionTabs>
    )
}

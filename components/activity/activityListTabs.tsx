"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Bell } from "@/lib/icons"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { useDispatch } from "react-redux"
import { ActivityListTabContent } from "@/components/activity/activityListTabContent"
import { setTotalUnreadActivityCount } from "@/store/slice/userSlice"
import { clearActivityUnread } from "@/services/unreadCache"
import { SectionTabs } from "@/components/ui/sectionTabs"
import MyAIActivityCard from "@/components/ai/MyAIActivityCard"
import { useAIAvailable } from "@/hooks/useClientConfig"
import { useFetch } from "@/hooks/useFetch"
import { GetEndpointUrl } from "@/services/endPoints"
import { UnifiedActivityItem, UnifiedActivityPaginationRes } from "@/types/activity"

// "ai" is the governance filter the UI critique asked for, and it is a TAB rather
// than a tenth item in the sidebar on purpose. That critique's own finding is that
// the nav is a hotel lobby of equal doors and the wedge is quiet; answering it by
// adding another door would make the first problem worse to fix the second. This
// puts what the AI did in your name inside chrome people already open.
const VALID_TABS = ["priority", "all", "mentions", "comments", "reactions", "ai"] as const
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

    const aiAvailable = useAIAvailable()

    const tabs = useMemo(
        () => [
            // Cap the visible count at 9+ so the pill stays compact.
            { value: "priority", label: "Priority", count: priorityCount > 9 ? "9+" : priorityCount || undefined },
            { value: "all", label: "All" },
            { value: "mentions", label: "Mentions" },
            { value: "comments", label: "Comments" },
            { value: "reactions", label: "Reactions" },
            // Last, and only when there is AI to account for. On the AI-free
            // edition, and on v2 with AI switched off, an "AI" tab leading to an
            // empty list would advertise a subsystem this server does not have.
            ...(aiAvailable ? [{ value: "ai", label: "AI" }] : []),
        ],
        [priorityCount, aiAvailable],
    )

    // A link can ask for a tab this edition does not have: ?tab=ai reaches an
    // AI-free server from a bookmark, a shared URL or a client that still has
    // the old menu. Without this the page renders with no tab selected and a
    // body that gates itself away, which reads as a broken Activity page.
    // Derived rather than corrected in an effect, because the config request
    // fails closed while it is in flight and a correction would bounce a
    // legitimate ?tab=ai to All on every load.
    const effectiveTab: TabValue = selectedTab === "ai" && !aiAvailable ? "all" : selectedTab

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
        // The sidenav cache carries this number too, and re-seeds Redux from it
        // on remount. See services/unreadCache.ts.
        clearActivityUnread()
    }, [dispatch])

    return (
        <SectionTabs
            tabs={tabs}
            value={effectiveTab}
            onValueChange={handleChangeTab}
            icon={Bell}
            title="Activity"
        >
            {effectiveTab === "ai" ? (
                <MyAIActivityCard />
            ) : (
                <ActivityListTabContent selectedTab={effectiveTab} onSelectTab={handleChangeTab} />
            )}
        </SectionTabs>
    )
}

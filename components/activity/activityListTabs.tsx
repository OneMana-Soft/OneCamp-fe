"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { Bell, Settings } from "@/lib/icons"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { useDispatch } from "react-redux"
import { ActivityFeedList } from "@/components/activity/activityFeedList"
import { setTotalUnreadActivityCount } from "@/store/slice/userSlice"
import { clearActivityUnread } from "@/services/unreadCache"
import { SectionTabs } from "@/components/ui/sectionTabs"
import { useFetch } from "@/hooks/useFetch"
import { GetEndpointUrl } from "@/services/endPoints"
import { UnifiedActivityItem, UnifiedActivityPaginationRes } from "@/types/activity"

// Comments and Reactions were tabs of their own. Everything in them is in All,
// in order, and five tabs to read one inbox is the kind of choice a calm tool
// should not ask for. Old links to them open All.
const VALID_TABS = ["priority", "all", "mentions"] as const
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
        ],
        [priorityCount],
    )

    const handleChangeTab = useCallback((value: string) => {
        if (VALID_TABS.includes(value as TabValue)) {
            setSelectedTab(value as TabValue)
        }
    }, [])

    const viewAll = useCallback(() => setSelectedTab("all"), [])

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
            value={selectedTab}
            onValueChange={handleChangeTab}
            icon={Bell}
            title="Activity"
            // What reaches you, and how, is decided in settings; it was
            // reachable only through the profile menu or the palette.
            actions={
                <Link
                    href="/app/settings/notifications"
                    className="inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-xs text-muted-foreground transition-colors hover:bg-highlight hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70"
                    aria-label="Notification settings"
                >
                    <Settings className="h-4 w-4" aria-hidden="true" />
                    <span className="hidden md:inline">Notification settings</span>
                </Link>
            }
        >
            {/* Every tab draws in the same frame (activityFeedFrame). */}
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                <ActivityFeedList view={selectedTab} onViewAll={viewAll} />
            </div>
        </SectionTabs>
    )
}

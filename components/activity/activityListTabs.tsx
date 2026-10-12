"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { Inbox as InboxIcon, SlidersHorizontal } from "@/lib/icons"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { useDispatch } from "react-redux"
import { ActivityFeedList } from "@/components/activity/activityFeedList"
import { HubFrame, HubTabs, type HubTab } from "@/components/activity/hubFrame"
import { setTotalUnreadActivityCount } from "@/store/slice/userSlice"
import { clearActivityUnread } from "@/services/unreadCache"
import { markActivitySeen } from "@/services/activityService"
import { useFetch } from "@/hooks/useFetch"
import { GetEndpointUrl } from "@/services/endPoints"
import { UnifiedActivityItem, UnifiedActivityPaginationRes } from "@/types/activity"
import { Switch } from "@/components/ui/switch"
import { Button } from "@/components/ui/button"
import { useReadState, isUnread } from "@/lib/activity/readState"
import { activityKey, collapseEchoes, hasSubject } from "@/lib/activity/feedPages"

// Comments and Reactions were tabs of their own. Everything in them is in All,
// in order. Old links to them open All.
const VALID_TABS = ["priority", "all", "mentions"] as const
type TabValue = (typeof VALID_TABS)[number]

/**
 * Activity (hub.md A1, A2): one 52px header with the tabs inline, an
 * "Unread only" switch, "Mark all read" while anything is unread, and the
 * notification settings as an icon button. Every tab draws in the one frame
 * underneath (activityFeedFrame).
 */
export function ActivityListTabs() {
    const pathname = usePathname()
    const searchParams = useSearchParams()
    const router = useRouter()
    const dispatch = useDispatch()

    const [selectedTab, setSelectedTab] = useState<TabValue>(() => {
        const tabFromUrl = searchParams.get("tab")
        return VALID_TABS.includes(tabFromUrl as TabValue) ? (tabFromUrl as TabValue) : "all"
    })
    const [unreadOnly, setUnreadOnly] = useState(false)
    const { read, mark } = useReadState()
    const [unreadKeys, setUnreadKeys] = useState<string[]>([])

    // The SAME SWR key the list fetches for its first page, so the counts share
    // the cache (no extra request) and follow the server's read-state demotion.
    const { data: firstPage } = useFetch<UnifiedActivityPaginationRes>(`${GetEndpointUrl.GetUnifiedActivity}?limit=20`)
    const counts = useMemo(() => {
        const items: UnifiedActivityItem[] = collapseEchoes((firstPage?.data?.activities ?? []).filter(hasSubject))
        const unread = items.filter((a) => isUnread(a, activityKey(a), read))
        return {
            priority: unread.filter((a) => a.priority === "high").length,
            all: unread.length,
            mentions: unread.filter((a) => a.activity_type === "MENTION").length,
        }
    }, [firstPage, read])

    const tabs = useMemo<HubTab[]>(
        () => [
            { value: "priority", label: "Priority", count: counts.priority },
            { value: "all", label: "All", count: counts.all },
            // A mention is you: its count is the brand badge.
            { value: "mentions", label: "Mentions", count: counts.mentions, badge: true },
        ],
        [counts],
    )

    // A link can ask for a tab this edition does not have (?tab=ai): it opens
    // All, since VALID_TABS has no such tab.
    const effectiveTab: TabValue = selectedTab

    const handleChangeTab = useCallback((value: string) => {
        if (VALID_TABS.includes(value as TabValue)) setSelectedTab(value as TabValue)
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
        // The sidenav cache carries this number too (services/unreadCache.ts).
        clearActivityUnread()
    }, [dispatch])

    // What the Inbox shows is seen. Reading the feed marks nothing on the
    // server (Home reads it too), so the Inbox says so: once its first page
    // is on screen, and again when a newer one arrives while it's open.
    useEffect(() => {
        if (firstPage) void markActivitySeen()
    }, [firstPage])

    // Keys: 1-4 switch tabs, Shift+U marks all read (A1). Never while typing.
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            const t = e.target as HTMLElement | null
            if (e.metaKey || e.ctrlKey || e.altKey || t?.closest?.("input, textarea, [contenteditable=true], [role=dialog]")) return
            const n = Number(e.key)
            if (n >= 1 && n <= tabs.length) {
                setSelectedTab(tabs[n - 1].value as TabValue)
            } else if (e.key === "U" && e.shiftKey && unreadKeys.length) {
                mark(unreadKeys, true)
            }
        }
        window.addEventListener("keydown", onKey)
        return () => window.removeEventListener("keydown", onKey)
    }, [tabs, unreadKeys, mark])

    return (
        <HubFrame
            icon={InboxIcon}
            title="Inbox"
            tabs={<HubTabs label="Inbox" tabs={tabs} value={effectiveTab} onChange={handleChangeTab} />}
            controls={
                <>
                    <label className="hidden items-center gap-2 text-xs text-ink-2 sm:flex">
                        Unread only
                        <Switch checked={unreadOnly} onCheckedChange={setUnreadOnly} aria-label="Unread only" />
                    </label>
                    {unreadKeys.length > 0 ? (
                        <Button variant="ghost" size="sm" onClick={() => mark(unreadKeys, true)} className="hidden md:inline-flex">
                            Mark all read
                        </Button>
                    ) : null}
                    {/* What reaches you, and how, is decided in settings. */}
                    <Link
                        href="/app/settings/notifications"
                        aria-label="Notification settings"
                        title="Notification settings"
                        className="grid size-7 place-items-center rounded-md text-ink-3 transition-colors hover:bg-hover hover:text-foreground focus-visible:outline-2 focus-visible:outline-brand [&_svg]:size-4"
                    >
                        <SlidersHorizontal aria-hidden="true" />
                    </Link>
                </>
            }
        >
            {/* Every tab draws in the same frame (activityFeedFrame); a tab
                switch cross-fades the column, nothing else moves. */}
            <div key={effectiveTab} className="flex min-h-0 flex-1 flex-col overflow-hidden">
                <ActivityFeedList
                    view={effectiveTab}
                    onViewAll={viewAll}
                    unreadOnly={unreadOnly}
                    read={read}
                    onToggleRead={mark}
                    onUnreadKeys={setUnreadKeys}
                    onShowAll={() => setUnreadOnly(false)}
                />
            </div>
        </HubFrame>
    )
}

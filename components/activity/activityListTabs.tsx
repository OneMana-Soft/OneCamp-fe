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
import MyAIActivityCard from "@/components/ai/MyAIActivityCard"
import InboxNudges from "@/components/ai/InboxNudges"
import { useAIAvailable } from "@/hooks/useClientConfig"
import { useFetch } from "@/hooks/useFetch"
import { GetEndpointUrl } from "@/services/endPoints"
import { UnifiedActivityItem, UnifiedActivityPaginationRes } from "@/types/activity"
import { Switch } from "@/components/ui/switch"
import { Button } from "@/components/ui/button"
import {
    DropdownMenu,
    DropdownMenuCheckboxItem,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useReadState, isUnread } from "@/lib/activity/readState"
import { activityKey, collapseEchoes, hasSubject, inboxFeedKey, INBOX_PAGE_SIZE } from "@/lib/activity/feedPages"
import { isMention } from "@/lib/activity/notice"

// "ai" is the governance record, and it is a TAB rather than a tenth item in the
// sidebar on purpose: what the AI did in your name sits inside chrome people
// already open. Its label is "Agents" (design v3, hub.md A2), which is what it
// records; the URL keeps ?tab=ai so old links still land on it.
//
// Comments and Reactions were tabs of their own. Everything in them is in All,
// in order. Old links to them open All.
const VALID_TABS = ["priority", "all", "mentions", "ai"] as const
type TabValue = (typeof VALID_TABS)[number]

/** Where the Inbox lives (/app/activity redirects here, next.config). */
export const INBOX_PATH = "/app/inbox"

/** Why Unread only is off on the Agents tab: the record is a log, read or not. */
export const RECORD_HAS_NO_UNREAD = "The agents record isn't marked read or unread"

/**
 * Activity (hub.md A1, A2): one 52px header with the tabs inline, an
 * "Unread only" switch, "Mark all read" while anything is unread, and the
 * notification settings as an icon button. Every tab draws in the one frame
 * underneath (activityFeedFrame).
 *
 * The header's controls are the same on every tab, so nothing in it moves
 * when the tab changes: on Agents, Unread only stays where it is, switched off
 * and saying why, where it used to vanish (QA F-23). Below md there is room
 * for the tabs and one button, so the three controls are in its menu: a phone
 * had no Unread only and no Mark all read at all (QA F-24).
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
    const { data: firstPage } = useFetch<UnifiedActivityPaginationRes>(inboxFeedKey(GetEndpointUrl.GetUnifiedActivity, INBOX_PAGE_SIZE))
    const counts = useMemo(() => {
        const items: UnifiedActivityItem[] = collapseEchoes((firstPage?.data?.activities ?? []).filter(hasSubject))
        const unread = items.filter((a) => isUnread(a, activityKey(a), read))
        return {
            priority: unread.filter((a) => a.priority === "high").length,
            all: unread.length,
            mentions: unread.filter(isMention).length,
        }
    }, [firstPage, read])

    const aiAvailable = useAIAvailable()

    const tabs = useMemo<HubTab[]>(
        () => [
            { value: "priority", label: "Priority", count: counts.priority },
            { value: "all", label: "All", count: counts.all },
            // A mention is you: its count is the brand badge.
            { value: "mentions", label: "Mentions", count: counts.mentions, badge: true },
            // Only when there is AI to account for. On the AI-free edition, and
            // on v2 with AI switched off, the tab would advertise a subsystem
            // this server does not have.
            ...(aiAvailable ? [{ value: "ai", label: "Agents" }] : []),
        ],
        [counts, aiAvailable],
    )

    // A link can ask for a tab this edition does not have (?tab=ai on an AI-free
    // server): derived, not corrected in an effect, because the config request
    // fails closed while in flight.
    const effectiveTab: TabValue = selectedTab === "ai" && !aiAvailable ? "all" : selectedTab

    const handleChangeTab = useCallback((value: string) => {
        if (VALID_TABS.includes(value as TabValue)) setSelectedTab(value as TabValue)
    }, [])
    const viewAll = useCallback(() => setSelectedTab("all"), [])

    // The tab lives in the address, so a reload, Back or a copied link opens it.
    // This checked /app/activity after the page moved to /app/inbox, and the
    // address stopped following the tabs.
    useEffect(() => {
        if (pathname === INBOX_PATH && searchParams.get("tab") !== selectedTab) {
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

    const feed = effectiveTab !== "ai"

    return (
        <HubFrame
            icon={InboxIcon}
            title="Inbox"
            tabs={<HubTabs label="Inbox" tabs={tabs} value={effectiveTab} onChange={handleChangeTab} />}
            controls={
                <>
                    <label className="hidden items-center gap-2 text-xs text-ink-2 md:flex" title={feed ? undefined : RECORD_HAS_NO_UNREAD}>
                        Unread only
                        <Switch checked={feed && unreadOnly} onCheckedChange={setUnreadOnly} disabled={!feed} aria-label="Unread only" />
                        {feed ? null : <span className="sr-only">{RECORD_HAS_NO_UNREAD}</span>}
                    </label>
                    {feed && unreadKeys.length > 0 ? (
                        <Button variant="ghost" size="sm" onClick={() => mark(unreadKeys, true)} className="hidden md:inline-flex">
                            Mark all read
                        </Button>
                    ) : null}
                    {/* What reaches you, and how, is decided in settings. */}
                    <Link
                        href="/app/settings/notifications"
                        aria-label="Notification settings"
                        title="Notification settings"
                        className="hidden size-7 place-items-center rounded-md text-ink-3 transition-colors hover:bg-hover hover:text-foreground focus-visible:outline-2 focus-visible:outline-brand md:grid [&_svg]:size-4"
                    >
                        <SlidersHorizontal aria-hidden="true" />
                    </Link>
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <button
                                type="button"
                                aria-label="Inbox options"
                                data-touch-target=""
                                className="grid size-7 place-items-center rounded-md text-ink-3 transition-colors hover:bg-hover hover:text-foreground focus-visible:outline-2 focus-visible:outline-brand md:hidden [&_svg]:size-4"
                            >
                                <SlidersHorizontal aria-hidden="true" />
                            </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-56">
                            <DropdownMenuCheckboxItem checked={feed && unreadOnly} onCheckedChange={(on) => setUnreadOnly(on === true)} disabled={!feed}>
                                Unread only
                            </DropdownMenuCheckboxItem>
                            {feed ? null : <p className="px-2 pb-1.5 text-meta text-ink-3">{RECORD_HAS_NO_UNREAD}</p>}
                            {feed && unreadKeys.length > 0 ? (
                                <DropdownMenuItem onSelect={() => mark(unreadKeys, true)}>Mark all read</DropdownMenuItem>
                            ) : null}
                            <DropdownMenuSeparator />
                            <DropdownMenuItem asChild>
                                <Link href="/app/settings/notifications">Notification settings</Link>
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                </>
            }
        >
            {/* Every tab draws in the same frame (activityFeedFrame); a tab
                switch cross-fades the column, nothing else moves. */}
            <div key={effectiveTab} className="flex min-h-0 flex-1 flex-col overflow-hidden">
                {feed ? (
                    <>
                        {/* OneCamp AI's nudges, pinned atop Priority (the bell's
                            successor, design v3 N1). Gated on AI by the component. */}
                        {effectiveTab === "priority" && <InboxNudges />}
                        <ActivityFeedList
                            view={effectiveTab}
                            onViewAll={viewAll}
                            unreadOnly={unreadOnly}
                            read={read}
                            onToggleRead={mark}
                            onUnreadKeys={setUnreadKeys}
                            onShowAll={() => setUnreadOnly(false)}
                        />
                    </>
                ) : (
                    <MyAIActivityCard variant="feed" />
                )}
            </div>
        </HubFrame>
    )
}

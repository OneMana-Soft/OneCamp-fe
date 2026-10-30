"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import dynamic from "next/dynamic"
import { Inbox as InboxIcon, SlidersHorizontal } from "@/lib/icons"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { useDispatch, useSelector } from "react-redux"
import type { RootState } from "@/store/store"
import { closeRightPanel, openRightPanel } from "@/store/slice/desktopRightPanelSlice"
import { ActivityFeedList, type InboxPane } from "@/components/activity/activityFeedList"
import { HubFrame, HubTabs, type HubTab } from "@/components/activity/hubFrame"
import { HubSpot } from "@/components/activity/hubEmpty"
import { ActivityFeedSkeleton } from "@/components/activity/activityFeedFrame"
import { usePhone } from "@/hooks/usePhone"
import { usePanelPlacement } from "@/components/navigationBar/tablet/useShellBand"
import { setTotalUnreadActivityCount } from "@/store/slice/userSlice"
import { clearActivityUnread } from "@/services/unreadCache"
import { markActivitySeen } from "@/services/activityService"
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
import { CHAT_THREADS_PATH, THREADS_UNREAD_KEY } from "@/lib/conversation/threadsKey"
import { OWN_ERRORS } from "@/lib/axiosInstance"

// The Threads tab's list loads the first time the tab opens, not with the Inbox.
const ThreadsList = dynamic(() => import("@/components/activity/threadsList"), {
    loading: () => <ActivityFeedSkeleton label="Loading threads" />,
})

// So does the AI tab's record of what agents did, with its drill and its rows.
const MyAIActivityCard = dynamic(() => import("@/components/ai/MyAIActivityCard"), {
    loading: () => <ActivityFeedSkeleton label="Loading AI activity" />,
})

/** Marks every thread you follow read (lib/conversation/threads, loaded when asked). */
async function readAllThreads() {
    const { readAllThreads: readAll } = await import("@/lib/conversation/threads")
    await readAll()
}

// "ai" is the governance record, and it is a TAB rather than a tenth item in the
// sidebar on purpose: what the AI did in your name sits inside chrome people
// already open. Its label is "Agents" (design v3, hub.md A2), which is what it
// records; the URL keeps ?tab=ai so old links still land on it.
//
// Comments and Reactions were tabs of their own. Everything in them is in All,
// in order. Old links to them open All.
// Threads (chat P2) is the threads you follow, unread first: its count is a
// plain one, as All's, since a reply in a thread you follow isn't addressed to
// you the way a mention is.
const VALID_TABS = ["priority", "all", "mentions", "threads", "ai"] as const
type TabValue = (typeof VALID_TABS)[number]

const CLOSED_PANEL = { isOpen: false, data: {} }

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
 * and saying why, where it used to vanish (QA F-23). Under 46rem of header
 * there is room for the tabs and one button, so the three controls are in its
 * menu: a phone had no Unread only and no Mark all read at all (QA F-24). The
 * header's own width decides, not the window's: beside an open panel (the
 * reading pane, STEP4 #6) a 1280 window leaves it about 600px, where the
 * controls pushed the Mentions badge out of sight.
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

    // The reading pane (STEP4 #6): the right panel, beside the Inbox, on any
    // screen wider than a phone. A phone opens a row as its page.
    // A store without the panel (a test's) reads as a closed one.
    const panelState = useSelector((s: RootState) => s.rightPanel?.rightPanelState) ?? CLOSED_PANEL
    const phone = usePhone()
    const placement = usePanelPlacement()
    const pane = useMemo<InboxPane | undefined>(
        () => (phone ? undefined : { panel: panelState, open: (target) => dispatch(openRightPanel(target)), close: () => dispatch(closeRightPanel()) }),
        [phone, panelState, dispatch],
    )

    // The SAME SWR key the list fetches for its first page, so the counts share
    // the cache (no extra request) and follow the server's read-state demotion.
    const { data: firstPage } = useFetch<UnifiedActivityPaginationRes>(inboxFeedKey(GetEndpointUrl.GetUnifiedActivity, INBOX_PAGE_SIZE))
    const items = useMemo(() => collapseEchoes((firstPage?.data?.activities ?? []).filter(hasSubject)), [firstPage])
    const counts = useMemo(() => {
        const unread = items.filter((a: UnifiedActivityItem) => isUnread(a, activityKey(a), read))
        return {
            priority: unread.filter((a) => a.priority === "high").length,
            all: unread.length,
            mentions: unread.filter(isMention).length,
        }
    }, [items, read])

    // The threads you follow that had a reply since you read them: a count of
    // their own (the Threads tab's), and nothing said if it can't be read.
    const { data: threadsUnread } = useFetch<{ data?: { unread?: number } }>(THREADS_UNREAD_KEY, undefined, undefined, OWN_ERRORS)
    const threadCount = typeof threadsUnread?.data?.unread === "number" ? threadsUnread.data.unread : 0

    const aiAvailable = useAIAvailable()

    const tabs = useMemo<HubTab[]>(
        () => [
            { value: "priority", label: "Priority", count: counts.priority },
            { value: "all", label: "All", count: counts.all },
            // A mention is you: its count is the brand badge.
            { value: "mentions", label: "Mentions", count: counts.mentions, badge: true },
            { value: "threads", label: "Threads", count: threadCount },
            // Only when there is AI to account for. On the AI-free edition, and
            // on v2 with AI switched off, the tab would advertise a subsystem
            // this server does not have.
            ...(aiAvailable ? [{ value: "ai", label: "Agents" }] : []),
        ],
        [counts, threadCount, aiAvailable],
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

    // The badge clears as the Inbox opens, and again each time its first page
    // answers while it's open: a notice that arrives now counts on the badge
    // (the realtime handler can't tell that the Inbox is open), then is read
    // in here and seen, so the badge said 1 beside the open Inbox.
    useEffect(() => {
        dispatch(setTotalUnreadActivityCount({ count: 0 }))
        // The sidenav cache carries this number too (services/unreadCache.ts).
        clearActivityUnread()
    }, [dispatch, firstPage])

    // What the Inbox shows is seen. Reading the feed marks nothing on the
    // server (Home reads it too), so the Inbox says so: once its first page
    // is on screen, and again when a newer one arrives while it's open.
    useEffect(() => {
        if (firstPage) void markActivitySeen()
    }, [firstPage])

    const feed = effectiveTab !== "ai"
    const threads = effectiveTab === "threads"
    // Mark all read: the feed's rows in view, or every thread you follow.
    const canMarkAll = threads ? threadCount > 0 : feed && unreadKeys.length > 0
    const markAll = useCallback(() => {
        if (threads) void readAllThreads().catch(() => {})
        else mark(unreadKeys, true)
    }, [threads, mark, unreadKeys])

    // Keys: 1-5 switch tabs, Shift+U marks all read (A1). Never while typing.
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            const t = e.target as HTMLElement | null
            if (e.metaKey || e.ctrlKey || e.altKey || t?.closest?.("input, textarea, [contenteditable=true], [role=dialog]")) return
            const n = Number(e.key)
            if (n >= 1 && n <= tabs.length) {
                setSelectedTab(tabs[n - 1].value as TabValue)
            } else if (e.key === "U" && e.shiftKey && canMarkAll) {
                markAll()
            }
        }
        window.addEventListener("keydown", onKey)
        return () => window.removeEventListener("keydown", onKey)
    }, [tabs, canMarkAll, markAll])

    // The Threads tab's first page, from the cache it shares with the list: is
    // there anything for the reading pane to open?
    const { data: threadsFirst } = useFetch<{ data?: { threads?: unknown[] } }>(threads ? CHAT_THREADS_PATH : "", undefined, undefined, OWN_ERRORS)
    const listed = threads ? (threadsFirst?.data?.threads?.length ?? 0) > 0 : items.length > 0

    return (
        <HubFrame
            icon={InboxIcon}
            title="Inbox"
            tabs={<HubTabs label="Inbox" tabs={tabs} value={effectiveTab} onChange={handleChangeTab} />}
            controls={
                <>
                    <label className="hidden items-center gap-2 text-xs text-ink-2 @[46rem]/hubhead:flex" title={feed ? undefined : RECORD_HAS_NO_UNREAD}>
                        Unread only
                        <Switch checked={feed && unreadOnly} onCheckedChange={setUnreadOnly} disabled={!feed} aria-label="Unread only" />
                        {feed ? null : <span className="sr-only">{RECORD_HAS_NO_UNREAD}</span>}
                    </label>
                    {canMarkAll ? (
                        <Button variant="ghost" size="sm" onClick={markAll} className="hidden @[46rem]/hubhead:inline-flex">
                            Mark all read
                        </Button>
                    ) : null}
                    {/* What reaches you, and how, is decided in settings. */}
                    <Link
                        href="/app/settings/notifications"
                        aria-label="Notification settings"
                        title="Notification settings"
                        className="hidden size-7 place-items-center rounded-md text-ink-3 transition-colors hover:bg-hover hover:text-foreground focus-visible:outline-2 focus-visible:outline-brand @[46rem]/hubhead:grid [&_svg]:size-4"
                    >
                        <SlidersHorizontal aria-hidden="true" />
                    </Link>
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <button
                                type="button"
                                aria-label="Inbox options"
                                data-touch-target=""
                                className="grid size-7 place-items-center rounded-md text-ink-3 transition-colors hover:bg-hover hover:text-foreground focus-visible:outline-2 focus-visible:outline-brand @[46rem]/hubhead:hidden [&_svg]:size-4"
                            >
                                <SlidersHorizontal aria-hidden="true" />
                            </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-56">
                            <DropdownMenuCheckboxItem checked={feed && unreadOnly} onCheckedChange={(on) => setUnreadOnly(on === true)} disabled={!feed}>
                                Unread only
                            </DropdownMenuCheckboxItem>
                            {feed ? null : <p className="px-2 pb-1.5 text-meta text-ink-3">{RECORD_HAS_NO_UNREAD}</p>}
                            {canMarkAll ? <DropdownMenuItem onSelect={markAll}>Mark all read</DropdownMenuItem> : null}
                            <DropdownMenuSeparator />
                            <DropdownMenuItem asChild>
                                <Link href="/app/settings/notifications">Notification settings</Link>
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                </>
            }
        >
            <div data-inbox-body="" className="@container/inbox flex min-h-0 flex-1">
                {/* Every tab draws in the same frame (activityFeedFrame); a tab
                    switch cross-fades the column, nothing else moves. On a phone
                    the column is a list frame, so each tab's list ends clear of
                    the tab bar (app/phone.css F6). */}
                <div key={effectiveTab} data-list-frame="" className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
                    {threads ? (
                        <ThreadsList unreadOnly={unreadOnly} onShowAll={() => setUnreadOnly(false)} pane={pane} />
                    ) : feed ? (
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
                                pane={pane}
                            />
                        </>
                    ) : (
                        <MyAIActivityCard variant="feed" />
                    )}
                </div>
                {/* Where the panel opens beside the page and the sheet has room
                    for both, the room it will take says what opens there. */}
                {feed && pane && placement === "beside" && !panelState.isOpen && listed ? <ReadingPaneHint /> : null}
            </div>
        </HubFrame>
    )
}

/**
 * The reading pane before anything is open in it (STEP4 #6): the right side of
 * a wide Inbox, sized as the panel that will open there (a thread's 420px, the
 * commonest, or the room past the list's 760px column), so opening a row
 * barely moves the list.
 */
function ReadingPaneHint() {
    return (
        <aside
            data-reading-pane=""
            aria-label="Reading pane"
            className="my-3 mr-3 hidden shrink-0 flex-col items-center justify-center gap-3 rounded-lg bg-sunken px-6 text-center ring-1 ring-inset ring-line @[60rem]/inbox:flex"
            style={{ width: "max(420px, calc(100% - 788px))" }}
        >
            <HubSpot kind="message" size={56} />
            <p className="text-ui font-medium text-foreground">Threads, tasks and events open here</p>
            <p className="flex flex-wrap items-center justify-center gap-1 text-meta text-ink-3">
                <kbd className="kbd">J</kbd>
                <kbd className="kbd">K</kbd>
                <span className="mr-1.5">to move</span>
                <kbd className="kbd">Enter</kbd>
                <span className="mr-1.5">to open</span>
                <kbd className="kbd">U</kbd>
                <span>to mark read</span>
            </p>
        </aside>
    )
}

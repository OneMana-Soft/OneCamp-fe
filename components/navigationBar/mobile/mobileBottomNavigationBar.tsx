"use client"

import { bottomNavTab, pageOwnsBottomEdge } from "@/lib/utils/mobileBottomNav"
import { Hash, Home, Inbox, MessageCircle, MoreHorizontal } from "@/lib/icons"
import { usePathname } from "next/navigation"
import { feedback } from "@/lib/ui/feedback"
import Link from "next/link"
import { useSelector } from "react-redux"
import { RootState } from "@/store/store"
import { useEffect, useMemo, useRef, useState } from "react"
import { formatCount } from "@/lib/utils/helpers/formatCount"
import { UserProfileDrawer } from "@/components/drawers/userProfileDrawer"
import { cn } from "@/lib/utils/helpers/cn"
import type { LucideIcon } from "lucide-react"

interface NavItem {
    icon: LucideIcon
    label: string
    /** The spoken name, when the label is shortened to fit the bar. */
    name?: string
    page: string
    /** Optional unread key — read from sidebar state */
    unreadKey?: "dm" | "channel" | "activity"
    /** How unread shows: a count, or a 7px dot (plain unread, no number to read). */
    unreadAs?: "count" | "dot"
    /** Glyphs with an inside (the house, the tray) fill in the accent when active; the rest stroke in it. */
    fills?: boolean
}

const NAV_ITEMS: NavItem[] = [
    { icon: Home, label: "Home", page: "app/home", fills: true },
    { icon: Hash, label: "Channels", page: "app/channel", unreadKey: "channel", unreadAs: "dot" },
    // The place is "Direct messages" (the page title says so); the bar has 72px
    // a cell at 360 wide, where those words at 11px run to about 80, so the
    // label is the desktop sidebar's short form and the full name is spoken.
    { icon: MessageCircle, label: "DMs", name: "Direct messages", page: "app/chat", unreadKey: "dm" },
    // Deliberately NO Search tab. Search already has a first-class entry point on
    // mobile: the phone top bar's search opens the palette (design v3), which
    // runs the same unified search as desktop and hands off to /app/search
    // where the AI answer and connector results live. A sixth cell
    // would buy one tap from the other tabs and cost ~60px per cell at 360px,
    // past the 5-destination ceiling every mobile convention lands on. If search
    // needs to be closer from Channels/DMs/Activity, the cheaper move is a
    // search icon in those screens' top bar, not another primary destination.
    // Notifications and nudges (design v3, N1): the page that was Activity.
    { icon: Inbox, label: "Inbox", page: "app/inbox", unreadKey: "activity", fills: true },
]

/**
 * The current Inbox tab's glyph: the tray filled in the accent with its rim
 * cut across it in the bar's colour. Lucide draws the rim first, so filling
 * its icon covered the rim and the tray read as a blob.
 */
function InboxFilled() {
    return (
        <svg data-tab-icon="" viewBox="0 0 24 24" aria-hidden="true" className="h-[22px] w-[22px] text-brand fill-brand">
            <path stroke="currentColor" strokeWidth="1.36" strokeLinejoin="round" d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
            <polyline points="21 12 16 12 14 15 10 15 8 12 3 12" fill="none" stroke="var(--raised)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    )
}

/**
 * The page's scroller, for a tap on the tab you are already on: the iOS
 * convention (Slack, Telegram, Mail) is that it takes you back to the top.
 */
export function scrollTabToTop(win: Window = window): boolean {
    const scroller = win.document.querySelector<HTMLElement>("[data-app-scroller]")
    if (!scroller || scroller.scrollTop <= 0) return false
    const reduced = typeof win.matchMedia === "function" && win.matchMedia("(prefers-reduced-motion: reduce)").matches
    scroller.scrollTo({ top: 0, behavior: reduced ? "auto" : "smooth" })
    return true
}

/**
 * A badge or dot that has just appeared (not one that was there when the
 * page loaded) springs in: 0 -> 1.15 -> 1 over 260ms (design v3, mobile C1).
 */
function useFresh(shown: boolean): boolean {
    const was = useRef<boolean | null>(null)
    const [fresh, setFresh] = useState(false)
    useEffect(() => {
        if (was.current === false && shown) setFresh(true)
        if (!shown) setFresh(false)
        was.current = shown
    }, [shown])
    return fresh
}

function TabMark({ unread, as }: { unread: number; as: "count" | "dot" }) {
    const fresh = useFresh(unread > 0)
    if (unread <= 0) return null
    return as === "dot"
        ? <span data-tab-dot="" data-fresh={fresh || undefined} className="phone-tab-dot" />
        : <span data-tab-badge="" data-fresh={fresh || undefined} className="phone-tab-badge">{formatCount(unread)}</span>
}

export function MobileBottomNavigationBar() {
    const pathname = usePathname()
    const [drawerOpen, setDrawerOpen] = useState(false)

    // Which surfaces own the bottom edge of the screen.
    //
    // The rule used to be depth: more than two segments and the bar disappeared.
    // That is right for a channel or a chat, where a composer sits on the bottom
    // edge and a nav bar would fight it, and wrong for everything else that
    // happens to be nested. Settings pages are two segments deep, so a phone
    // arriving at /app/settings/connectors lost the bottom bar, and the top bar had
    // no case for it either, so there was no title and no back button. The only
    // way out of the page was the browser gesture.
    //
    // Naming the surfaces that genuinely need the space inverts the default: a
    // page added later keeps its navigation unless somebody decides otherwise.
    // That is the safer of the two defaults, because the failure mode of this
    // one is a redundant bar rather than a dead end.
    // The list, and why each entry is on it: lib/utils/mobileBottomNav.ts.
    const isVisible = !pageOwnsBottomEdge(pathname)
    const currentTab = bottomNavTab(pathname, NAV_ITEMS.map((it) => it.page))

    // The tab you move to lands with a small spring (the playful layer's
    // animate-spring, 1 -> 1.12 -> 1 over 220ms): on a change of tab only,
    // never when a page loads, and still under prefers-reduced-motion.
    const shownTab = useRef(currentTab)
    const [springTab, setSpringTab] = useState<string | null>(null)
    useEffect(() => {
        if (shownTab.current === currentTab) return
        shownTab.current = currentTab
        setSpringTab(currentTab)
    }, [currentTab])

    const userSidebarState = useSelector((state: RootState) => state.users.userSidebar)

    const totalDMUnread = useMemo(
        () =>
            (userSidebarState.userChats || []).reduce(
                (acc, chat) => acc + (chat.dm_unread || 0),
                0,
            ),
        [userSidebarState.userChats],
    )

    const totalChannelUnread = useMemo(
        () =>
            (userSidebarState.userChannels || []).reduce(
                (acc, channel) => acc + (channel.unread_post_count || 0),
                0,
            ),
        [userSidebarState.userChannels],
    )

    const getUnreadCount = (key?: NavItem["unreadKey"]) => {
        switch (key) {
            case "activity":
                return userSidebarState.totalUnreadActivityCount
            case "dm":
                return totalDMUnread
            case "channel":
                return totalChannelUnread
            default:
                return 0
        }
    }

    return (
        <>
            <nav
                aria-label="Primary"
                // Off screen on a page that owns the bottom edge, and out of the
                // tab order with it: translated away, its tabs still took focus.
                inert={!isVisible}
                aria-hidden={!isVisible || undefined}
                // Hides in 240ms and returns in 300ms on the push curve
                // (app/phone.css, design v3 mobile C1).
                data-hidden={!isVisible || undefined}
                className={cn(
                    "phone-tabbar fixed bottom-0 left-0 right-0 z-[var(--z-fixed)]",
                    isVisible ? "translate-y-0" : "translate-y-full",
                )}
                style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
            >
                {/* Design v3, Ph2 and mobile C1: 56px; each cell a 22px glyph
                    in a 44x28 capsule, 3px, then the 11/14 label. The current
                    place fills its capsule with the accent at 10% and its glyph
                    in the accent (filled where the glyph has an inside: home,
                    the inbox tray); its label goes ink. The rest are ink-3.
                    No grey block flashes across a cell: the capsule dips. */}
                <ul className="grid grid-cols-5 items-stretch h-14 w-full">
                    {NAV_ITEMS.map(({ icon: Icon, label, name, page, unreadKey, unreadAs = "count", fills }) => {
                        const isActive = currentTab === page
                        const unread = getUnreadCount(unreadKey)
                        return (
                            <li key={page} className="contents">
                                {/* A link, prefetched: a tab is navigation, and a
                                    button that pushed the route waited for the
                                    route's code after the tap instead of before. */}
                                <Link
                                    href={`/${page}`}
                                    prefetch={true}
                                    aria-current={isActive ? "page" : undefined}
                                    aria-label={name ?? label}
                                    data-press="tab"
                                    onClick={(e) => {
                                        // The tab you are on, at its root: back to
                                        // the top of the list instead of nowhere.
                                        if (pathname === `/${page}` && scrollTabToTop()) e.preventDefault()
                                    }}
                                    className={cn(
                                        "relative flex flex-col items-center justify-center gap-[3px] h-full",
                                        "transition-colors duration-[140ms]",
                                        "focus-visible:outline-none [&:focus-visible>.phone-tab-cap]:ring-2 [&:focus-visible>.phone-tab-cap]:ring-brand",
                                        isActive ? "text-ink" : "text-ink-3",
                                    )}
                                >
                                    <span
                                        className={cn("phone-tab-cap", springTab === page && "animate-spring")}
                                        onAnimationEnd={() => setSpringTab(null)}
                                    >
                                        {isActive && page === "app/inbox" ? <InboxFilled /> : <Icon
                                            data-tab-icon=""
                                            className={cn(
                                                "h-[22px] w-[22px]",
                                                isActive && "text-brand",
                                                isActive && fills && "fill-brand",
                                            )}
                                        />}
                                        <TabMark unread={unread} as={unreadAs} />
                                    </span>
                                    <span className="phone-tab-label text-3xs font-medium">
                                        {label}
                                    </span>
                                </Link>
                            </li>
                        )
                    })}
                    <li className="contents">
                        <button
                            type="button"
                            onClick={(e) => {
                                setDrawerOpen(true)
                                feedback("selection", e.currentTarget.firstElementChild)
                            }}
                            aria-label="Open menu"
                            aria-current={currentTab === "more" ? "page" : undefined}
                            data-press="tab"
                            className={cn(
                                "flex flex-col items-center justify-center gap-[3px] h-full",
                                "transition-colors duration-[140ms]",
                                "focus-visible:outline-none [&:focus-visible>.phone-tab-cap]:ring-2 [&:focus-visible>.phone-tab-cap]:ring-brand",
                                currentTab === "more" ? "text-ink" : "text-ink-3",
                            )}
                        >
                            <span
                                className={cn("phone-tab-cap", springTab === "more" && "animate-spring")}
                                onAnimationEnd={() => setSpringTab(null)}
                            >
                                <MoreHorizontal className={cn("h-[22px] w-[22px]", currentTab === "more" && "text-brand")} />
                            </span>
                            <span className="phone-tab-label text-3xs font-medium">More</span>
                        </button>
                    </li>
                </ul>
            </nav>
            <UserProfileDrawer drawerOpenState={drawerOpen} setOpenState={setDrawerOpen} />
        </>
    )
}

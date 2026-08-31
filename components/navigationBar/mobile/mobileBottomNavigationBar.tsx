"use client"

import { Bell, Hash, Home, MessageCircle, MoreHorizontal } from "@/lib/icons"
import { usePathname, useRouter } from "next/navigation"
import { useSelector } from "react-redux"
import { RootState } from "@/store/store"
import { useMemo, useState } from "react"
import { formatCount } from "@/lib/utils/helpers/formatCount"
import { UserProfileDrawer } from "@/components/drawers/userProfileDrawer"
import { cn } from "@/lib/utils/helpers/cn"
import type { LucideIcon } from "lucide-react"

interface NavItem {
    icon: LucideIcon
    label: string
    page: string
    /** Optional unread key — read from sidebar state */
    unreadKey?: "dm" | "channel" | "activity"
}

const NAV_ITEMS: NavItem[] = [
    { icon: Home, label: "Home", page: "app/home" },
    { icon: Hash, label: "Channels", page: "app/channel", unreadKey: "channel" },
    { icon: MessageCircle, label: "Chats", page: "app/chat", unreadKey: "dm" },
    // Deliberately NO Search tab. Search already has a first-class entry point on
    // mobile: MobileHomeSearchBar sits above the fold on the Home tab, runs the
    // same unified GlobalSearchGet as desktop, and submitting hands off to
    // /app/search where the AI answer and connector results live. A sixth cell
    // would buy one tap from the other tabs and cost ~60px per cell at 360px,
    // past the 5-destination ceiling every mobile convention lands on. If search
    // needs to be closer from Channels/Chats/Activity, the cheaper move is a
    // search icon in those screens' top bar, not another primary destination.
    { icon: Bell, label: "Activity", page: "app/activity", unreadKey: "activity" },
]

export function MobileBottomNavigationBar() {
    const pathname = usePathname()
    const router = useRouter()
    const path = pathname.slice(1)
    const [drawerOpen, setDrawerOpen] = useState(false)

    // Which surfaces own the bottom edge of the screen.
    //
    // The rule used to be depth: more than two segments and the bar disappeared.
    // That is right for a channel or a chat, where a composer sits on the bottom
    // edge and a nav bar would fight it, and wrong for everything else that
    // happens to be nested. Settings pages are two segments deep, so a phone
    // arriving at /app/settings/agents lost the bottom bar, and the top bar had
    // no case for it either, so there was no title and no back button. The only
    // way out of the page was the browser gesture.
    //
    // Naming the surfaces that genuinely need the space inverts the default: a
    // page added later keeps its navigation unless somebody decides otherwise.
    // That is the safer of the two defaults, because the failure mode of this
    // one is a redundant bar rather than a dead end.
    const BOTTOM_OWNED_BY_PAGE = [
        /^\/app\/channel\/[^/]+/,     // message composer
        /^\/app\/chat\/[^/]+/,        // message composer, DM and group
        /^\/app\/doc\/[^/]+/,         // editor toolbar
        /^\/app\/board\/[^/]+/,       // canvas
        /^\/app\/task\/[^/]+/,        // detail view with its own action row
        /^\/app\/tables\/[^/]+/,      // grid that scrolls both ways
        /^\/app\/calendar\/event\//, // detail view
        /^\/app\/meet\//,             // a call owns the whole screen
        /^\/app\/create\//,           // form with a submit bar
        /^\/app\/forward\//,          // send bar
    ]
    const isVisible = !BOTTOM_OWNED_BY_PAGE.some((r) => r.test(pathname))

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
                className={cn(
                    "fixed bottom-0 left-0 right-0 z-[var(--z-fixed)]",
                    "bg-background/85 backdrop-blur-xl border-t border-border/60",
                    "transition-transform duration-300 ease-out",
                    isVisible ? "translate-y-0" : "translate-y-full",
                )}
                style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
            >
                <ul className="grid grid-cols-5 items-stretch h-14 w-full">
                    {NAV_ITEMS.map(({ icon: Icon, label, page, unreadKey }) => {
                        const isActive = path === page
                        const unread = getUnreadCount(unreadKey)
                        return (
                            <li key={page} className="contents">
                                <button
                                    type="button"
                                    onClick={() => router.push(`/${page}`)}
                                    aria-current={isActive ? "page" : undefined}
                                    aria-label={label}
                                    className={cn(
                                        "flex flex-col items-center justify-center gap-1 h-full",
                                        "transition-colors duration-100",
                                        "active:bg-accent/40",
                                        isActive
                                            ? "text-foreground"
                                            : "text-muted-foreground hover:text-foreground",
                                    )}
                                >
                                    <span className="relative">
                                        <Icon
                                            className={cn(
                                                "h-[22px] w-[22px] transition-transform duration-100",
                                                isActive && "scale-105",
                                            )}
                                            strokeWidth={isActive ? 2.25 : 1.75}
                                        />
                                        {unread > 0 && (
                                            <span
                                                className={cn(
                                                    "absolute -top-1.5 -right-2 inline-flex h-4 min-w-4 px-1",
                                                    "items-center justify-center rounded-full",
                                                    "bg-primary text-3xs font-semibold text-primary-foreground",
                                                    "ring-2 ring-background",
                                                )}
                                            >
                                                {formatCount(unread)}
                                            </span>
                                        )}
                                    </span>
                                    <span
                                        className={cn(
                                            "text-3xs leading-none",
                                            isActive ? "font-semibold" : "font-medium",
                                        )}
                                    >
                                        {label}
                                    </span>
                                </button>
                            </li>
                        )
                    })}
                    <li className="contents">
                        <button
                            type="button"
                            onClick={() => setDrawerOpen(true)}
                            aria-label="Open menu"
                            className={cn(
                                "flex flex-col items-center justify-center gap-1 h-full",
                                "text-muted-foreground hover:text-foreground transition-colors duration-100",
                                "active:bg-accent/40",
                            )}
                        >
                            <MoreHorizontal className="h-[22px] w-[22px]" strokeWidth={1.75} />
                            <span className="text-3xs font-medium leading-none">More</span>
                        </button>
                    </li>
                </ul>
            </nav>
            <UserProfileDrawer drawerOpenState={drawerOpen} setOpenState={setDrawerOpen} />
        </>
    )
}

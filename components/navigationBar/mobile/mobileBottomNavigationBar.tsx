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
    { icon: Bell, label: "Activity", page: "app/activity", unreadKey: "activity" },
]

export function MobileBottomNavigationBar() {
    const pathname = usePathname()
    const router = useRouter()
    const path = pathname.slice(1)
    const [drawerOpen, setDrawerOpen] = useState(false)

    const pathLength = path.split("/").length
    const isVisible = pathLength <= 2 || pathname.startsWith("/app/team/")

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
                                                    "bg-primary text-[9px] font-semibold text-primary-foreground",
                                                    "ring-2 ring-background",
                                                )}
                                            >
                                                {formatCount(unread)}
                                            </span>
                                        )}
                                    </span>
                                    <span
                                        className={cn(
                                            "text-[10.5px] leading-none",
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
                            <span className="text-[10.5px] font-medium leading-none">More</span>
                        </button>
                    </li>
                </ul>
            </nav>
            <UserProfileDrawer drawerOpenState={drawerOpen} setOpenState={setDrawerOpen} />
        </>
    )
}

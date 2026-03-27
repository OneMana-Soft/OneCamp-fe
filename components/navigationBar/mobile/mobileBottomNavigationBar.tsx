"use client";

import { Bell, Home, MessageCircle, Sparkles, MoreHorizontal } from "lucide-react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import {useSelector} from "react-redux";
import {RootState} from "@/store/store";
import {useMemo, useState} from "react";
import {formatCount} from "@/lib/utils/helpers/formatCount";
import {UserProfileDrawer} from "@/components/drawers/userProfileDrawer";

const navIcons = [
    {
        icon: Home,
        label: "Home",
        page: "app/home",
    },
    {
        icon: MessageCircle,
        label: "DMs",
        page: "app/chat",
    },
    {
        icon: Bell,
        label: "Activity",
        page: "app/activity",
    },
    {
        icon: Sparkles,
        label: "AI",
        page: "app/ai",
    },
];

export function MobileBottomNavigationBar() {
    const pathname = usePathname();
    const path = pathname.slice(1);
    const [drawerOpen, setDrawerOpen] = useState(false);

    const pathLength = path.split('/').length;

    const userSidebarState = useSelector((state: RootState) => state.users.userSidebar)

    const totalDMUnread = useMemo(() => 
        (userSidebarState.userChats || []).reduce((acc, chat) => acc + (chat.dm_unread || 0), 0),
        [userSidebarState.userChats]
    );

    const getUnreadCount = (label: string) => {
        switch (label) {
            case "Activity":
                return userSidebarState.totalUnreadActivityCount;
            case "DMs":
                return totalDMUnread;
            default:
                return 0;
        }
    };

    if (pathLength > 2 && !pathname.startsWith('/app/team/')) return null;

    return (
        <>
            <div 
                className="w-full z-40 border-t-2 bg-sidebar border-primary/50 backdrop-blur"
                style={{ 
                    paddingBottom: 'env(safe-area-inset-bottom)',
                    minHeight: 'calc(5rem + env(safe-area-inset-bottom))'
                }}
            >
                <div className="grid grid-cols-5 items-center h-full w-full">
                    {navIcons.map(({ icon: Icon, label, page }) => (
                        <Link
                            key={page}
                            href={`/${page}`}
                            className={`col-span-1 flex items-center justify-center h-full ${
                                path === page ? "border-t-4 border-primary/50 bg-primary/20 " : "text-muted-foreground"
                            }`}
                        >
                            <div className="flex space-y-2 flex-col items-center relative">
                                <Icon />
                                {getUnreadCount(label) > 0 && (
                                    <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white shadow-sm ring-2 ring-background">
                                        {formatCount(getUnreadCount(label))}
                                    </span>
                                )}
                                <div className="text-xs">{label}</div>
                            </div>
                        </Link>
                    ))}
                    {/* More button — opens drawer */}
                    <button
                        onClick={() => setDrawerOpen(true)}
                        className="col-span-1 flex items-center justify-center h-full text-muted-foreground"
                    >
                        <div className="flex space-y-2 flex-col items-center">
                            <MoreHorizontal />
                            <div className="text-xs">More</div>
                        </div>
                    </button>
                </div>
            </div>
            <UserProfileDrawer drawerOpenState={drawerOpen} setOpenState={setDrawerOpen} />
        </>
    );
}
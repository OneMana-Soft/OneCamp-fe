"use client";

import { Bell, ClipboardCheck, Home, MessageCircle, Users, Calendar } from "lucide-react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import {useSelector} from "react-redux";
import {RootState} from "@/store/store";
import {useMemo} from "react";
import {formatCount} from "@/lib/utils/helpers/formatCount";

const navIcons = [
    {
        icon: Home,
        label: "Home",
        page: "app/home",
    },
    {
        icon: Users,
        label: "Channels",
        page: "app/channel",
    },
    {
        icon: Bell,
        label: "Activity",
        page: "app/activity",
    },
    {
        icon: MessageCircle,
        label: "Dm's",
        page: "app/chat",
    },
    {
        icon: ClipboardCheck,
        label: "My Tasks",
        page: "app/myTask",
    },
    {
        icon: Calendar,
        label: "Calendar",
        page: "app/calendar",
    },
];

export function MobileBottomNavigationBar() {
    const pathname = usePathname();
    const path = pathname.slice(1);

    const pathLength = path.split('/').length;

    const userSidebarState = useSelector((state: RootState) => state.users.userSidebar)

    const totalChannelUnread = useMemo(() => 
        (userSidebarState.userChannels || []).reduce((acc, channel) => acc + (channel.unread_post_count || 0), 0),
        [userSidebarState.userChannels]
    );

    const totalDMUnread = useMemo(() => 
        (userSidebarState.userChats || []).reduce((acc, chat) => acc + (chat.dm_unread || 0), 0),
        [userSidebarState.userChats]
    );

    const getUnreadCount = (label: string) => {
        switch (label) {
            case "Channels":
                return totalChannelUnread;
            case "Activity":
                return userSidebarState.totalUnreadActivityCount;
            case "Dm's":
                return totalDMUnread;
            default:
                return 0;
        }
    };

    if (pathLength > 2 && !pathname.startsWith('/app/team/')) return null;

    return (
        <div 
            className="w-full z-40 border-t-2 bg-sidebar border-primary/50 backdrop-blur"
            style={{ 
                paddingBottom: 'env(safe-area-inset-bottom)',
                minHeight: 'calc(5rem + env(safe-area-inset-bottom))'
            }}
        >
            <div className="grid grid-cols-6 items-center h-full w-full">
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
            </div>
        </div>
    );
}
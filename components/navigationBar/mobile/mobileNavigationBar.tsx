"use client"

import {MobileTopNavigationBar} from "@/components/navigationBar/mobile/mobileTopNavigationBar";
import {MobileBottomNavigationBar} from "@/components/navigationBar/mobile/mobileBottomNavigationBar";
import { cn } from "@/lib/utils/helpers/cn";
import { useHydrateUserSidebar } from "@/hooks/useHydrateUserSidebar";

export function MobileNavigationBar({
                                               children,
                                               disableBottomPadding = false,
                                           }: Readonly<{
    children: React.ReactNode;
    disableBottomPadding?: boolean;
}>) {

    // Seed + keep-fresh the sidebar unread counts (channels/DMs/activity) that
    // the bottom nav badges read. Without this the mobile PWA never hydrates
    // the authoritative counts (that seeding used to live only in the desktop
    // nav), so the badges drifted and were never correct.
    useHydrateUserSidebar();

    return (
        <>
            <div className="flex flex-col h-dvh overscroll-none">
                <MobileTopNavigationBar/>

                <div className={cn(
                    "flex-1 overflow-y-auto",
                    !disableBottomPadding && "pb-[calc(4rem+env(safe-area-inset-bottom))]"
                )}>
                    {children}
                </div>

                <MobileBottomNavigationBar />
            </div>
        </>
    );
}
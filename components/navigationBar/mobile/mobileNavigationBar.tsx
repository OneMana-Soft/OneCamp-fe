"use client"

import {MobileTopNavigationBar} from "@/components/navigationBar/mobile/mobileTopNavigationBar";
import {MobileBottomNavigationBar} from "@/components/navigationBar/mobile/mobileBottomNavigationBar";
import { cn } from "@/lib/utils/helpers/cn";
import { useHydrateUserSidebar } from "@/hooks/useHydrateUserSidebar";
import { usePathname } from "next/navigation";
import { pageOwnsBottomEdge } from "@/lib/utils/mobileBottomNav";

export function MobileNavigationBar({
                                               children,
                                               banners,
                                               disableBottomPadding = false,
                                           }: Readonly<{
    children: React.ReactNode;
    /**
     * Notices for the whole app (the shared-demo note, an admin's disk
     * warning). They take their own height above the page, the way the
     * desktop shell stacks them above its sheet.
     */
    banners?: React.ReactNode;
    disableBottomPadding?: boolean;
}>) {

    // Seed + keep-fresh the sidebar unread counts (channels/DMs/activity) that
    // the bottom nav badges read. Without this the mobile PWA never hydrates
    // the authoritative counts (that seeding used to live only in the desktop
    // nav), so the badges drifted and were never correct.
    useHydrateUserSidebar();
    // No room kept for a bottom bar that this page hides.
    const pathname = usePathname();
    const noBottomBar = disableBottomPadding || pageOwnsBottomEdge(pathname ?? "");

    return (
        <>
            {/* The app's frame: fitted to what the keyboard leaves while it is
                up (lib/ui/visualViewport.ts, globals.css). */}
            <div data-app-viewport="" className="flex flex-col h-dvh overscroll-none">
                <MobileTopNavigationBar/>

                {/* Notices sit ABOVE the page's scroller, not inside it. A channel,
                    a DM or a task is a full-height column with its composer on
                    the bottom edge; a notice in the same scroller pushed that
                    column down by its own height, so a visitor's first task
                    had its last fields cut off and its comment box below the
                    screen. */}
                {banners ? <div data-app-banners="" className="shrink-0">{banners}</div> : null}

                {/* overflow-x-hidden: overflow-y-auto alone makes x scroll too,
                    so a page drawn a few pixels too wide (the AI page was 406
                    in 390) made the whole screen pan sideways under the thumb. */}
                <div data-app-scroller="" className={cn(
                    "flex-1 min-h-0 overflow-y-auto overflow-x-hidden",
                    !noBottomBar && "pb-[calc(4rem+env(safe-area-inset-bottom))]"
                )}>
                    {children}
                </div>

                <MobileBottomNavigationBar />
            </div>
        </>
    );
}
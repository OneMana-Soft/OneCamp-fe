"use client"

import {MobileTopNavigationBar} from "@/components/navigationBar/mobile/mobileTopNavigationBar";
import {MobileBottomNavigationBar} from "@/components/navigationBar/mobile/mobileBottomNavigationBar";
import { cn } from "@/lib/utils/helpers/cn";
import { useHydrateUserSidebar } from "@/hooks/useHydrateUserSidebar";
import { usePathname } from "next/navigation";
import { useAppRouter } from "@/lib/navigation/appRouter";
import { pageOwnsBottomEdge } from "@/lib/utils/mobileBottomNav";
import { SheetProgressBar } from "@/context/LoadingContext";
import { useCallback, useEffect, useRef, useState } from "react";
import { isTabRoot, usePhoneTransition } from "@/components/navigationBar/mobile/phoneTransition";
import { useEdgeBack } from "@/components/navigationBar/mobile/edgeBack";
import { PullIndicator, usePullToRefresh } from "@/components/ui/pullToRefresh";
import { goBack } from "@/lib/navigation/back";
import { refreshOnScreen } from "@/lib/ui/refreshOnScreen";
import { toast } from "@/hooks/use-toast";

/** The top bar's title, which follows the page in on a push or a pop. */
const TITLE_SELECTOR = "[data-phone-bar] > :nth-child(2)";

/**
 * The tab lists that open on a large title (design v3, mobile C2). Home has
 * its greeting instead. The words are the top bar's own titles for these
 * routes, which take over once the large one scrolls up under the bar.
 */
export const LARGE_TITLES: Record<string, string> = {
    "/app/channel": "Channels",
    "/app/chat": "Direct messages",
    "/app/inbox": "Inbox",
};


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
    const pathname = usePathname() ?? "";
    const router = useAppRouter();
    const noBottomBar = disableBottomPadding || pageOwnsBottomEdge(pathname);
    // A tab's root: the theme's glow under the top bar, pull to refresh, and
    // nowhere for an edge swipe to go back to.
    const tabRoot = isTabRoot(pathname);

    // Whether the page has moved off its top, for the top bar's hairline
    // (design v3, Ph1). A 1px sentinel at the top of the scroller, watched
    // against the scroller: no scroll listener, nothing on the scroll path.
    const scrollerRef = useRef<HTMLDivElement>(null);
    const sentinelRef = useRef<HTMLDivElement>(null);
    const [scrolled, setScrolled] = useState(false);
    useEffect(() => {
        const root = scrollerRef.current;
        const sentinel = sentinelRef.current;
        if (!root || !sentinel || typeof IntersectionObserver === "undefined") return;
        const io = new IntersectionObserver(([entry]) => setScrolled(!entry.isIntersecting), { root, threshold: 0 });
        io.observe(sentinel);
        return () => io.disconnect();
    }, []);

    // The large title on a tab's list: the bar's own title comes in once the
    // large one has gone up under the bar (C2). Watched, not scroll-listened.
    const largeTitle = LARGE_TITLES[pathname.replace(/\/+$/, "")];
    const largeRef = useRef<HTMLParagraphElement>(null);
    const [largePassed, setLargePassed] = useState(false);
    useEffect(() => {
        setLargePassed(false);
        const root = scrollerRef.current;
        const el = largeRef.current;
        if (!root || !el || typeof IntersectionObserver === "undefined") return;
        // Passed when its lower half (the baseline) is under the bar.
        const io = new IntersectionObserver(([entry]) => setLargePassed(!entry.isIntersecting), { root, threshold: 0, rootMargin: "-18px 0px 0px 0px" });
        io.observe(el);
        return () => io.disconnect();
    }, [largeTitle]);

    // What a toast on a phone sits above (app/phone.css, design v3 mobile C9):
    // the tab bar by default; on a page that owns the bottom edge, its
    // composer (DraggableDrawer publishes --mobile-drawer-h), or the home
    // indicator's strip.
    useEffect(() => {
        const root = document.documentElement;
        if (noBottomBar) root.style.setProperty("--phone-floor", "var(--mobile-drawer-h, env(safe-area-inset-bottom))");
        else root.style.removeProperty("--phone-floor");
        return () => {
            root.style.removeProperty("--phone-floor");
        };
    }, [noBottomBar]);

    // Push and pop (design v3, mobile C4): the new page comes in, never held.
    usePhoneTransition(scrollerRef, TITLE_SELECTOR, pathname);

    // The installed app's edge swipe back (C4.4), where iOS gives none.
    const viewportRef = useRef<HTMLDivElement>(null);
    const back = useCallback(() => goBack(router, pathname), [router, pathname]);
    useEdgeBack(scrollerRef, viewportRef, !tabRoot, back);

    // Pull to refresh on a tab's list (L4).
    const pull = usePullToRefresh(scrollerRef, {
        enabled: tabRoot,
        onRefresh: refreshOnScreen,
        onError: () => toast({ title: "Couldn't refresh", description: "Check the connection, then pull again.", tone: "error" }),
    });

    return (
        <>
            {/* The app's frame: fitted to what the keyboard leaves while it is
                up (lib/ui/visualViewport.ts, globals.css). */}
            {/* data-vaul-drawer-wrapper: a large sheet pushes this back as a
                card behind it (design v3, mobile C5). */}
            <div ref={viewportRef} data-app-viewport="" data-vaul-drawer-wrapper="" className="flex flex-col h-dvh overscroll-none bg-sheet">
                <MobileTopNavigationBar scrolled={scrolled} glow={tabRoot} large={!!largeTitle} largePassed={largePassed}/>
                {/* The progress bar under the top bar (design v3, shell §L2). */}
                <div className="relative h-0 shrink-0"><SheetProgressBar className="!left-0 !right-0 !rounded-none" /></div>

                {/* Notices sit ABOVE the page's scroller, not inside it. A channel,
                    a DM or a task is a full-height column with its composer on
                    the bottom edge; a notice in the same scroller pushed that
                    column down by its own height, so a visitor's first task
                    had its last fields cut off and its comment box below the
                    screen. */}
                {banners ? <div data-app-banners="" className="shrink-0">{banners}</div> : null}

                {/* The pull's ring, in the space the content uncovers. */}
                <div className="relative h-0 shrink-0"><PullIndicator {...pull} /></div>

                {/* overflow-x-hidden: overflow-y-auto alone makes x scroll too,
                    so a page drawn a few pixels too wide (the AI page was 406
                    in 390) made the whole screen pan sideways under the thumb. */}
                {/* data-large-passed: the page's own strip under a large title
                    stays clear over the glow until the title has gone up
                    under the bar (app/phone.css). */}
                <div ref={scrollerRef} data-app-scroller="" data-glow={tabRoot || undefined} data-large-passed={largeTitle ? (largePassed ? "true" : "false") : undefined} className={cn(
                    "flex-1 min-h-0 overflow-y-auto overflow-x-hidden",
                    !noBottomBar && "pb-[var(--phone-scroll-end)]"
                )}>
                    <div ref={sentinelRef} aria-hidden="true" data-scroll-sentinel="" className="h-px -mb-px" />
                    {/* Spoken once, by the bar: this is the same words, drawn large. */}
                    {largeTitle && (
                        <p ref={largeRef} aria-hidden="true" data-large-title="" className="phone-large-title text-display text-ink">
                            {largeTitle}
                        </p>
                    )}
                    {children}
                </div>

                <MobileBottomNavigationBar />
            </div>
        </>
    );
}
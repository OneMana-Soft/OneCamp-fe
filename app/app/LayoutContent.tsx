"use client"

import { useMedia } from "@/context/MediaQueryContext";
import { AdminBanners } from "@/components/banner/AdminBanners";
import { OfflineNotice } from "@/components/error/OfflineNotice";
import { PanelErrorBoundary } from "@/components/error/PanelErrorBoundary";
import { closeRightPanel } from "@/store/slice/desktopRightPanelSlice";
import { useDispatch } from "react-redux";
import { useFetch } from "@/hooks/useFetch";
import { GetEndpointUrl } from "@/services/endPoints";
import { UserProfileInterface } from "@/types/user";
import { MobileNavigationBar } from "@/components/navigationBar/mobile/mobileNavigationBar";
import { DesktopNavigationBar } from "@/components/navigationBar/desktop/desktopNavigationBar";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { cn } from "@/lib/utils/helpers/cn";
import { RightPanel } from "@/components/rightPanel/rightPanel";
import { useSelector } from "react-redux";
import { RootState } from "@/store/store";
import { useRef, useEffect, useState } from "react";
import { ImperativePanelHandle, getPanelGroupElement } from "react-resizable-panels";
import { rightPanelMinSize } from "@/lib/ui/rightPanelSize";
import {usePathname} from "next/navigation";
import { PageTransition } from "@/components/ui/PageTransition";
import { AgentNoteOnOpen } from "@/components/ai/AgentNoteOnOpen";
import { RunningTimerChip } from "@/components/time/RunningTimerChip";
import { useOpenFromUrl } from "@/hooks/useOpenFromUrl";
import { useSplitView } from "@/hooks/useSplitView";
import { useGoKeys } from "@/hooks/useGoKeys";
import { SplitPane } from "@/components/split/SplitPane";
import { ShortcutsDialog } from "@/components/shortcuts/ShortcutsDialog";
import { KeyboardTip } from "@/components/onboarding/KeyboardTip";
import { Fragment } from "react";
import { useBotKinds } from "@/hooks/useBotKinds";
import { followKeyboard } from "@/lib/ui/visualViewport";
import { followHistory, noteRouteChange } from "@/lib/navigation/back";

/** The panel group beside the sidebar: the page, any split panes, the right panel. */
const PANEL_GROUP_ID = "app-panels";

/**
 * The panel group's width in pixels, followed as the window (or the sidebar
 * beside it) changes it. 0 until it is measured, or while there is no group.
 */
function usePanelGroupWidth(id: string, enabled: boolean): number {
  const [width, setWidth] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    const el = getPanelGroupElement(id);
    if (!el) return;
    setWidth(el.getBoundingClientRect().width);
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver((entries) => setWidth(entries[0]?.contentRect.width ?? 0));
    observer.observe(el);
    return () => observer.disconnect();
  }, [id, enabled]);
  return width;
}

export function LayoutContent({ children }: { children: React.ReactNode }) {
  useOpenFromUrl();
  // While the on-screen keyboard is up, the app fits what is left of the
  // screen (lib/ui/visualViewport.ts). Outside React: nothing re-renders.
  useEffect(() => followKeyboard(), []);
  const { isMobile } = useMedia();
  // Split view is for a screen with room for it.
  const { panes, active, focused } = useSplitView(!isMobile);
  useGoKeys(!isMobile);
  // Which bots are agents, read before the first message draws its tag.
  useBotKinds();
  // Focus shows one view alone. The others stay mounted, only hidden, so
  // their scroll, drafts and calls are as they were when it ends.
  const shows = (view: number) => focused === null || focused === view
  const split = panes.length > 0
  const rightPanelState = useSelector((state: RootState) => state.rightPanel.rightPanelState);
  const dispatch = useDispatch();
  // What the right panel shows, so a crash in one task's panel doesn't follow
  // you to the next thing you open there.
  const panelKey = JSON.stringify(rightPanelState.data ?? {});
  const rightPanelRef = useRef<ImperativePanelHandle>(null);
  const [isDragging, setIsDragging] = useState(false);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const pathname = usePathname()
  const path = pathname.split('/')
  // How far back the app's own history goes, so a back arrow on a page opened
  // from a notification or a link goes up a level instead of out of the app
  // (lib/navigation/back.ts). The router has written history by now.
  useEffect(() => followHistory(), []);
  useEffect(() => noteRouteChange(), [pathname]);
  const inMeeting = path.length > 2 && path[2] == "meet"

  // The right panel's minimum: 32% of the group, or 320px where that is
  // more (lib/ui/rightPanelSize). At 1024px, 32% left its content's left edge
  // under the page, cutting off "Mark complete" and the field labels.
  const groupWidth = usePanelGroupWidth(PANEL_GROUP_ID, !isMobile && !inMeeting)
  const rightMin = rightPanelMinSize(groupWidth)

  // Same request the navigation bar already makes, so this is a cache hit rather
  // than a second round trip.
  const selfProfile = useFetch<UserProfileInterface>(GetEndpointUrl.SelfProfileSideNav, undefined, {
    revalidateOnFocus: false,
  })
  const isAdmin = selfProfile.data?.data?.user_is_admin


  // Opening asks for the panel's usual size, never under its minimum. Read
  // from a ref: a window resized with the panel open must not undo a width
  // the person dragged it to.
  const rightMinRef = useRef(rightMin);
  rightMinRef.current = rightMin;
  useEffect(() => {
    const panel = rightPanelRef.current;
    if (panel) {
      if (rightPanelState.isOpen) {
        panel.resize(Math.max(30, rightMinRef.current));
      } else {
        panel.collapse();
      }
    }
  }, [rightPanelState.isOpen]);

  const isTaskPage = !!(path.length > 2 && path[2] === "task" && path[3]);

  if (isMobile) {
    return (
      <MobileNavigationBar
        disableBottomPadding={isTaskPage}
        banners={
          <>
            <OfflineNotice inline />
            <AdminBanners isAdmin={isAdmin} />
          </>
        }
      >
        {children}
        <AgentNoteOnOpen />
        <RunningTimerChip className="bottom-[calc(5rem+env(safe-area-inset-bottom))] left-1/2 -translate-x-1/2" />
      </MobileNavigationBar>
    );
  }

  if(inMeeting) {
    return children;
  }

  return (
    <DesktopNavigationBar>
      <OfflineNotice inline />
      <AdminBanners isAdmin={isAdmin} />
        <AgentNoteOnOpen />
      <RunningTimerChip className="bottom-4 left-1/2 -translate-x-1/2" />
      <ResizablePanelGroup
        id={PANEL_GROUP_ID}
        direction="horizontal"
        onLayout={(sizes) => {
          if (timeoutRef.current) clearTimeout(timeoutRef.current);
          timeoutRef.current = setTimeout(() => {
            document.cookie = `react-resizable-root-panels:layout:mail=${JSON.stringify(sizes)}`;
          }, 300);
        }}
        className="h-full"
      >
        <ResizablePanel
          defaultSize={Math.max(30, (rightPanelState.isOpen ? 70 : 100) - panes.length * 30)}
          minSize={30}
          id="main-panel"
          order={1}
          // No transition on its size: flex-basis is layout, and animating
          // it laid the whole page out again on every frame the right panel
          // took to open. The panel's content slides in instead (below).
          className={cn(
            "h-full relative w-full min-w-0",
            !shows(-1) && "hidden"
          )}
        >
          <div
            data-split-view="-1"
            tabIndex={-1}
            className={cn(
              "h-full w-full overflow-y-auto overflow-x-hidden custom-scrollbar outline-none",
              // With views side by side, a hairline marks the one the keys act on.
              split && focused === null && active === -1 && "shadow-[inset_0_2px_0_0_var(--primary)]"
            )}
          >
            <PageTransition>
              {children}
            </PageTransition>
          </div>
        </ResizablePanel>
        {/* Split view: what was opened beside the page, each in its own pane. */}
        {panes.map((pane, i) => (
          <Fragment key={`${pane.kind}:${pane.id}`}>
            <ResizableHandle withHandle={true} onDragging={setIsDragging} className={focused !== null ? "hidden" : undefined} />
            <ResizablePanel id={`split-${pane.kind}-${pane.id}`} order={2 + i} defaultSize={30} minSize={22} className={cn("h-full min-w-0", !shows(i) && "hidden")}>
              <SplitPane pane={pane} index={i} active={split && active === i} focused={focused === i} />
            </ResizablePanel>
          </Fragment>
        ))}
        <ResizableHandle withHandle={true} className={rightPanelState.isOpen ? "" : "hidden"} onDragging={setIsDragging} />
        <ResizablePanel
          ref={rightPanelRef}
          defaultSize={rightPanelState.isOpen ? rightMin : 0}
          collapsible={!rightPanelState.isOpen}
          collapsedSize={0}
          minSize={rightMin}
          maxSize={60}
          id="right-panel"
          order={10}
          className={`relative overflow-x-hidden flex justify-end ${
            isDragging ? "transition-none" : "transition-opacity duration-75"
          } ${
            rightPanelState.isOpen ? "opacity-100" : "opacity-0"
          }`}
        >
          {/* Content for the right panel. The panel's width changes fast (it
              re-lays out the page every frame it moves); what slides in is its
              content, on transform and opacity, which cost no layout. Keyed on
              open so it plays on opening, not on switching what is shown. */}
          <div
            key={rightPanelState.isOpen ? "open" : "closed"}
            // Lists read it: J and K walk through tasks while one is open here.
            data-right-panel=""
            className="absolute right-0 top-0 h-full w-full min-w-[320px] overflow-y-auto motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-right-3 motion-safe:duration-200 motion-safe:ease-out"
          >
            <PanelErrorBoundary resetKey={panelKey} onClose={() => dispatch(closeRightPanel())}>
              <RightPanel />
            </PanelErrorBoundary>
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>
      <ShortcutsDialog />
      <KeyboardTip />

    </DesktopNavigationBar>
  );
}

"use client"

import { useMedia } from "@/context/MediaQueryContext";
import { NoticeStack } from "@/components/banner/NoticeBar";
import { SheetProgressBar } from "@/context/LoadingContext";
import { AdminBanners } from "@/components/banner/AdminBanners";
import { PanelErrorBoundary } from "@/components/error/PanelErrorBoundary";
import { closeRightPanel } from "@/store/slice/desktopRightPanelSlice";
import { useDispatch } from "react-redux";
import { useFetch } from "@/hooks/useFetch";
import { GetEndpointUrl } from "@/services/endPoints";
import { UserProfileInterface } from "@/types/user";
import { MobileNavigationBar } from "@/components/navigationBar/mobile/mobileNavigationBar";
import { DesktopNavigationBar } from "@/components/navigationBar/desktop/desktopNavigationBar";
import { ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { PanelResizeHandle, ImperativePanelHandle, getPanelGroupElement } from "react-resizable-panels";
import { cn } from "@/lib/utils/helpers/cn";
import { RightPanel } from "@/components/rightPanel/rightPanel";
import { useSelector } from "react-redux";
import { RootState } from "@/store/store";
import { useRef, useEffect, useLayoutEffect, useState } from "react";
import { RIGHT_PANEL_MIN_PX, rightPanelKind, rightPanelMaxSize, rightPanelMinSize, rightPanelOpenSize } from "@/lib/ui/rightPanelSize";
import { usePathname } from "next/navigation";
import { PageTransition } from "@/components/ui/PageTransition";
import { RunningTimerChip } from "@/components/time/RunningTimerChip";
import { useOpenFromUrl } from "@/hooks/useOpenFromUrl";
import { useSplitView } from "@/hooks/useSplitView";
import { useGoKeys } from "@/hooks/useGoKeys";
import { SplitPane } from "@/components/split/SplitPane";
import { FocusPill } from "@/components/split/FocusPill";
import { ShortcutsDialog } from "@/components/shortcuts/ShortcutsDialog";
import { KeyboardTip } from "@/components/onboarding/KeyboardTip";
import { Fragment } from "react";
import { useBotKinds } from "@/hooks/useBotKinds";
import { followKeyboard } from "@/lib/ui/visualViewport";
import { followHistory, noteRouteChange } from "@/lib/navigation/back";

/** The panel group beside the sidebar: the page, any split panes, the right panel. */
const PANEL_GROUP_ID = "app-panels";

/** Where the right panel's width is kept, in pixels (design v3, shell V1). */
const RIGHT_PANEL_COOKIE = "onecamp-right-panel-px";

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

/**
 * The seam between two sheets is the handle (design v3, shell V1 and V2): an
 * 8px gap where the frame and its glow show through, with a 3x28 grip that
 * fades in on hover. Double-click resets the panel beside it.
 */
function Seam({ hidden, onDragging, onReset, label }: { hidden?: boolean; onDragging?: (d: boolean) => void; onReset?: () => void; label: string }) {
  return (
    <PanelResizeHandle
      onDragging={onDragging}
      className={cn("shell-seam", hidden && "hidden")}
      aria-label={label}
      onDoubleClick={onReset}
    >
      <i />
    </PanelResizeHandle>
  );
}

const percentOf = (px: number, groupWidth: number) => Math.ceil((px / groupWidth) * 1000) / 10;

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

  // The right panel: 452px by default, never under 360, at most 60% of the
  // group, and its width kept in pixels (lib/ui/rightPanelSize).
  const groupWidth = usePanelGroupWidth(PANEL_GROUP_ID, !isMobile && !inMeeting)
  const rightMin = rightPanelMinSize(groupWidth)
  // A thread opens at 420px and stops at 560 (chat C36); the rest at 452 and 60%.
  const panelKind = rightPanelKind(rightPanelState.data)
  const panelKindRef = useRef(panelKind)
  panelKindRef.current = panelKind
  const rightMax = rightPanelMaxSize(groupWidth, panelKind)
  const savedRightPx = () => {
    const raw = typeof document === "undefined" ? "" : document.cookie.split("; ").find((r) => r.startsWith(`${RIGHT_PANEL_COOKIE}=`))?.split("=")[1]
    const px = Number(raw)
    return Number.isFinite(px) && px >= RIGHT_PANEL_MIN_PX ? px : 0
  }
  const rightOpenSize = (gw: number) => {
    const px = savedRightPx()
    const kind = panelKindRef.current
    if (!px || !(gw > 0)) return rightPanelOpenSize(gw, kind)
    return Math.min(rightPanelMaxSize(gw, kind), Math.max(rightPanelMinSize(gw), percentOf(px, gw)))
  }

  // Same request the navigation bar already makes, so this is a cache hit rather
  // than a second round trip.
  const selfProfile = useFetch<UserProfileInterface>(GetEndpointUrl.SelfProfileSideNav, undefined, {
    revalidateOnFocus: false,
  })
  const isAdmin = selfProfile.data?.data?.user_is_admin

  // Opening asks for the panel's usual size; the width snaps (no animation on
  // it), and the panel's sheet slides in on transform. Read through a ref: a
  // window resized with the panel open must not undo a width the person
  // dragged it to.
  const groupWidthRef = useRef(groupWidth);
  groupWidthRef.current = groupWidth;
  useEffect(() => {
    const panel = rightPanelRef.current;
    if (panel) {
      if (rightPanelState.isOpen) {
        panel.resize(rightOpenSize(groupWidthRef.current));
      } else {
        panel.collapse();
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rightPanelState.isOpen]);

  // What floats in the sheet's right corner keeps clear of the open panel
  // (CornerStack reads it): the panel's sheet and its seam, or the 8px gutter.
  const rightSheetRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (isMobile || inMeeting) return;
    const root = document.documentElement;
    const el = rightSheetRef.current;
    const set = () => root.style.setProperty("--shell-right-inset", `${rightPanelState.isOpen && el ? Math.round(el.getBoundingClientRect().width) + 16 : 8}px`);
    set();
    const ro = rightPanelState.isOpen && el && typeof ResizeObserver !== "undefined" ? new ResizeObserver(set) : null;
    if (ro && el) ro.observe(el);
    return () => {
      ro?.disconnect();
      root.style.removeProperty("--shell-right-inset");
    };
  }, [rightPanelState.isOpen, isMobile, inMeeting]);

  const isTaskPage = !!(path.length > 2 && path[2] === "task" && path[3]);

  if (isMobile) {
    return (
      <MobileNavigationBar
        disableBottomPadding={isTaskPage}
        banners={
          <NoticeStack shown={1}>
            <AdminBanners isAdmin={isAdmin} />
          </NoticeStack>
        }
      >
        {children}
        <RunningTimerChip />
      </MobileNavigationBar>
    );
  }

  if(inMeeting) {
    return children;
  }

  // Split view: two views share the width 50/50; three take 40/30/30. Every
  // view keeps at least 360px.
  const mainSize = panes.length === 0 ? 100 : panes.length === 1 ? 50 : 40
  const paneSize = panes.length === 1 ? 50 : 30
  const paneMin = groupWidth > 0 ? Math.min(45, percentOf(RIGHT_PANEL_MIN_PX, groupWidth)) : 22

  return (
    <DesktopNavigationBar>
      <RunningTimerChip />
      <ResizablePanelGroup
        id={PANEL_GROUP_ID}
        direction="horizontal"
        onLayout={(sizes) => {
          if (timeoutRef.current) clearTimeout(timeoutRef.current);
          timeoutRef.current = setTimeout(() => {
            document.cookie = `react-resizable-root-panels:layout:mail=${JSON.stringify(sizes)}`;
            // The right panel's width, in pixels, for the next time it opens.
            const right = sizes[sizes.length - 1];
            if (rightPanelState.isOpen && right > 0 && groupWidthRef.current > 0) {
              document.cookie = `${RIGHT_PANEL_COOKIE}=${Math.round((right / 100) * groupWidthRef.current)}; path=/; max-age=31536000`;
            }
          }, 300);
        }}
        className="h-full"
      >
        <ResizablePanel
          defaultSize={Math.max(30, (rightPanelState.isOpen ? 100 - rightOpenSize(groupWidth) : 100) - (100 - mainSize))}
          minSize={30}
          id="main-panel"
          order={1}
          // No transition on its size: flex-basis is layout, and animating
          // it laid the whole page out again on every frame the right panel
          // took to open. The panel's sheet slides in instead (below).
          className={cn("h-full relative w-full min-w-0", !shows(-1) && "hidden")}
        >
          {/* The page's sheet: r12 on e-sheet, the brightest thing on screen.
              A column, so a notice above the work takes its own height and
              the work below shrinks to fit, never clipped at the bottom. With
              views side by side, the one the keys act on wears a 1.5px brand
              top edge inside its radius. */}
          <div
            data-main-sheet=""
            className={cn(
              "app-sheet relative flex h-full flex-col overflow-hidden",
              split && focused === null && active === -1 && "shell-sheet-focused",
            )}
          >
            {/* Work in progress: a brand light along the sheet's top edge (L2). */}
            <SheetProgressBar />
            {/* Notices: the top of the sheet, inside it, two at most (T2). The
                offline state is the foot pill now (T3), not a notice. */}
            <NoticeStack>
              <AdminBanners isAdmin={isAdmin} />
              </NoticeStack>
            {focused === -1 && (
              <div className="pointer-events-none absolute right-3 top-2.5 z-[var(--z-sticky)] [&>*]:pointer-events-auto">
                <FocusPill />
              </div>
            )}
            <div
              data-split-view="-1"
              tabIndex={-1}
              className="min-h-0 w-full flex-1 overflow-y-auto overflow-x-hidden custom-scrollbar outline-none"
            >
              <PageTransition>
                {children}
              </PageTransition>
            </div>
          </div>
        </ResizablePanel>
        {/* Split view: what was opened beside the page, each on its own sheet. */}
        {panes.map((pane, i) => (
          <Fragment key={`${pane.kind}:${pane.id}`}>
            <Seam label="Resize the views" onDragging={setIsDragging} hidden={focused !== null} />
            <ResizablePanel id={`split-${pane.kind}-${pane.id}`} order={2 + i} defaultSize={paneSize} minSize={paneMin} className={cn("h-full min-w-0", !shows(i) && "hidden")}>
              <SplitPane pane={pane} index={i} active={split && active === i} focused={focused === i} />
            </ResizablePanel>
          </Fragment>
        ))}
        <Seam
          label="Resize the panel"
          hidden={!rightPanelState.isOpen}
          onDragging={setIsDragging}
          onReset={() => rightPanelRef.current?.resize(rightPanelOpenSize(groupWidthRef.current, panelKindRef.current))}
        />
        <ResizablePanel
          ref={rightPanelRef}
          defaultSize={rightPanelState.isOpen ? rightOpenSize(groupWidth) : 0}
          collapsible={!rightPanelState.isOpen}
          collapsedSize={0}
          minSize={rightMin}
          maxSize={rightMax}
          id="right-panel"
          order={10}
          className={cn("relative min-w-0", !rightPanelState.isOpen && "pointer-events-none")}
        >
          {/* The right panel is a sheet of its own (design v3, shell V1): the
              page's sheet ends, an 8px seam shows the frame, and this one
              starts. Its width snaps; the sheet enters on transform and
              opacity (x 16 to 0, 240ms), keyed on open so it plays on opening,
              not on switching what is shown. */}
          {rightPanelState.isOpen && (
            <div
              ref={rightSheetRef}
              key="open"
              // Lists read it: J and K walk through tasks while one is open here.
              data-right-panel=""
              data-right-panel-sheet=""
              className={cn(
                "app-sheet shell-panel-sheet absolute inset-0 flex flex-col overflow-hidden",
                isDragging && "[animation:none]",
              )}
            >
              <div key={panelKey} className="shell-content-swap min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
                <PanelErrorBoundary resetKey={panelKey} onClose={() => dispatch(closeRightPanel())}>
                  <RightPanel />
                </PanelErrorBoundary>
              </div>
            </div>
          )}
        </ResizablePanel>
      </ResizablePanelGroup>
      <ShortcutsDialog />
      <KeyboardTip />
    </DesktopNavigationBar>
  );
}

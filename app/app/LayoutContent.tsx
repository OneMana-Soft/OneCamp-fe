"use client"

import { useMedia } from "@/context/MediaQueryContext";
import { NoticeStack } from "@/components/banner/NoticeBar";
import { SheetProgressBar } from "@/context/LoadingContext";
import { AdminBanners } from "@/components/banner/AdminBanners";
import { FeaturesNotice } from "@/components/banner/FeaturesNotice";
import { PanelErrorBoundary } from "@/components/error/PanelErrorBoundary";
import { closeRightPanel } from "@/store/slice/desktopRightPanelSlice";
import { evenOut, setRoom, setSizes } from "@/store/slice/splitActions";
import { useDispatch } from "react-redux";
import { useFetch } from "@/hooks/useFetch";
import { GetEndpointUrl } from "@/services/endPoints";
import { UserProfileInterface } from "@/types/user";
import { MobileNavigationBar } from "@/components/navigationBar/mobile/mobileNavigationBar";
import { DesktopNavigationBar } from "@/components/navigationBar/desktop/desktopNavigationBar";
import { ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { ImperativePanelHandle, type ImperativePanelGroupHandle, getPanelGroupElement } from "react-resizable-panels";
import { cn } from "@/lib/utils/helpers/cn";
import { PreloadPanels, RightPanel } from "@/components/rightPanel/rightPanel";
import { lazyPart } from "@/lib/lazy/lazyPart";
import { useSelector } from "react-redux";
import { RootState } from "@/store/store";
import { useRef, useEffect, useLayoutEffect, useState } from "react";
import { RIGHT_PANEL_MIN_PX, rightPanelKind, rightPanelMaxSize, rightPanelMinSize, rightPanelOpenSize } from "@/lib/ui/rightPanelSize";
import { usePathname } from "next/navigation";
import { PageTransition } from "@/components/ui/PageTransition";
import { AgentNoteOnOpen } from "@/components/ai/AgentNoteOnOpen";
import { RunningTimerChip } from "@/components/time/RunningTimerChip";
import { useOpenFromUrl } from "@/hooks/useOpenFromUrl";
import { useSplitView } from "@/hooks/useSplitView";
import { useGoKeys } from "@/hooks/useGoKeys";
import { FocusPill, MeetingSplit, SplitArrange, SplitPane, TuckedViews } from "@/components/split/lazy";
import { Seam } from "@/components/split/Seam";
import { MAIN, MAIN_KEY, MAX_PANES, keyOf } from "@/lib/split";
import { MIN_VIEW_PX, SEAM_PX, shares, shownViews, viewRow, viewsThatFit } from "@/lib/splitLayout";
import { ShortcutsDialog } from "@/components/shortcuts/ShortcutsDialog";

import { useBotKinds } from "@/hooks/useBotKinds";
import { followKeyboard } from "@/lib/ui/visualViewport";
import { followHistory, noteRouteChange } from "@/lib/navigation/back";
import { usePanelPlacement, useShellBand } from "@/components/navigationBar/tablet/useShellBand";
import { isTabletBand } from "@/lib/ui/shellBand";
import { useMeetingFrame } from "@/lib/ui/meetingFrame";
import { RightPanelSheet } from "@/components/rightPanel/RightPanelSheet";
import { warmBurstsWhenIdle } from "@/lib/celebrateSoon";
// The keys tip shows once per browser, 6 s in, on a computer: its code comes
// only then (components/onboarding/KeysTipLoader).
import { KeysTipLoader } from "@/components/onboarding/KeysTipLoader";

// The one rule that opens a task in place with no network, and a phone's sheet for it (asana-12 (a)): a chunk of
// its own, as only a device that loses the network uses it (components/rightPanel/TaskInPlace).
const TaskInPlace = lazyPart(() => import("@/components/rightPanel/TaskInPlace").then((m) => m.TaskInPlace)).Part;


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

const percentOf = (px: number, groupWidth: number) => Math.ceil((px / groupWidth) * 1000) / 10;

/**
 * The page's sheet: r12 on e-sheet, the brightest thing on screen. A column,
 * so a notice above the work takes its own height and the work below shrinks
 * to fit, never clipped at the bottom. With views side by side, the one the
 * keys act on wears a 1.5px brand top edge inside its radius (keysHere); the
 * sheet is then a named view, with a grip at its top to move it by.
 */
function PageSheet({ isAdmin, keysHere, focusPill, split, children }: { isAdmin?: boolean; keysHere: boolean; focusPill: React.ReactNode; split?: string; children: React.ReactNode }) {
  return (
    <div data-main-sheet="" data-split-sheet={MAIN_KEY} role={split ? "region" : undefined} aria-label={split} className={cn("app-sheet relative flex h-full flex-col overflow-hidden", keysHere && "shell-sheet-focused")}>
      {/* Work in progress: a brand light along the sheet's top edge (L2). */}
      <SheetProgressBar />
      {/* Notices: the top of the sheet, inside it, two at most (T2). The
          offline state is the foot pill now (T3), not a notice. */}
      <NoticeStack>
        <AdminBanners isAdmin={isAdmin} />
        <FeaturesNotice />
      </NoticeStack>
      {focusPill && (
        <div className="pointer-events-none absolute right-3 top-2.5 z-[var(--z-sticky)] [&>*]:pointer-events-auto">
          {focusPill}
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
  );
}

// The query is read in this leaf, so a write to it (a date, a tab, a filter)
// doesn't render the shell (app/app/shellAddress.test.ts).
function OpenFromUrl() {
  useOpenFromUrl();
  return null;
}

export function LayoutContent({ children }: { children: React.ReactNode }) {
  return (
    <>
      <OpenFromUrl />
      <Shell>{children}</Shell>
    </>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  // While the on-screen keyboard is up, the app fits what is left of the
  // screen (lib/ui/visualViewport.ts). Outside React: nothing re-renders.
  useEffect(() => followKeyboard(), []);
  // The celebrations' sparks (lib/celebrate) come once the app is idle, so a
  // finish or a moment anywhere in it finds them in (lib/celebrateSoon).
  useEffect(() => warmBurstsWhenIdle(), []);
  const media = useMedia();
  const pathname = usePathname()
  const path = pathname.split('/')
  const inMeeting = path.length > 2 && path[2] == "meet"
  // The phone's frame or the computer's. A call's page keeps the one it
  // opened in until it is left: a new frame mounts the page anew and hangs
  // up the call (lib/ui/meetingFrame).
  const isMobile = useMeetingFrame(media, inMeeting);
  // A tablet's shell (design v3, mobile T1): the rail, and the right panel as
  // a sheet over the page.
  const band = useShellBand();
  const tablet = isTabletBand(band);
  // Where the right panel opens: beside the page from 1100px up, over it in a
  // narrower window and on a tablet (lib/ui/shellBand).
  const panelOver = usePanelPlacement() === "over";
  // Split view: a computer or a tablet in landscape; never a phone, nor a
  // tablet in portrait (views already open stay there, one at a time). A
  // call's page kept in the computer's frame on a phone's width has none.
  const splitOn = !isMobile && !media.isMobile && band !== "tablet-compact";
  const { panes, order, active, focused, used, sizes, evened } = useSplitView(splitOn);
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

  // How far back the app's own history goes, so a back arrow on a page opened
  // from a notification or a link goes up a level instead of out of the app
  // (lib/navigation/back.ts). The router has written history by now.
  useEffect(() => followHistory(), []);
  useEffect(() => noteRouteChange(), [pathname]);

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
    // Over the page, the panel floats above it, so the corner is the sheet's.
    const el = panelOver ? null : rightSheetRef.current;
    const set = () => root.style.setProperty("--shell-right-inset", `${rightPanelState.isOpen && el ? Math.round(el.getBoundingClientRect().width) + 16 : 8}px`);
    set();
    const ro = rightPanelState.isOpen && el && typeof ResizeObserver !== "undefined" ? new ResizeObserver(set) : null;
    if (ro && el) ro.observe(el);
    return () => {
      ro?.disconnect();
      root.style.removeProperty("--shell-right-inset");
    };
  }, [rightPanelState.isOpen, isMobile, inMeeting, panelOver]);

  // Many views (design/split, rules W, T, S): the width holds 360px a view
  // (`room`: opening past it closes the least recently used, with Undo); on
  // screen are those that fit beside the right panel's 360 when it's open,
  // the rest tucked, mounted, as chips. Each keeps its width; none under 360.
  const fitAll = groupWidth > 0 ? viewsThatFit(groupWidth) : MAX_PANES + 1
  useEffect(() => {
    dispatch(setRoom(fitAll - 1))
  }, [fitAll, dispatch])
  const rightBeside = !panelOver && rightPanelState.isOpen
  const fitNow = band === "tablet-compact" ? 1 : groupWidth > 0 ? viewsThatFit(groupWidth - (rightBeside ? RIGHT_PANEL_MIN_PX + SEAM_PX : 0)) : MAX_PANES + 1
  const row = viewRow(panes, order)
  const onScreen = shownViews(panes, row, used, active, fitNow)
  const keyOfView = (v: number) => keyOf(panes, v)
  const shownKeys = onScreen.map(keyOfView)
  const shownRef = useRef(shownKeys)
  shownRef.current = shownKeys
  const tucked = row.filter((v) => !onScreen.includes(v)).map(keyOfView).join(",")
  const lastShown = onScreen[onScreen.length - 1]
  const minPct = groupWidth > 0 ? Math.min(100, percentOf(MIN_VIEW_PX, groupWidth)) : 0
  const widths = shares(shownKeys, sizes, 100 - (rightBeside ? rightOpenSize(groupWidth) : 0), minPct)
  // Even out (a seam's double-click, Ctrl+Alt+=, a menu): equal shares.
  const groupRef = useRef<ImperativePanelGroupHandle>(null)
  useEffect(() => {
    const g = groupRef.current
    if (!evened || !g) return
    const n = shownRef.current.length
    const now = g.getLayout()
    const each = (100 - now.slice(n).reduce((a, x) => a + x, 0)) / n
    g.setLayout(now.map((x, i) => (i < n ? each : x)))
  }, [evened])

  const isTaskPage = !!(path.length > 2 && path[2] === "task" && path[3]);

  // What the right panel shows, with its own error boundary.
  const panelBody = (
    <div key={panelKey} className="shell-content-swap min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
      <PanelErrorBoundary resetKey={panelKey} onClose={() => dispatch(closeRightPanel())}>
        <RightPanel />
      </PanelErrorBoundary>
    </div>
  );

  if (isMobile) {
    return (
      <MobileNavigationBar
        disableBottomPadding={isTaskPage}
        banners={
          <NoticeStack shown={1}>
            <AdminBanners isAdmin={isAdmin} />
            <FeaturesNotice />
          </NoticeStack>
        }
      >
        {children}
        <AgentNoteOnOpen />
        <RunningTimerChip />
        {/* With no network, a task opens over the page, in a sheet, as a laptop's panel opens it (asana-12 (a)):
            a move to its page would show the browser's own offline page. Its code is on the device first. */}
        <TaskInPlace body={panelBody} />
      </MobileNavigationBar>
    );
  }

  // A call's own page: the call, and beside it the call's conversation once
  // its Chat opens it (MeetingSplit). Always the same frame, so opening the
  // conversation never remounts the call, which would hang it up.
  if (inMeeting) {
    return <MeetingSplit pathname={pathname} enabled={splitOn}>{children}</MeetingSplit>;
  }

  const pageSheet = (
    <PageSheet
      isAdmin={isAdmin}
      keysHere={split && focused === null && active === MAIN}
      split={split ? `Main view, ${row.indexOf(MAIN) + 1} of ${row.length}` : undefined}
      focusPill={focused === MAIN ? <FocusPill /> : lastShown === MAIN && tucked ? <TuckedViews keys={tucked} /> : null}
    >
      {children}
    </PageSheet>
  );

  // The right panel over the page (a tablet, mobile T4; a window under
  // 1100px, as Slack does in a narrow window): a sheet of its own that slides
  // over the page from the right, on a 20% scrim that closes it (Esc does
  // too: RightPanel's own). Beside the page, its width crushed what it sat
  // beside: on a tablet at 768 a list got 278px, its title on two lines and
  // New task cut off; in a 1024 window a conversation got about 360px, at
  // 768 about 165. The right panel's ONE sheet (components/rightPanel/
  // RightPanelSheet, the shared OverlaySheet): focus stays in it while it is
  // open, and goes back where it was when it closes; Escape stays the
  // panel's own (escape="own"), an editor's popup or a field first.
  const panelOverlay = rightPanelState.isOpen ? (
    <RightPanelSheet key="open" label="Side panel" shape="shell-panel-sheet shell-panel-over" over>
      {panelBody}
    </RightPanelSheet>
  ) : null;

  // A view's panel. Views sit by CSS order and the panels' order, never by
  // DOM place: a moved element loses its scroll, focus and iframes (measured
  // 20 Oct 2026). FLIP (SplitArrange) shows a move. Tucked: last, size 0.
  const viewProps = (v: number) => {
    const pos = onScreen.indexOf(v)
    const order = pos >= 0 ? pos * 2 + 2 : 20 + row.indexOf(v)
    return {
      order,
      style: { order },
      defaultSize: pos >= 0 ? widths[pos] : 0,
      minSize: pos >= 0 ? minPct : 0,
      "data-flip-id": keyOfView(v),
      hidden: pos < 0 || !shows(v),
    }
  }
  const main = viewProps(MAIN)

  return (
    <DesktopNavigationBar>
      <AgentNoteOnOpen />
      <RunningTimerChip />
      <PreloadPanels />
      <TaskInPlace />
      <ResizablePanelGroup
        id={PANEL_GROUP_ID}
        ref={groupRef}
        direction="horizontal"
        data-split-row=""
        // The keys resize 32px a step (Shift: to the limit).
        keyboardResizeBy={groupWidth > 0 ? percentOf(32, groupWidth) : null}
        onLayout={(sizes) => {
          if (timeoutRef.current) clearTimeout(timeoutRef.current);
          timeoutRef.current = setTimeout(() => {
            document.cookie = `react-resizable-root-panels:layout:mail=${JSON.stringify(sizes)}`;
            // The right panel's width, in pixels, for the next time it opens.
            const right = sizes[shownRef.current.length];
            if (!panelOver && rightPanelState.isOpen && right > 0 && groupWidthRef.current > 0) {
              document.cookie = `${RIGHT_PANEL_COOKIE}=${Math.round((right / 100) * groupWidthRef.current)}; path=/; max-age=31536000`;
            }
            // Each view's width, kept with it (S).
            if (shownRef.current.length > 1) dispatch(setSizes(Object.fromEntries(shownRef.current.map((k, i) => [k, sizes[i]]))));
          }, 300);
        }}
        className="h-full"
        style={split ? { overflow: "visible" } : undefined}
      >
        {/* While split, the page's grip rides its sheet's top edge: the panel
            lets it out above, and only it (.split-main-panel's notch). */}
        <ResizablePanel
          id="main-panel"
          order={main.order}
          style={split ? { ...main.style, overflow: "visible" } : main.style}
          defaultSize={main.defaultSize}
          minSize={main.minSize}
          data-flip-id={main["data-flip-id"]}
          // No transition on its size: flex-basis is layout, and animating
          // it laid the whole page out again on every frame the right panel
          // took to open. The panel's sheet slides in instead (below).
          className={cn("h-full relative w-full min-w-0", split && "split-main-panel", main.hidden && "hidden")}
        >
          {pageSheet}
          {split && <span data-split-handle={MAIN_KEY} className="split-grip-slot" />}
        </ResizablePanel>
        {/* Split view: what was opened beside the page, each on its own sheet. */}
        {panes.map((pane, i) => {
          const { hidden, ...view } = viewProps(i)
          return (
            <ResizablePanel key={`${pane.kind}:${pane.id}`} id={`split-${pane.kind}-${pane.id}`} {...view} className={cn("h-full min-w-0", hidden && "hidden")}>
              <SplitPane pane={pane} index={i} at={row.indexOf(i)} count={row.length} active={split && active === i} focused={focused === i} shown={onScreen.includes(i)} tucked={lastShown === i && tucked ? tucked : undefined} />
            </ResizablePanel>
          )
        })}
        {onScreen.slice(1).map((_, k) => (
          <Seam key={`seam-${k}`} order={k * 2 + 3} label={`Resize views ${k + 1} and ${k + 2}`} onDragging={setIsDragging} hidden={focused !== null} onReset={() => dispatch(evenOut())} />
        ))}
        {/* Beside the page from 1100px up; under that it opens over it (below). */}
        {!panelOver && (<>
        <Seam
          order={9}
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
          style={{ order: 10 }}
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
              {panelBody}
            </div>
          )}
        </ResizablePanel>
        </>)}
      </ResizablePanelGroup>
      {panelOver && panelOverlay}
      {splitOn && split && focused === null && <SplitArrange shown={shownKeys.join(",")} />}
      <ShortcutsDialog />
      {!tablet && <KeysTipLoader />}
    </DesktopNavigationBar>
  );
}

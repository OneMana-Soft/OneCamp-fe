"use client"

import { useMedia } from "@/context/MediaQueryContext";
import { MobileNavigationBar } from "@/components/navigationBar/mobile/mobileNavigationBar";
import { DesktopNavigationBar } from "@/components/navigationBar/desktop/desktopNavigationBar";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { cn } from "@/lib/utils/helpers/cn";
import { RightPanel } from "@/components/rightPanel/rightPanel";
import { useSelector } from "react-redux";
import { RootState } from "@/store/store";
import { useRef, useEffect, useState } from "react";
import { ImperativePanelHandle } from "react-resizable-panels";
import {usePathname} from "next/navigation";
import { PageTransition } from "@/components/ui/PageTransition";


export function LayoutContent({ children }: { children: React.ReactNode }) {
  const { isMobile } = useMedia();
  const rightPanelState = useSelector((state: RootState) => state.rightPanel.rightPanelState);
  const rightPanelRef = useRef<ImperativePanelHandle>(null);
  const [isDragging, setIsDragging] = useState(false);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const path = usePathname().split('/')


  useEffect(() => {
    const panel = rightPanelRef.current;
    if (panel) {
      if (rightPanelState.isOpen) {
        panel.resize(30);
      } else {
        panel.collapse();
      }
    }
  }, [rightPanelState.isOpen]);

  const isTaskPage = !!(path.length > 2 && path[2] === "task" && path[3]);

  if (isMobile) {
    return (
      <MobileNavigationBar disableBottomPadding={isTaskPage}>
        {children}
      </MobileNavigationBar>
    );
  }

  if(path.length > 2 && path[2] == "meet") {
    return children;
  }

  return (
    <DesktopNavigationBar>
      <ResizablePanelGroup
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
          defaultSize={rightPanelState.isOpen ? 70 : 100}
          minSize={30}
          id="main-panel"
          order={1}
          className={cn(
            "h-full relative w-full min-w-0 overflow-x-hidden",
            isDragging ? "transition-none" : "transition-[flex-basis] duration-75 ease-out"
          )}
        >
          <PageTransition>
            {children}
          </PageTransition>
        </ResizablePanel>
        <ResizableHandle withHandle={true} className={rightPanelState.isOpen ? "" : "hidden"} onDragging={setIsDragging} />
        <ResizablePanel
          ref={rightPanelRef}
          defaultSize={rightPanelState.isOpen ? Math.min(32, 60) : 0}
          collapsible={!rightPanelState.isOpen}
          collapsedSize={0}
          minSize={32}
          maxSize={60}
          id="right-panel"
          order={2}
          className={`relative overflow-x-hidden flex justify-end ${
            isDragging ? "transition-none" : "transition-[flex-basis,opacity] duration-75 ease-out"
          } ${
            rightPanelState.isOpen ? "opacity-100" : "opacity-0"
          }`}
        >
          {/* Content for the right panel */}
          <div className="absolute right-0 top-0 h-full w-full min-w-[320px] overflow-y-auto">
            <RightPanel />
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>

    </DesktopNavigationBar>
  );
}

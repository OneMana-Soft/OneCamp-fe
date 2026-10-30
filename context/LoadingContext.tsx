"use client"

import React, { createContext, useState, useEffect, useSyncExternalStore } from 'react';
import { cn } from "@/lib/utils/helpers/cn";
import {loadingBus} from "@/lib/utils/loadingBus";
import { heldOnServer, holdStore } from "@/lib/holdStore";

interface LoadingContextType {
  activeRequests: number;
  startRequest: () => void;
  endRequest: () => void;
}

const LoadingContext = createContext<LoadingContextType | undefined>(undefined);

// How many sheet bars are on screen. While one is, the window-wide fallback
// stays away: the bar belongs on the sheet's edge (design v3, shell §L2), and
// the window's top is only for the moments with no sheet (the splash).
const sheetBars = holdStore();

/** Whether a wait is in progress, from the app's HTTP client. */
function useLoadingBus(): boolean {
  const [active, setActive] = useState(false);
  useEffect(() => loadingBus.subscribe(setActive), []);
  return active;
}

export const LoadingProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const active = useLoadingBus();
  const onSheet = useSyncExternalStore(sheetBars.subscribe, sheetBars.held, heldOnServer);

  return (
    <LoadingContext.Provider value={{ activeRequests: active ? 1 : 0, startRequest: () => {}, endRequest: () => {} }}>
      {children}
      {!onSheet && <GlobalProgressBar active={active} />}
    </LoadingContext.Provider>
  );
};

// Only a wait someone would notice shows the bar. It started with every
// request, background refreshes included, so a quick page flashed a line on
// most clicks: motion that said "slow" about things that weren't.
export const PROGRESS_BAR_DELAY_MS = 300;

/** True once a wait has lasted PROGRESS_BAR_DELAY_MS, false the moment it ends. */
function useShownAfterDelay(active: boolean): boolean {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    if (!active) {
      setShown(false);
      return;
    }
    const timer = setTimeout(() => setShown(true), PROGRESS_BAR_DELAY_MS);
    return () => clearTimeout(timer);
  }, [active]);
  return shown;
}

/**
 * The bar itself (design v3, shell §L2): 2px, a brand light 40% wide
 * travelling left to right over 1.2s, on transform only. "Work is happening
 * for you" is state, which the accent may mark. It fades out over 200ms.
 */
function ProgressSweep({ shown, className }: { shown: boolean; className?: string }) {
  return (
    <div aria-hidden data-shown={shown} className={cn("sheet-progress", className)}>
      {shown && <i data-progress-bar="" />}
    </div>
  );
}

/**
 * The progress bar on the sheet's top edge, 12px in from its radius and
 * clipped by it. The shell mounts it as the first child of the sheet (which
 * is position: relative with overflow hidden), and on a phone under the top
 * bar. While it is mounted, the window-wide fallback stays hidden.
 */
export function SheetProgressBar({ className }: { className?: string }) {
  const active = useLoadingBus();
  const shown = useShownAfterDelay(active);
  useEffect(() => sheetBars.hold(), []);
  return <ProgressSweep shown={shown} className={className} />;
}

/** The fallback with no sheet on screen: the same bar along the window's top. */
export const GlobalProgressBar: React.FC<{ active: boolean }> = ({ active }) => {
  const shown = useShownAfterDelay(active);
  return <ProgressSweep shown={shown} className="!fixed !left-0 !right-0 !top-0 !rounded-none !z-[9999]" />;
};

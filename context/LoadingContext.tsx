"use client"

import React, { createContext, useState, useEffect } from 'react';
import { cn } from "@/lib/utils/helpers/cn";

interface LoadingContextType {
  activeRequests: number;
  startRequest: () => void;
  endRequest: () => void;
}

const LoadingContext = createContext<LoadingContextType | undefined>(undefined);

import {loadingBus} from "@/lib/utils/loadingBus";

export const LoadingProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [active, setActive] = useState(false);

  useEffect(() => {
    return loadingBus.subscribe((isLoading) => {
        setActive(isLoading);
    });
  }, []);

  return (
    <LoadingContext.Provider value={{ activeRequests: active ? 1 : 0, startRequest: () => {}, endRequest: () => {} }}>
      {children}
      <GlobalProgressBar active={active} />
    </LoadingContext.Provider>
  );
};

// Only a wait someone would notice shows the bar. It started with every
// request, background refreshes included, so a quick page flashed a glowing
// blue line on most clicks: motion that said "slow" about things that weren't.
export const PROGRESS_BAR_DELAY_MS = 300;

// CSS rather than an animation library: this bar is on every page, and the
// library it used was most of a chunk every page had to load first. It is
// neutral (DESIGN.md: progress is neutral) and scales a full-width bar
// rather than growing its width, so drawing it costs no layout.
export const GlobalProgressBar: React.FC<{ active: boolean }> = ({ active }) => {
  // Each time a wait becomes visible, the bar starts again from nothing.
  const [run, setRun] = useState(0);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    if (!active) {
      setShown(false);
      return;
    }
    const timer = setTimeout(() => {
      setShown(true);
      setRun((n) => n + 1);
    }, PROGRESS_BAR_DELAY_MS);
    return () => clearTimeout(timer);
  }, [active]);
  return (
    <div
      aria-hidden
      className={cn(
        "pointer-events-none fixed top-0 left-0 right-0 z-[9999] h-0.5 bg-transparent transition-opacity duration-200",
        shown ? "opacity-100" : "opacity-0",
      )}
    >
      {run > 0 && (
        <div
          key={run}
          data-progress-bar=""
          className="h-full w-full origin-left animate-load-progress bg-foreground/30 motion-reduce:animate-none motion-reduce:scale-x-50"
        />
      )}
    </div>
  );
};

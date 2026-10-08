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

// CSS rather than an animation library: this bar is on every page, and the
// library it used was most of a chunk every page had to load first.
const GlobalProgressBar: React.FC<{ active: boolean }> = ({ active }) => {
  // Each time loading starts, the bar starts again from nothing.
  const [run, setRun] = useState(0);
  useEffect(() => {
    if (active) setRun((n) => n + 1);
  }, [active]);
  return (
    <div
      aria-hidden
      className={cn(
        "pointer-events-none fixed top-0 left-0 right-0 z-[9999] h-1 bg-transparent transition-opacity duration-200",
        active ? "opacity-100" : "opacity-0",
      )}
    >
      {run > 0 && (
        <div
          key={run}
          className="h-full w-0 animate-load-progress bg-blue-600 shadow-[0_0_10px_rgba(37,99,235,0.5)] motion-reduce:w-1/2 motion-reduce:animate-none"
        />
      )}
    </div>
  );
};

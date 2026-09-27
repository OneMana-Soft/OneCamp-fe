"use client"

import React, { createContext, useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

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

const GlobalProgressBar: React.FC<{ active: boolean }> = ({ active }) => {
  return (
    <AnimatePresence>
      {active && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed top-0 left-0 right-0 z-[9999] h-1 bg-transparent"
        >
          <motion.div
            className="h-full bg-blue-600 shadow-[0_0_10px_rgba(37,99,235,0.5)]"
            initial={{ width: "0%" }}
            animate={{ 
              width: ["0%", "30%", "60%", "90%"],
              transition: { 
                times: [0, 0.2, 0.5, 0.8],
                duration: 10,
                ease: "linear"
              } 
            }}
          />
        </motion.div>
      )}
    </AnimatePresence>
  );
};

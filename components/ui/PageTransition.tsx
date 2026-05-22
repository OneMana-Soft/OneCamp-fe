"use client"

import { usePathname } from "next/navigation"

interface PageTransitionProps {
  children: React.ReactNode
}

/**
 * REMOVED: Framer Motion page transitions
 * 
 * Root cause of slow navigation:
 * - AnimatePresence mode="popLayout" kept old page mounted during 450ms exit
 * - FrozenRoute froze router context, blocking data fetching
 * - position: absolute + overflow-hidden caused layout thrashing
 * - Total delay: 500-900ms per navigation
 * 
 * Notion-style: instant page switches, no animations.
 * The app feels faster without transitions.
 */
export const PageTransition = ({ children }: PageTransitionProps) => {
  return (
    <div className="h-full w-full bg-background">
      {children}
    </div>
  )
}
